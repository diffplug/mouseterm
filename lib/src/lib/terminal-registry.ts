import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getPlatform } from './platform';
import type { SessionStatus } from './activity-monitor';
import { TODO_OFF, isSoftTodo, type TodoState, type AlarmButtonActionResult } from './alarm-manager';
import type { AlarmStateDetail } from './platform/types';
import type { PersistedAlarmState } from './session-types';
import { attachMouseModeObserver } from './mouse-mode-observer';
import {
  beginDrag,
  bumpRenderTick,
  endDrag,
  getMouseSelectionState,
  isDragging,
  removeMouseSelectionState,
  updateDrag,
} from './mouse-selection';

export type { SessionStatus } from './activity-monitor';
export { TODO_OFF, TODO_SOFT_FULL, TODO_HARD, isSoftTodo, isHardTodo, hasTodo, type TodoState, type AlarmButtonActionResult } from './alarm-manager';

export interface SessionUiState {
  status: SessionStatus;
  todo: TodoState;
}

export const DEFAULT_SESSION_UI_STATE: SessionUiState = {
  status: 'ALARM_DISABLED',
  todo: TODO_OFF,
};

interface TerminalEntry {
  /** Stable PTY/session id this entry was created for */
  ptyId: string;
  terminal: Terminal;
  fit: FitAddon;
  /** Persistent div that xterm.js renders into (created once, reparented as needed) */
  element: HTMLDivElement;
  /** Cleanup function for PTY event listeners */
  cleanup: () => void;
  /** Cached alarm status from the platform's AlarmManager */
  alarmStatus: SessionStatus;
  /** Cached todo state from the platform's AlarmManager */
  todo: TodoState;
  /** Cached flag from the platform's AlarmManager */
  attentionDismissedRing: boolean;
}

const registry = new Map<string, TerminalEntry>();
const pendingShellOpts = new Map<string, { shell?: string; args?: string[] }>();
const primedSessionStates = new Map<string, Partial<SessionUiState>>();

// --- Watch for VSCode theme changes and re-apply xterm themes ---
// VSCode signals theme changes by updating CSS variables and body classes.
let themeObserverStarted = false;
function startThemeObserver(): void {
  if (themeObserverStarted) return;
  themeObserverStarted = true;

  const observer = new MutationObserver(() => {
    const theme = getTerminalTheme();
    for (const entry of registry.values()) {
      entry.terminal.options.theme = theme;
    }
  });

  // Watch body for class changes (vscode-light/dark) and style changes (CSS vars)
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  // Also watch <html> for style attribute changes (some VSCode versions inject there)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

// --- Session state subscription API (for useSyncExternalStore) ---

const sessionStateListeners = new Set<() => void>();
let cachedSnapshot: Map<string, SessionUiState> | null = null;

function notifySessionStateListeners(): void {
  cachedSnapshot = null;
  sessionStateListeners.forEach((listener) => listener());
}

export function subscribeToSessionStateChanges(listener: () => void): () => void {
  sessionStateListeners.add(listener);
  return () => sessionStateListeners.delete(listener);
}

export function getSessionStateSnapshot(): Map<string, SessionUiState> {
  if (cachedSnapshot) return cachedSnapshot;

  const snapshot = new Map<string, SessionUiState>();
  const ids = new Set<string>([...registry.keys(), ...primedSessionStates.keys()]);
  for (const id of ids) {
    const state = readSessionState(id);
    if (state) {
      snapshot.set(id, state);
    }
  }
  cachedSnapshot = snapshot;
  return snapshot;
}

export function getSessionState(id: string): SessionUiState {
  return readSessionState(id) ?? DEFAULT_SESSION_UI_STATE;
}

function readLiveSessionState(id: string): SessionUiState | null {
  const entry = registry.get(id);
  if (!entry) return null;

  return {
    status: entry.alarmStatus,
    todo: entry.todo,
  };
}

function readSessionState(id: string): SessionUiState | null {
  const primedState = primedSessionStates.get(id);
  const liveState = readLiveSessionState(id);

  if (!liveState && !primedState) return null;
  return {
    ...(liveState ?? DEFAULT_SESSION_UI_STATE),
    ...primedState,
  };
}

function getEntryByPtyId(ptyId: string): TerminalEntry | null {
  for (const entry of registry.values()) {
    if (entry.ptyId === ptyId) {
      return entry;
    }
  }
  return null;
}

export function resolveTerminalSessionId(id: string): string {
  return registry.get(id)?.ptyId ?? id;
}

export function getLivePersistedAlarmState(id: string): PersistedAlarmState | null {
  const state = readLiveSessionState(id);
  if (!state) return null;
  return {
    status: state.status,
    todo: state.todo,
  };
}

export function primeSessionState(id: string, state: Partial<SessionUiState>): void {
  primedSessionStates.set(id, state);
  notifySessionStateListeners();
}

export function clearPrimedSessionState(id?: string): void {
  if (id === undefined) {
    if (primedSessionStates.size === 0) return;
    primedSessionStates.clear();
    notifySessionStateListeners();
    return;
  }

  if (!primedSessionStates.delete(id)) return;
  notifySessionStateListeners();
}

// --- Alarm state receiver (from platform's AlarmManager) ---

let currentAlarmHandler: ((detail: AlarmStateDetail) => void) | null = null;

/**
 * Wire up the platform's alarm state events to the local session state store.
 * Call once during startup, before reconnect. Safe to call again after platform reset.
 */
export function initAlarmStateReceiver(): void {
  const platform = getPlatform();
  // Remove previous handler if re-initializing (e.g. after platform reset in tests)
  if (currentAlarmHandler) {
    platform.offAlarmState(currentAlarmHandler);
  }

  currentAlarmHandler = (detail) => {
    const entry = getEntryByPtyId(detail.id);
    if (entry) {
      entry.alarmStatus = detail.status;
      entry.todo = detail.todo;
      entry.attentionDismissedRing = detail.attentionDismissedRing;
      // Clear any primed state now that we have live data
      primedSessionStates.delete(detail.id);
      notifySessionStateListeners();
    } else {
      // Terminal entry not created yet — prime the state so it's ready when it is
      primeSessionState(detail.id, { status: detail.status, todo: detail.todo });
    }
  };
  platform.onAlarmState(currentAlarmHandler);
}

// --- Alarm action delegates (thin wrappers over platform adapter) ---

export function dismissOrToggleAlarm(id: string, displayedStatus: SessionStatus): AlarmButtonActionResult {
  // Compute result locally for synchronous return (same transition table as AlarmManager).
  // The actual state change happens via the platform.
  const entry = registry.get(id);
  let result: AlarmButtonActionResult;
  switch (displayedStatus) {
    case 'ALARM_DISABLED':
      result = 'enabled';
      break;
    case 'ALARM_RINGING':
      result = 'dismissed';
      break;
    default:
      if (entry?.attentionDismissedRing) {
        result = 'dismissed';
        break;
      }
      result = 'disabled';
  }
  getPlatform().alarmDismissOrToggle(resolveTerminalSessionId(id), displayedStatus);
  return result;
}

export function toggleSessionAlarm(id: string): void {
  getPlatform().alarmToggle(resolveTerminalSessionId(id));
}

export function disableSessionAlarm(id: string): void {
  getPlatform().alarmDisable(resolveTerminalSessionId(id));
}

export function dismissSessionAlarm(id: string): void {
  getPlatform().alarmDismiss(resolveTerminalSessionId(id));
}

export function markSessionAttention(id: string): void {
  getPlatform().alarmAttend(resolveTerminalSessionId(id));
}

export function clearSessionAttention(id?: string): void {
  getPlatform().alarmClearAttention(id === undefined ? undefined : resolveTerminalSessionId(id));
}

export function toggleSessionTodo(id: string): void {
  getPlatform().alarmToggleTodo(resolveTerminalSessionId(id));
}

export function markSessionTodo(id: string): void {
  getPlatform().alarmMarkTodo(resolveTerminalSessionId(id));
}

export function clearSessionTodo(id: string): void {
  getPlatform().alarmClearTodo(resolveTerminalSessionId(id));
}

// --- Terminal theme ---

function getTerminalTheme(): Record<string, string> {
  const style = getComputedStyle(document.body);
  const v = (prop: string, fallback: string) => style.getPropertyValue(prop).trim() || fallback;
  return {
    background: v('--vscode-terminal-background', v('--vscode-editor-background', '#1e1e1e')),
    foreground: v('--vscode-terminal-foreground', v('--vscode-editor-foreground', '#cccccc')),
    cursor: v('--vscode-terminalCursor-foreground', '#aeafad'),
    selectionBackground: v('--vscode-terminal-selectionBackground', '#264f7840'),
    black: v('--vscode-terminal-ansiBlack', '#000000'),
    red: v('--vscode-terminal-ansiRed', '#cd3131'),
    green: v('--vscode-terminal-ansiGreen', '#0dbc79'),
    yellow: v('--vscode-terminal-ansiYellow', '#e5e510'),
    blue: v('--vscode-terminal-ansiBlue', '#2472c8'),
    magenta: v('--vscode-terminal-ansiMagenta', '#bc3fbc'),
    cyan: v('--vscode-terminal-ansiCyan', '#11a8cd'),
    white: v('--vscode-terminal-ansiWhite', '#e5e5e5'),
    brightBlack: v('--vscode-terminal-ansiBrightBlack', '#666666'),
    brightRed: v('--vscode-terminal-ansiBrightRed', '#f14c4c'),
    brightGreen: v('--vscode-terminal-ansiBrightGreen', '#23d18b'),
    brightYellow: v('--vscode-terminal-ansiBrightYellow', '#f5f543'),
    brightBlue: v('--vscode-terminal-ansiBrightBlue', '#3b8eea'),
    brightMagenta: v('--vscode-terminal-ansiBrightMagenta', '#d670d6'),
    brightCyan: v('--vscode-terminal-ansiBrightCyan', '#29b8db'),
    brightWhite: v('--vscode-terminal-ansiBrightWhite', '#e5e5e5'),
  };
}

// --- Input analysis ---

function inputContainsPrintableText(data: string): boolean {
  const withoutAnsiSequences = data
    // CSI sequences, including focus/mouse reporting like ESC [ I and ESC [ < ... M
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // SS3 sequences, used by some function/navigation keys
    .replace(/\x1bO[@-~]/g, '')
    // Strip remaining control chars, including bare ESC
    .replace(/[\x00-\x1f\x7f]/g, '');

  return withoutAnsiSequences.length > 0;
}

function inputIsSyntheticTerminalReport(data: string): boolean {
  if (data.length === 0) return false;

  const chunks = data.match(/\x1b\[[0-?]*[ -/]*[@-~]|\x1bO[@-~]|./gs) ?? [];
  if (chunks.length === 0) return false;

  return chunks.every((chunk) => (
    /^\x1b\[[0-?]*[ -/]*[@-~]$/.test(chunk) ||
    /^\x1bO[@-~]$/.test(chunk)
  ));
}

// --- Terminal lifecycle ---

/**
 * Shared setup: create an xterm instance, wire PTY event handlers, register in registry.
 * Does NOT spawn a PTY or write any data — callers handle that.
 */
function setupTerminalEntry(id: string): TerminalEntry {
  const styles = getComputedStyle(document.body);
  const editorFontSize = parseInt(styles.getPropertyValue('--vscode-editor-font-size'), 10) || 12;
  const editorFontFamily = styles.getPropertyValue('--vscode-editor-font-family').trim() || "'SF Mono', Menlo, Monaco, monospace";

  const terminal = new Terminal({
    fontSize: editorFontSize,
    fontFamily: editorFontFamily,
    cursorBlink: true,
    theme: getTerminalTheme(),
  });

  const fit = new FitAddon();
  terminal.loadAddon(fit);

  const element = document.createElement('div');
  element.style.width = '100%';
  element.style.height = '100%';
  terminal.open(element);

  // Wire PTY events
  const handleData = (detail: { id: string; data: string }) => {
    if (detail.id === id) {
      terminal.write(detail.data);
    }
  };
  getPlatform().onPtyData(handleData);

  const handleExit = (detail: { id: string; exitCode: number }) => {
    if (detail.id === id) {
      terminal.write(`\r\n[Process exited with code ${detail.exitCode}]\r\n`);
    }
  };
  getPlatform().onPtyExit(handleExit);

  // User input → PTY + alarm actions
  const inputDisposable = terminal.onData((data) => {
    const isSyntheticTerminalReport = inputIsSyntheticTerminalReport(data);

    if (!isSyntheticTerminalReport) {
      getPlatform().alarmAttend(id);
      const entry = registry.get(id);
      if (entry && isSoftTodo(entry.todo) && inputContainsPrintableText(data)) {
        getPlatform().alarmDrainTodoBucket(id);
      }
    }

    getPlatform().writePty(id, data);
  });

  // Resize → PTY
  const resizeDisposable = terminal.onResize(({ cols, rows }) => {
    getPlatform().alarmResize(id);
    getPlatform().resizePty(id, cols, rows);
    bumpRenderTick();
  });

  // Selection overlay needs to re-measure on scroll/render. One shared tick
  // (not per-terminal) is fine because each overlay subscribes individually.
  const renderDisposable = terminal.onRender(() => bumpRenderTick());

  // Observe DECSET/DECRST for mouse-reporting and bracketed-paste modes.
  const mouseModeObserver = attachMouseModeObserver(id, terminal);

  // Mouse event router. Capture phase so we see events before xterm's own
  // handlers. For now we only OBSERVE — we update our selection state but
  // don't stopPropagation, so xterm's default selection still shows. Once
  // the overlay lands (story C.2) we'll fully take over by stopping events.
  const computeCell = (ev: MouseEvent): { row: number; col: number; startedInScrollback: boolean } => {
    const rect = element.getBoundingClientRect();
    const cellWidth = rect.width / terminal.cols;
    const cellHeight = rect.height / terminal.rows;
    const offsetX = Math.max(0, ev.clientX - rect.left);
    const offsetY = Math.max(0, ev.clientY - rect.top);
    const col = Math.min(terminal.cols - 1, Math.max(0, Math.floor(offsetX / cellWidth)));
    const viewportRow = Math.min(terminal.rows - 1, Math.floor(offsetY / cellHeight));
    const absRow = terminal.buffer.active.viewportY + viewportRow;
    const startedInScrollback = absRow < terminal.buffer.active.baseY;
    return { row: absRow, col, startedInScrollback };
  };

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button !== 0) return; // only left-click starts a selection
    const state = getMouseSelectionState(id);
    const cell = computeCell(ev);
    // Per spec §3.5 and §6.1:
    //  - reporting off: terminal handles
    //  - reporting on + override active: terminal handles
    //  - reporting on + no override + scrollback-origin: terminal handles
    //  - reporting on + no override + live region: inside program handles
    const terminalOwns =
      state.mouseReporting === 'none'
      || state.override !== 'off'
      || cell.startedInScrollback;
    if (!terminalOwns) return;
    beginDrag(id, {
      row: cell.row,
      col: cell.col,
      altKey: ev.altKey,
      startedInScrollback: cell.startedInScrollback,
    });
  };
  const onWindowMouseMove = (ev: MouseEvent) => {
    if (!isDragging(id)) return;
    const cell = computeCell(ev);
    updateDrag(id, { row: cell.row, col: cell.col, altKey: ev.altKey });
  };
  const onWindowMouseUp = (_ev: MouseEvent) => {
    if (!isDragging(id)) return;
    endDrag(id);
  };
  element.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onWindowMouseMove, true);
  window.addEventListener('mouseup', onWindowMouseUp, true);

  const cleanup = () => {
    getPlatform().offPtyData(handleData);
    getPlatform().offPtyExit(handleExit);
    inputDisposable.dispose();
    resizeDisposable.dispose();
    renderDisposable.dispose();
    mouseModeObserver.dispose();
    element.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('mousemove', onWindowMouseMove, true);
    window.removeEventListener('mouseup', onWindowMouseUp, true);
  };

  const entry: TerminalEntry = {
    ptyId: id,
    terminal,
    fit,
    element,
    cleanup,
    alarmStatus: 'ALARM_DISABLED',
    todo: TODO_OFF,
    attentionDismissedRing: false,
  };

  // Apply any primed alarm state (from platform reconnect)
  const primed = primedSessionStates.get(id);
  if (primed) {
    if (primed.status !== undefined) entry.alarmStatus = primed.status;
    if (primed.todo !== undefined) entry.todo = primed.todo;
    primedSessionStates.delete(id);
  }

  registry.set(id, entry);
  startThemeObserver();
  return entry;
}

/**
 * Store shell options for a terminal that will be created shortly.
 * The options are consumed (deleted) by getOrCreateTerminal when the terminal mounts.
 */
export function setPendingShellOpts(id: string, opts: { shell?: string; args?: string[] }): void {
  pendingShellOpts.set(id, opts);
}

/**
 * Get or create a terminal for the given pane ID.
 * The terminal is created once and persists across React mount/unmount cycles.
 */
export function getOrCreateTerminal(id: string): TerminalEntry {
  const existing = registry.get(id);
  if (existing) return existing;

  const entry = setupTerminalEntry(id);

  // Consume any pending shell options set before panel creation
  const shellOpts = pendingShellOpts.get(id);
  pendingShellOpts.delete(id);

  // Spawn PTY
  const dims = entry.fit.proposeDimensions();
  getPlatform().spawnPty(id, {
    cols: dims?.cols || 80,
    rows: dims?.rows || 30,
    ...shellOpts,
  });

  return entry;
}

/**
 * Reconnect to an existing PTY after the webview is recreated.
 * Creates the xterm instance and writes replay data, but does NOT spawn a new PTY.
 */
export function reconnectTerminal(
  id: string,
  replayData: string | null,
  exitInfo?: { alive: boolean; exitCode?: number },
): TerminalEntry {
  const existing = registry.get(id);
  if (existing) return existing;

  const entry = setupTerminalEntry(id);

  if (replayData) {
    entry.terminal.write(replayData);
  }
  if (exitInfo && !exitInfo.alive) {
    entry.terminal.write(`\r\n[Process exited with code ${exitInfo.exitCode ?? -1}]\r\n`);
  }

  return entry;
}

/**
 * Restore a terminal from a saved session.
 * Spawns a new PTY (optionally in a specific cwd) and writes saved scrollback.
 */
export function restoreTerminal(
  id: string,
  opts: { cwd?: string | null; scrollback?: string | null; title?: string; cwdWarning?: string | null },
): TerminalEntry {
  const existing = registry.get(id);
  if (existing) return existing;

  const entry = setupTerminalEntry(id);

  // Write saved scrollback before spawning so the user sees prior output
  // immediately rather than a blank terminal while the shell starts.
  // The shell prompt will appear below the restored scrollback once it's ready.
  if (opts.scrollback) {
    entry.terminal.write(opts.scrollback);
    // Ensure cursor is at column 0 so the new shell prompt starts clean.
    // Without this, zsh's PROMPT_SP prints an inverse '%' partial-line marker.
    entry.terminal.write('\r\n');
  }
  if (opts.cwdWarning) {
    entry.terminal.write(`\r\n\x1b[33m${opts.cwdWarning}\x1b[0m\r\n`);
  }

  // Spawn PTY with saved cwd
  const dims = entry.fit.proposeDimensions();
  getPlatform().spawnPty(id, {
    cols: dims?.cols || 80,
    rows: dims?.rows || 30,
    cwd: opts.cwd ?? undefined,
  });

  return entry;
}

/**
 * Attach a terminal's persistent element to a container div.
 * Call this when the TerminalPane component mounts or reparents.
 */
export function attachTerminal(id: string, container: HTMLElement): void {
  const entry = registry.get(id);
  if (!entry) return;
  container.appendChild(entry.element);
  // Refit after reparenting (container size may have changed)
  requestAnimationFrame(() => entry.fit.fit());
}

/**
 * Detach a terminal's element from its current container.
 * The terminal stays alive — just not in the DOM.
 */
export function detachTerminal(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  entry.element.remove();
}

/**
 * Destroy all terminals. Used for cleanup between Storybook stories.
 */
export function destroyAllTerminals(): void {
  for (const id of [...registry.keys()]) {
    destroyTerminal(id);
  }
}

/**
 * Permanently destroy a terminal: kill PTY, dispose xterm, remove from registry.
 */
export function destroyTerminal(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  getPlatform().alarmRemove(entry.ptyId);
  entry.cleanup();
  getPlatform().killPty(entry.ptyId);
  entry.element.remove();
  entry.terminal.dispose();
  registry.delete(id);
  removeMouseSelectionState(id);
  notifySessionStateListeners();
}

/**
 * Swap two terminals' registry entries. Their DOM elements are detached,
 * entries swapped, and elements reattached to each other's containers.
 * The layout stays the same — only the terminal content swaps.
 *
 * Note: after swapping, registry key idA holds the entry that was originally
 * created for idB (and vice versa). The PTY data/exit handlers inside each
 * entry still filter by their original spawn ID, so PTY output continues to
 * route correctly — the PTY doesn't know or care about registry keys.
 * However, destroyTerminal(idA) after a swap will kill the PTY that was
 * originally spawned as idB. This is correct because the user sees that
 * terminal in slot A and expects "kill A" to kill it.
 */
export function swapTerminals(idA: string, idB: string): void {
  const entryA = registry.get(idA);
  const entryB = registry.get(idB);
  if (!entryA || !entryB) return;

  // Remember which containers they're in
  const containerA = entryA.element.parentElement;
  const containerB = entryB.element.parentElement;

  // Detach both
  entryA.element.remove();
  entryB.element.remove();

  // Swap registry entries
  registry.set(idA, entryB);
  registry.set(idB, entryA);

  // Reattach into each other's containers
  if (containerA) {
    containerA.appendChild(entryB.element);
    requestAnimationFrame(() => entryB.fit.fit());
  }
  if (containerB) {
    containerB.appendChild(entryA.element);
    requestAnimationFrame(() => entryA.fit.fit());
  }

  notifySessionStateListeners();
}

/**
 * Refit the terminal to its container. Call after container resize.
 */
export function refitTerminal(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  entry.fit.fit();
}

/**
 * Dimensions the selection overlay needs to position its highlight rectangles.
 * Returns null if the terminal isn't live.
 */
export interface TerminalOverlayDims {
  cols: number;
  rows: number;
  viewportY: number;
  baseY: number;
  /** Pixel width of the persistent terminal element (container for the canvas). */
  elementWidth: number;
  /** Pixel height of the persistent terminal element. */
  elementHeight: number;
}

export function getTerminalOverlayDims(id: string): TerminalOverlayDims | null {
  const entry = registry.get(id);
  if (!entry) return null;
  const rect = entry.element.getBoundingClientRect();
  return {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
    viewportY: entry.terminal.buffer.active.viewportY,
    baseY: entry.terminal.buffer.active.baseY,
    elementWidth: rect.width,
    elementHeight: rect.height,
  };
}

/**
 * Focus or blur the terminal.
 */
export function focusTerminal(id: string, focused: boolean): void {
  const entry = registry.get(id);
  if (!entry) return;

  if (focused) {
    entry.terminal.focus();
  } else {
    entry.terminal.blur();
    getPlatform().alarmClearAttention(entry.ptyId);
  }
}
