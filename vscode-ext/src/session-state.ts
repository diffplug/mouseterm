import * as vscode from 'vscode';
import * as ptyManager from './pty-manager';
import type { AlarmState } from '../../lib/src/lib/alarm-manager';
import type { PersistedAlarmState, PersistedPane, PersistedSession } from '../../lib/src/lib/session-types';
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
 * Merge current alarm states into a session state object from the frontend.
 * Called on every periodic save so alarm data is always current in workspaceState,
 * rather than relying on deactivate (which may not complete).
 */
export function mergeAlarmStates(state: unknown, alarmStates: Map<string, AlarmState>): unknown {
  if (!isPersistedSession(state)) return state;
  return {
    ...state,
    panes: state.panes.map((pane) => {
      const alarm = alarmStates.get(pane.id);
      return {
        ...pane,
        alarm: alarm
          ? { status: alarm.status, todo: alarm.todo }
          : pane.alarm ?? null,
      };
    }),
  };
}

export async function refreshSavedSessionStateFromPtys(
  context: vscode.ExtensionContext,
  alarmStates?: Map<string, AlarmState>,
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
      // Capture alarm state regardless of PTY liveness
      const alarmState = alarmStates?.get(pane.id);
      const alarm: PersistedAlarmState | null = alarmState
        ? { status: alarmState.status, todo: alarmState.todo }
        : pane.alarm ?? null;

      if (!ptys.has(pane.id)) {
        log.info(`[session] ${pane.id}: not in live PTYs, keeping saved cwd=${pane.cwd}`);
        return { ...pane, alarm };
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
        alarm,
      };
    }),
  );

  await saveSessionState(context, {
    ...saved,
    panes,
  });
  log.info(`[session] refreshFromPtys: saved ${panes.length} panes`);
}
