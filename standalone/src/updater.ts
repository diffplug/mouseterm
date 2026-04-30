import { useSyncExternalStore } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import type { UpdateBannerState } from './UpdateBanner';

export const GITHUB_REPO_URL = 'https://github.com/diffplug/mouseterm';

export interface DebugReport {
  fromVersion: string;
  toVersion: string;
  platform: string;
  error: string;
  logTail: string;
  /** Markdown body, ready to paste into a GitHub issue. */
  body: string;
}

// --- State ---

const STORAGE_KEY = 'mouseterm:update-result';

let state: UpdateBannerState = { status: 'idle' };
let pendingUpdate: Update | null = null;
let currentVersion = '';

const listeners = new Set<() => void>();

function shouldSkipInstallInDev(): boolean {
  return import.meta.env.DEV && import.meta.env.MODE !== 'test';
}

function setState(next: UpdateBannerState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): UpdateBannerState {
  return state;
}

export function useUpdateState(): UpdateBannerState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// --- Actions ---

export function dismissBanner(): void {
  setState({ status: 'dismissed' });
}

export function openChangelog(): void {
  open('https://mouseterm.com/changelog').catch((e) =>
    console.error('[updater] Failed to open changelog:', e),
  );
}

function detectPlatform(): string {
  const data = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  if (data?.platform) return data.platform;
  return navigator.platform || navigator.userAgent || 'unknown';
}

export async function buildDebugReport(
  error: string,
  toVersion: string,
): Promise<DebugReport> {
  let fromVersion = '';
  try {
    fromVersion = await getVersion();
  } catch {
    // Best-effort; leave blank.
  }

  let logTail = '';
  try {
    logTail = await invoke<string>('read_update_log');
  } catch (e) {
    logTail = `(failed to read log: ${String(e)})`;
  }

  const platform = detectPlatform();
  const body = [
    `**App version**: ${fromVersion} → ${toVersion}`,
    `**Platform**: ${platform}`,
    `**Error**: ${error}`,
    '',
    '**Recent log:**',
    '```',
    logTail.trimEnd(),
    '```',
    '',
  ].join('\n');

  return { fromVersion, toVersion, platform, error, logTail, body };
}

export function openIssueSearch(error: string): void {
  // First ~80 chars of the error, no quoting — lets GitHub fuzzy-match.
  const keywords = error.slice(0, 80);
  const url = `${GITHUB_REPO_URL}/issues?q=is%3Aissue+${encodeURIComponent(keywords)}`;
  open(url).catch((e) => console.error('[updater] Failed to open issue search:', e));
}

export function openNewIssue(): void {
  open(`${GITHUB_REPO_URL}/issues/new`).catch((e) =>
    console.error('[updater] Failed to open new issue:', e),
  );
}

// --- Lifecycle ---

export function startUpdateCheck(): void {
  void runUpdateCheck();
}

async function runUpdateCheck(): Promise<void> {
  try {
    currentVersion = await getVersion();
  } catch {
    currentVersion = '';
  }

  // Check for post-install markers from a previous session
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      localStorage.removeItem(STORAGE_KEY);
      const marker = JSON.parse(raw);
      if (marker.failed) {
        setState({
          status: 'post-update-failure',
          version: marker.version,
          error: marker.error,
        });
      } else if (marker.from && marker.to) {
        setState({ status: 'post-update-success', from: marker.from, to: marker.to });
        setTimeout(() => {
          if (state.status === 'post-update-success') {
            setState({ status: 'idle' });
          }
        }, 10_000);
      }
    }
  } catch {
    // Corrupt marker — ignore
  }

  // Wait 5 seconds, then check for updates
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  try {
    const update = await check();
    if (!update) {
      registerCloseHandler();
      return;
    }

    await update.download();
    pendingUpdate = update;
    setState({ status: 'downloaded', version: update.version });
  } catch (e) {
    console.error('[updater] Check/download failed:', e);
  }

  registerCloseHandler();
}

// --- Test support ---

/** @internal Reset all module state for testing. */
export function _resetForTesting(): void {
  state = { status: 'idle' };
  pendingUpdate = null;
  currentVersion = '';
  closeHandlerRegistered = false;
  listeners.clear();
}

// --- Quit-time install ---

let closeHandlerRegistered = false;

function registerCloseHandler(): void {
  if (closeHandlerRegistered) return;
  closeHandlerRegistered = true;

  getCurrentWindow().onCloseRequested(async (event) => {
    if (!pendingUpdate) return;

    if (shouldSkipInstallInDev()) {
      console.warn('[updater] Skipping update install in dev mode. Use a packaged app to test install.');
      pendingUpdate = null;
      return;
    }

    event.preventDefault();

    try {
      // Write success marker BEFORE install — on Windows, NSIS force-kills the process
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        from: currentVersion,
        to: pendingUpdate.version,
      }));
      await pendingUpdate.install();
    } catch (e) {
      // Overwrite with failure marker
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        failed: true,
        version: pendingUpdate!.version,
        error: String(e),
      }));
      console.error('[updater] Install failed:', e);
    }

    pendingUpdate = null;
    await getCurrentWindow().close();
  });
}
