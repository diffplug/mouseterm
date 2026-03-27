import * as vscode from 'vscode';
import * as ptyManager from './pty-manager';
import { AlarmManager, type SessionStatus } from '../../lib/src/lib/alarm-manager';
import type { PersistedSession } from '../../lib/src/lib/session-types';
import type { WebviewMessage, ExtensionMessage } from './message-types';
import { log } from './log';

// Global set of PTY IDs claimed by any router instance.
// Prevents reconnecting routers from stealing PTYs owned by other webviews.
const globalOwnedPtyIds = new Set<string>();
const activeRouters = new Set<{ flushSessionSave(timeoutMs?: number): Promise<void> }>();
let nextFlushRequestId = 0;

// Shared alarm manager — survives router disposal so alarm state persists
// across webview collapse/expand cycles.
const alarmManager = new AlarmManager();

// Log all alarm state transitions (including timer-driven ones)
alarmManager.onStateChange((id, state) => {
  log.info(`[alarm] ${id}: → ${state.status} (todo=${state.todo})`);
});

// Feed PTY data to the alarm manager so it can track activity.
// This is module-level so it runs regardless of webview visibility.
ptyManager.addCallbacks({
  onData(id: string) {
    const before = alarmManager.getState(id).status;
    alarmManager.onData(id);
    const after = alarmManager.getState(id).status;
    if (before !== after) {
      log.info(`[alarm-feed] ${id}: ${before} → ${after}`);
    }
  },
  onExit(id: string) {
    log.info(`[alarm-feed] ${id}: PTY exited`);
    alarmManager.onExit(id);
  },
});

export function getAlarmStates() {
  return alarmManager.getAllStates();
}

export async function flushAllSessions(timeoutMs = 1000): Promise<void> {
  await Promise.all([...activeRouters].map((router) => router.flushSessionSave(timeoutMs)));
}

export function attachRouter(
  webview: vscode.Webview,
  options?: {
    reconnect?: boolean;
    killOnDispose?: boolean;
    onSaveState?: (state: unknown) => void;
    savedSession?: PersistedSession | null;
  },
): vscode.Disposable {
  const reconnect = options?.reconnect ?? false;
  const killOnDispose = options?.killOnDispose ?? false;

  // Track which PTY IDs were spawned (or reconnected) through this webview
  const ownedPtyIds = new Set<string>();
  const pendingFlushRequests = new Map<string, { resolve: () => void; timeout: ReturnType<typeof setTimeout> }>();
  let disposed = false;

  // Webview-facing subscriptions — only active when the webview has live content.
  // Subscribed on mouseterm:init, unsubscribed when webview content is gone.
  let disconnectWebview: (() => void) | null = null;

  function claim(id: string): void {
    ownedPtyIds.add(id);
    globalOwnedPtyIds.add(id);
  }

  function release(id: string): void {
    ownedPtyIds.delete(id);
    globalOwnedPtyIds.delete(id);
  }

  function resolveFlushRequest(requestId: string): void {
    const pending = pendingFlushRequests.get(requestId);
    if (!pending) return;
    pendingFlushRequests.delete(requestId);
    clearTimeout(pending.timeout);
    pending.resolve();
  }

  function resolveAllFlushRequests(): void {
    for (const requestId of [...pendingFlushRequests.keys()]) {
      resolveFlushRequest(requestId);
    }
  }

  function flushSessionSave(timeoutMs = 1000): Promise<void> {
    if (disposed || !disconnectWebview) return Promise.resolve();

    const requestId = `flush-${++nextFlushRequestId}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pendingFlushRequests.delete(requestId);
        resolve();
      }, timeoutMs);

      pendingFlushRequests.set(requestId, {
        resolve,
        timeout,
      });

      void webview.postMessage({ type: 'mouseterm:flushSessionSave', requestId } satisfies ExtensionMessage);
    });
  }

  /**
   * Subscribe PTY data and alarm state forwarding to the webview.
   * Called when the webview sends mouseterm:init (proving it has live content).
   * Returns a cleanup function that unsubscribes everything.
   */
  function connectWebview(): () => void {
    const removePtyCallbacks = ptyManager.addCallbacks({
      onData(id: string, data: string) {
        if (!ownedPtyIds.has(id)) return;
        webview.postMessage({ type: 'pty:data', id, data } satisfies ExtensionMessage);
      },
      onExit(id: string, exitCode: number) {
        if (!ownedPtyIds.has(id)) return;
        webview.postMessage({ type: 'pty:exit', id, exitCode } satisfies ExtensionMessage);
      },
    });

    const removeAlarmListener = alarmManager.onStateChange((id, state) => {
      if (!ownedPtyIds.has(id)) return;
      webview.postMessage({
        type: 'alarm:state', id, status: state.status, todo: state.todo, attentionDismissedRing: state.attentionDismissedRing,
      } satisfies ExtensionMessage);
    });

    return () => {
      removePtyCallbacks();
      removeAlarmListener();
    };
  }

  // Route webview messages to the PTY manager
  const messageDisposable = webview.onDidReceiveMessage((msg: WebviewMessage) => {
    switch (msg.type) {
      case 'pty:spawn': {
        claim(msg.id);
        const spawnOptions = { ...msg.options };
        if (!spawnOptions.cwd) {
          spawnOptions.cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        }
        ptyManager.spawn(msg.id, spawnOptions);
        break;
      }
      case 'pty:input':
        ptyManager.write(msg.id, msg.data);
        break;
      case 'pty:resize':
        ptyManager.resize(msg.id, msg.cols, msg.rows);
        break;
      case 'pty:kill':
        release(msg.id);
        ptyManager.kill(msg.id);
        break;
      case 'pty:getCwd':
        ptyManager.getCwd(msg.id).then((cwd) => {
          webview.postMessage({ type: 'pty:cwd', id: msg.id, cwd, requestId: msg.requestId } satisfies ExtensionMessage);
        });
        break;
      case 'pty:getScrollback':
        webview.postMessage({
          type: 'pty:scrollback', id: msg.id,
          data: ptyManager.getScrollback(msg.id),
          requestId: msg.requestId,
        } satisfies ExtensionMessage);
        break;
      case 'mouseterm:init': {
        // Webview has (re-)initialized — subscribe to live events.
        // Tear down previous subscriptions first (webview was destroyed and recreated).
        disconnectWebview?.();
        disconnectWebview = connectWebview();

        if (!reconnect) {
          // Fresh instance — no existing PTYs to restore
          webview.postMessage({ type: 'pty:list', ptys: [] } satisfies ExtensionMessage);
          break;
        }
        // Snapshot IDs owned before claiming so we can choose the right data source below
        const previouslyOwned = new Set(ownedPtyIds);

        const ptys = ptyManager.getBufferedPtys();
        const reconnectable = new Map<string, { alive: boolean; exitCode?: number }>();

        // Re-serve PTYs this router already owns (webview content was recreated,
        // e.g. WebviewView collapsed then re-expanded — resolveWebviewView is NOT
        // called again, so the same router persists with its owned IDs still set)
        for (const id of previouslyOwned) {
          const info = ptys.get(id);
          if (info) {
            reconnectable.set(id, info);
          }
        }

        // Also claim unowned PTYs (from disposed routers / other webviews)
        for (const [id, info] of ptys) {
          if (!globalOwnedPtyIds.has(id)) {
            claim(id);
            reconnectable.set(id, info);
          }
        }

        // Cold-start restore: this router has no live PTYs to reconnect,
        // but has a saved session. Seed the AlarmManager so freshly-spawned
        // PTYs get the right alarm state. Check reconnectable (not ptys)
        // because other routers may own PTYs in the global pool.
        if (reconnectable.size === 0 && options?.savedSession) {
          for (const pane of options.savedSession.panes) {
            if (!globalOwnedPtyIds.has(pane.id)) {
              claim(pane.id);
            }
            if (pane.alarm) {
              alarmManager.restore(pane.id, pane.alarm);
            }
          }
        }

        const list: ExtensionMessage = {
          type: 'pty:list',
          ptys: Array.from(reconnectable.entries()).map(([id, info]) => ({
            id, alive: info.alive, exitCode: info.exitCode,
          })),
        };
        webview.postMessage(list);
        // Send replay/scrollback data for each reconnectable PTY
        for (const [id] of reconnectable) {
          // For already-owned PTYs the replay buffer was consumed on first connect,
          // so use scrollback (full history, never cleared).
          // For newly-claimed PTYs use replay (all data since spawn, clears buffer).
          const data = previouslyOwned.has(id)
            ? ptyManager.getScrollback(id)
            : ptyManager.getReplayData(id);
          if (data) {
            const replay: ExtensionMessage = { type: 'pty:replay', id, data };
            webview.postMessage(replay);
          }
        }
        // Send current alarm state for all reconnectable PTYs
        for (const [id] of reconnectable) {
          const alarmState = alarmManager.getState(id);
          log.info(`[alarm-reconnect] ${id}: sending ${alarmState.status} (todo=${alarmState.todo})`);
          webview.postMessage({
            type: 'alarm:state', id, status: alarmState.status, todo: alarmState.todo, attentionDismissedRing: alarmState.attentionDismissedRing,
          } satisfies ExtensionMessage);
        }
        break;
      }
      case 'mouseterm:flushSessionSaveDone':
        resolveFlushRequest(msg.requestId);
        break;
      case 'mouseterm:saveState':
        options?.onSaveState?.(msg.state);
        break;

      // Alarm actions — proxy to the shared alarm manager
      case 'alarm:remove':
        alarmManager.remove(msg.id);
        break;
      case 'alarm:toggle':
        alarmManager.toggleAlarm(msg.id);
        break;
      case 'alarm:disable':
        alarmManager.disableAlarm(msg.id);
        break;
      case 'alarm:dismiss':
        alarmManager.dismissAlarm(msg.id);
        break;
      case 'alarm:dismissOrToggle':
        alarmManager.dismissOrToggleAlarm(msg.id, msg.displayedStatus as SessionStatus);
        break;
      case 'alarm:attend':
        alarmManager.attend(msg.id);
        break;
      case 'alarm:resize':
        alarmManager.onResize(msg.id);
        break;
      case 'alarm:clearAttention':
        alarmManager.clearAttention(msg.id);
        break;
      case 'alarm:toggleTodo':
        alarmManager.toggleTodo(msg.id);
        break;
      case 'alarm:markTodo':
        alarmManager.markTodo(msg.id);
        break;
      case 'alarm:promoteTodo':
        alarmManager.promoteTodo(msg.id);
        break;
      case 'alarm:clearTodo':
        alarmManager.clearTodo(msg.id);
        break;
      case 'alarm:softTodo':
        alarmManager.softTodo(msg.id);
        break;
    }
  });

  const router = {
    flushSessionSave,
    dispose() {
      if (disposed) return;
      disposed = true;
      activeRouters.delete(router);
      resolveAllFlushRequests();
      disconnectWebview?.();
      disconnectWebview = null;
      for (const id of ownedPtyIds) {
        globalOwnedPtyIds.delete(id);
        if (killOnDispose) ptyManager.kill(id);
      }
      ownedPtyIds.clear();
      messageDisposable.dispose();
    },
  };

  activeRouters.add(router);
  return router;
}
