export type { SessionStatus } from './activity-monitor';
export type { TodoState, AlertButtonActionResult } from './alert-manager';
export type { ActivityState } from './session-activity-store';
export type { TerminalEntry, TerminalOverlayDims } from './terminal-store';

export {
  clearPrimedActivity,
  clearSessionAttention,
  clearSessionTodo,
  DEFAULT_ACTIVITY_STATE,
  disableSessionAlert,
  dismissOrToggleAlert,
  dismissSessionAlert,
  getActivity,
  getActivitySnapshot,
  getLivePersistedAlertState,
  initAlertStateReceiver,
  markSessionAttention,
  markSessionTodo,
  primeActivity,
  subscribeToActivity,
  toggleSessionAlert,
  toggleSessionTodo,
} from './session-activity-store';

export { resolveTerminalSessionId } from './terminal-store';

export {
  disposeAllSessions,
  disposeSession,
  focusSession,
  getOrCreateTerminal,
  getTerminalInstance,
  getTerminalOverlayDims,
  mountElement,
  refitSession,
  restoreTerminal,
  resumeTerminal,
  setPendingShellOpts,
  swapTerminals,
  unmountElement,
} from './terminal-lifecycle';

export { setDefaultShellOpts, getDefaultShellOpts } from './shell-defaults';
