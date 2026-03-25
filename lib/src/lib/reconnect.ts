import type { PlatformAdapter, PtyInfo } from './platform/types';
import { reconnectTerminal } from './terminal-registry';
import type { PersistedDetachedItem } from './session-types';
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
      resolve({ paneIds: ids, detached: [] });
    }

    platform.onPtyList(handleList);
    platform.onPtyReplay(handleReplay);
    platform.requestInit();
  });
}
