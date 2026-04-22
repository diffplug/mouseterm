import * as vscode from 'vscode';
import * as ptyManager from './pty-manager';
import type { AlertState } from '../../lib/src/lib/alert-manager';
import type { PersistedAlertState, PersistedPane, PersistedSession } from '../../lib/src/lib/session-types';
import { log } from './log';

const SESSION_STATE_KEY = 'mouseterm.session';

export function isPersistedSession(value: unknown): value is PersistedSession {
  if (!value || typeof value !== 'object') return false;
  const maybeSession = value as Partial<PersistedSession>;
  return maybeSession.version === 1 && Array.isArray(maybeSession.panes);
}

export function getSavedSessionState(context: vscode.ExtensionContext): PersistedSession | null {
  const saved = context.workspaceState.get<unknown>(SESSION_STATE_KEY);
  return isPersistedSession(saved) ? saved : null;
}

export function saveSessionState(context: vscode.ExtensionContext, state: unknown): Thenable<void> {
  return context.workspaceState.update(SESSION_STATE_KEY, state);
}

/**
 * Merge current alert states into a session state object from the frontend.
 * Called on every periodic save so alert data is always current in workspaceState,
 * rather than relying on deactivate (which may not complete).
 */
export function mergeAlertStates(state: unknown, alertStates: Map<string, AlertState>): unknown {
  if (!isPersistedSession(state)) return state;
  return {
    ...state,
    panes: state.panes.map((pane) => {
      const alert = alertStates.get(pane.id);
      return {
        ...pane,
        alert: alert
          ? { status: alert.status, todo: alert.todo }
          : pane.alert ?? null,
      };
    }),
  };
}

export async function refreshSavedSessionStateFromPtys(
  context: vscode.ExtensionContext,
  alertStates?: Map<string, AlertState>,
): Promise<void> {
  const saved = getSavedSessionState(context);
  if (!saved) {
    log.info('[session] refreshFromPtys: no saved session, skipping');
    return;
  }

  const ptys = ptyManager.getBufferedPtys();
  log.info(`[session] refreshFromPtys: ${saved.panes.length} saved panes, ${ptys.size} live PTYs`);

  const panes = await Promise.all(
    saved.panes.map(async (pane) => {
      // Capture alert state regardless of PTY liveness
      const alertState = alertStates?.get(pane.id);
      const alert: PersistedAlertState | null = alertState
        ? { status: alertState.status, todo: alertState.todo }
        : pane.alert ?? null;

      if (!ptys.has(pane.id)) {
        log.info(`[session] ${pane.id}: not in live PTYs, keeping saved cwd=${pane.cwd}`);
        return { ...pane, alert };
      }

      const [cwd, scrollback] = await Promise.all([
        ptyManager.getCwd(pane.id),
        Promise.resolve(ptyManager.getScrollback(pane.id)),
      ]);

      log.info(`[session] ${pane.id}: live PTY cwd=${cwd} scrollback=${scrollback ? scrollback.length + ' chars' : 'null'}`);

      return {
        ...pane,
        cwd: cwd ?? pane.cwd ?? null,
        scrollback: scrollback ?? pane.scrollback ?? null,
        alert,
      };
    }),
  );

  await saveSessionState(context, {
    ...saved,
    panes,
  });
  log.info(`[session] refreshFromPtys: saved ${panes.length} panes`);
}
