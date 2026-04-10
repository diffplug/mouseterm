import { useSyncExternalStore } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import type { UpdateBannerState } from './UpdateBanner';

// --- State ---

const STORAGE_KEY = 'mouseterm:update-result';

let state: UpdateBannerState = { status: 'idle' };
let pendingUpdate: Update | null = null;
let currentVersion = '';

const listeners = new Set<() => void>();

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
        setState({ status: 'post-update-failure', version: marker.version });
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
