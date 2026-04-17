import type { PlatformAdapter, PtyInfo } from './platform/types';
import { reconnectTerminal } from './terminal-registry';
import type { PersistedDetachedItem, PersistedSession } from './session-types';
import { restoreSession } from './session-restore';

export interface ReconnectResult {
  paneIds: string[];
  layout?: unknown; // dockview SerializedDockview, only present on cold-start restore
  detached?: PersistedDetachedItem[];
}

/**
 * Attempt to reconnect to live PTYs, or restore from saved session.
 *
 * Priority:
 * 1. Live PTYs (webview was hidden/shown) → reconnect with replay data
 * 2. Saved session (app restarted) → restore with saved scrollback + cwd
 * 3. Neither → return empty (Pond creates a fresh terminal)
 */
export async function reconnectFromInit(platform: PlatformAdapter): Promise<ReconnectResult> {
  // First, try to reconnect to live PTYs
  const liveResult = await reconnectLivePtys(platform);
  if (liveResult.paneIds.length > 0) return liveResult;

  // No live PTYs — try saved session restore
  const restored = await restoreSession(platform);
  if (restored) return restored;

  return { paneIds: [] };
}

function reconnectLivePtys(platform: PlatformAdapter): Promise<ReconnectResult> {
  return new Promise<ReconnectResult>((resolve) => {
    const replayBuffer = new Map<string, string>();
    let ptyList: PtyInfo[] | null = null;

    const timeout = setTimeout(() => finish(), 500);

    const handleList = (detail: { ptys: PtyInfo[] }) => {
      ptyList = detail.ptys;
      if (ptyList.length === 0) {
        finish();
      }
    };

    const handleReplay = (detail: { id: string; data: string }) => {
      replayBuffer.set(detail.id, detail.data);
      if (ptyList && replayBuffer.size >= ptyList.length) {
        finish();
      }
    };

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      platform.offPtyList(handleList);
      platform.offPtyReplay(handleReplay);

      if (!ptyList || ptyList.length === 0) {
        resolve({ paneIds: [] });
        return;
      }

      const ids: string[] = [];
      for (const pty of ptyList) {
        reconnectTerminal(pty.id, replayBuffer.get(pty.id) ?? null, {
          alive: pty.alive,
          exitCode: pty.exitCode,
        });
        ids.push(pty.id);
      }
      // Pull saved visible/detached state so reconnect (e.g. after panel
      // close/reopen) restores splits and doors instead of stacking every live
      // PTY into one tab group.
      const savedPlan = getSavedLiveReconnectPlan(platform.getState(), ids);
      if (savedPlan) {
        resolve(savedPlan);
        return;
      }

      resolve({ paneIds: ids, detached: [] });
    }

    platform.onPtyList(handleList);
    platform.onPtyReplay(handleReplay);
    platform.requestInit();
  });
}

function getSavedLiveReconnectPlan(savedState: unknown, liveIds: string[]): ReconnectResult | null {
  const saved = savedState as PersistedSession | null;
  if (!saved || saved.version !== 1 || !Array.isArray(saved.panes)) return null;

  // Reuse persisted visible/detached state only when every live PTY is covered
  // by the saved session. Extra saved panes can be stale, but extra live panes
  // have no reliable saved layout position.
  const liveSet = new Set(liveIds);
  const savedSet = new Set(saved.panes.map((p) => p.id));
  if (!liveIds.every((id) => savedSet.has(id))) return null;

  const detached = (saved.detached ?? []).filter((item) => liveSet.has(item.id));
  const detachedIds = new Set(detached.map((item) => item.id));
  const paneIds = saved.panes
    .filter((pane) => liveSet.has(pane.id) && !detachedIds.has(pane.id))
    .map((pane) => pane.id);
  const layoutPanelIds = getLayoutPanelIds(saved.layout);
  const layoutMatchesVisiblePanes =
    !!layoutPanelIds &&
    layoutPanelIds.length === paneIds.length &&
    layoutPanelIds.every((id) => paneIds.includes(id));

  return {
    paneIds,
    detached,
    layout: layoutMatchesVisiblePanes ? saved.layout : undefined,
  };
}

function getLayoutPanelIds(layout: unknown): string[] | null {
  if (!layout || typeof layout !== 'object') return null;
  const panels = (layout as { panels?: unknown }).panels;
  if (!panels || typeof panels !== 'object' || Array.isArray(panels)) return null;
  return Object.keys(panels);
}
