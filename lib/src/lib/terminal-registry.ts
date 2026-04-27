import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getPlatform } from './platform';
import type { SessionStatus } from './activity-monitor';
import type { TodoState, AlertButtonActionResult } from './alert-manager';
import type { AlertStateDetail } from './platform/types';
import type { PersistedAlertState } from './session-types';
import { attachMouseModeObserver } from './mouse-mode-observer';
import {
  beginDrag,
  bumpRenderTick,
  endDrag,
  getMouseSelectionState,
  isDragging,
  removeMouseSelectionState,
  setDragAlt,
  setHintToken,
  setOverride,
  setSelection as setMouseSelection,
  updateDrag,
} from './mouse-selection';
import { detectTokenAt } from './smart-token';
import { extractSelectionText } from './selection-text';

export type { SessionStatus } from './activity-monitor';
export { type TodoState, type AlertButtonActionResult } from './alert-manager';

export interface ActivityState {
  status: SessionStatus;
  todo: TodoState;
}

export const DEFAULT_ACTIVITY_STATE: ActivityState = {
  status: 'ALERT_DISABLED',
  todo: false,
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
  /** Cached alert status from the platform's AlertManager */
  alertStatus: SessionStatus;
  /** Cached todo state from the platform's AlertManager */
  todo: TodoState;
  /** Cached flag from the platform's AlertManager */
  attentionDismissedRing: boolean;
}

const registry = new Map<string, TerminalEntry>();
const pendingShellOpts = new Map<string, { shell?: string; args?: string[] }>();
const primedActivityStates = new Map<string, Partial<ActivityState>>();

// Re-export from shell-defaults to preserve the public API surface.
// The actual state lives in shell-defaults.ts to avoid a circular dependency
// (terminal-registry → platform → vscode-adapter → terminal-registry).
export { setDefaultShellOpts, getDefaultShellOpts } from './shell-defaults';

// --- Watch for VSCode theme changes and re-apply xterm themes ---
// VSCode signals theme changes by updating CSS variables and body classes.
let themeObserverStarted = false;
let lastAppliedThemeKey: string | null = null;
function startThemeObserver(): void {
  if (themeObserverStarted) return;
  themeObserverStarted = true;

  const observer = new MutationObserver(() => {
    const theme = getTerminalTheme();
    // body.style mutations fire often (focus-ring writes, etc.); only walk
    // the registry when the terminal palette actually changed.
    const key = JSON.stringify(theme);
    if (key === lastAppliedThemeKey) return;
    lastAppliedThemeKey = key;
    for (const entry of registry.values()) {
      entry.terminal.options.theme = theme;
      paintTerminalHost(entry.element, entry.terminal, theme.background);
    }
  });

  // Watch body for class changes (vscode-light/dark) and style changes (CSS vars)
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  // Also watch <html> for style attribute changes (some VSCode versions inject there)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

// --- Session state subscription API (for useSyncExternalStore) ---

const activityListeners = new Set<() => void>();
let cachedSnapshot: Map<string, ActivityState> | null = null;

function notifyActivityListeners(): void {
  cachedSnapshot = null;
  activityListeners.forEach((listener) => listener());
}

export function subscribeToActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function getActivitySnapshot(): Map<string, ActivityState> {
  if (cachedSnapshot) return cachedSnapshot;

  const snapshot = new Map<string, ActivityState>();
  const ids = new Set<string>([...registry.keys(), ...primedActivityStates.keys()]);
  for (const id of ids) {
    const state = readActivity(id);
    if (state) {
      snapshot.set(id, state);
    }
  }
  cachedSnapshot = snapshot;
  return snapshot;
}

export function getActivity(id: string): ActivityState {
  return readActivity(id) ?? DEFAULT_ACTIVITY_STATE;
}

function readLiveActivity(id: string): ActivityState | null {
  const entry = registry.get(id);
  if (!entry) return null;

  return {
    status: entry.alertStatus,
    todo: entry.todo,
  };
}

function readActivity(id: string): ActivityState | null {
  const primedState = primedActivityStates.get(id);
  const liveState = readLiveActivity(id);

  if (!liveState && !primedState) return null;
  return {
    ...(liveState ?? DEFAULT_ACTIVITY_STATE),
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

export function getLivePersistedAlertState(id: string): PersistedAlertState | null {
  const state = readLiveActivity(id);
  if (!state) return null;
  return {
    status: state.status,
    todo: state.todo,
  };
}

export function primeActivity(id: string, state: Partial<ActivityState>): void {
  primedActivityStates.set(id, state);
  notifyActivityListeners();
}

export function clearPrimedActivity(id?: string): void {
  if (id === undefined) {
    if (primedActivityStates.size === 0) return;
    primedActivityStates.clear();
    notifyActivityListeners();
    return;
  }

  if (!primedActivityStates.delete(id)) return;
  notifyActivityListeners();
}

// --- Alert state receiver (from platform's AlertManager) ---

let currentAlertHandler: ((detail: AlertStateDetail) => void) | null = null;

/**
 * Wire up the platform's alert state events to the local session state store.
 * Call once during startup, before resume/restore. Safe to call again after platform reset.
 */
export function initAlertStateReceiver(): void {
  const platform = getPlatform();
  // Remove previous handler if re-initializing (e.g. after platform reset in tests)
  if (currentAlertHandler) {
    platform.offAlertState(currentAlertHandler);
  }

  currentAlertHandler = (detail) => {
    const entry = getEntryByPtyId(detail.id);
    if (entry) {
      entry.alertStatus = detail.status;
      entry.todo = detail.todo;
      entry.attentionDismissedRing = detail.attentionDismissedRing;
      // Clear any primed state now that we have live data
      primedActivityStates.delete(detail.id);
      notifyActivityListeners();
    } else {
      // Terminal entry not created yet — prime the state so it's ready when it is
      primeActivity(detail.id, { status: detail.status, todo: detail.todo });
    }
  };
  platform.onAlertState(currentAlertHandler);
}

// --- Alert action delegates (thin wrappers over platform adapter) ---

export function dismissOrToggleAlert(id: string, displayedStatus: SessionStatus): AlertButtonActionResult {
  // Compute result locally for synchronous return (same transition table as AlertManager).
  // The actual state change happens via the platform.
  const entry = registry.get(id);
  let result: AlertButtonActionResult;
  switch (displayedStatus) {
    case 'ALERT_DISABLED':
      result = 'enabled';
      break;
    case 'ALERT_RINGING':
      result = 'dismissed';
      break;
    default:
      if (entry?.attentionDismissedRing) {
        result = 'dismissed';
        break;
      }
      result = 'disabled';
  }
  getPlatform().alertDismissOrToggle(resolveTerminalSessionId(id), displayedStatus);
  return result;
}

export function toggleSessionAlert(id: string): void {
  getPlatform().alertToggle(resolveTerminalSessionId(id));
}

export function disableSessionAlert(id: string): void {
  getPlatform().alertDisable(resolveTerminalSessionId(id));
}

export function dismissSessionAlert(id: string): void {
  getPlatform().alertDismiss(resolveTerminalSessionId(id));
}

export function markSessionAttention(id: string): void {
  getPlatform().alertAttend(resolveTerminalSessionId(id));
}

export function clearSessionAttention(id?: string): void {
  getPlatform().alertClearAttention(id === undefined ? undefined : resolveTerminalSessionId(id));
}

export function toggleSessionTodo(id: string): void {
  getPlatform().alertToggleTodo(resolveTerminalSessionId(id));
}

export function markSessionTodo(id: string): void {
  getPlatform().alertMarkTodo(resolveTerminalSessionId(id));
}

export function clearSessionTodo(id: string): void {
  getPlatform().alertClearTodo(resolveTerminalSessionId(id));
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

// Coupled to xterm's internal class names. If xterm renames any of these in
// a future upgrade we'd silently regress to a sub-row gap at the bottom of
// the pane (the very thing this paints over) — warn loudly the first time
// it happens so the upgrade is caught in dev/staging instead of prod.
const XTERM_HOST_SELECTOR = '.xterm-screen, .xterm-scrollable-element, .xterm-viewport';
let xtermSelectorWarned = false;

function paintTerminalHost(element: HTMLDivElement, terminal: Terminal, background: string): void {
  element.style.backgroundColor = background;
  element.style.borderRadius = 'inherit';

  const xtermElement = terminal.element as HTMLElement | undefined;
  if (xtermElement) {
    xtermElement.style.backgroundColor = background;
    xtermElement.style.borderRadius = 'inherit';
  }

  if (typeof element.querySelectorAll !== 'function') return;
  const hosts = element.querySelectorAll<HTMLElement>(XTERM_HOST_SELECTOR);
  if (hosts.length === 0 && xtermElement && !xtermSelectorWarned) {
    xtermSelectorWarned = true;
    console.warn(`[mouseterm] paintTerminalHost: no elements matched ${XTERM_HOST_SELECTOR} — xterm DOM may have changed.`);
    return;
  }
  hosts.forEach((el) => {
    el.style.backgroundColor = background;
  });
}

// --- Input analysis ---

function inputContainsEnter(data: string): boolean {
  // xterm.js sends CR (\r) for the Enter key.
  return data.includes('\r');
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

  const theme = getTerminalTheme();
  const terminal = new Terminal({
    fontSize: editorFontSize,
    fontFamily: editorFontFamily,
    cursorBlink: true,
    theme,
  });

  const fit = new FitAddon();
  terminal.loadAddon(fit);

  const element = document.createElement('div');
  element.style.width = '100%';
  element.style.height = '100%';
  terminal.open(element);
  paintTerminalHost(element, terminal, theme.background);

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

  // User input → PTY + alert actions
  const inputDisposable = terminal.onData((data) => {
    const isSyntheticTerminalReport = inputIsSyntheticTerminalReport(data);

    if (!isSyntheticTerminalReport) {
      const entry = registry.get(id);
      const hadTodo = entry?.todo === true;
      getPlatform().alertAttend(id);
      if (hadTodo && inputContainsEnter(data)) {
        getPlatform().alertClearTodo(id);
      }
    }

    getPlatform().writePty(id, data);
  });

  // Resize → PTY. Also cancel any finalized selection (spec §3.4: resize
  // counts as a content change).
  const resizeDisposable = terminal.onResize(({ cols, rows }) => {
    getPlatform().alertResize(id);
    getPlatform().resizePty(id, cols, rows);
    bumpRenderTick();
    if (getMouseSelectionState(id).selection) {
      setMouseSelection(id, null);
    }
    selectionBaseline = null;
  });

  // Cancel-on-change: snapshot the selected text when the drag ends, then
  // on every subsequent render check whether any covered cell has changed.
  // If so, cancel the selection (spec §3.4).
  let selectionBaseline: string | null = null;

  const renderDisposable = terminal.onRender(() => {
    bumpRenderTick();
    if (selectionBaseline === null) return;
    const sel = getMouseSelectionState(id).selection;
    if (!sel || sel.dragging) {
      selectionBaseline = null;
      return;
    }
    const current = extractSelectionText(terminal, sel);
    if (current !== selectionBaseline) {
      setMouseSelection(id, null);
      selectionBaseline = null;
    }
  });

  // Observe DECSET/DECRST for mouse-reporting and bracketed-paste modes.
  const mouseModeObserver = attachMouseModeObserver(id, terminal);

  // Mouse event router. Capture phase so we see events before xterm's own
  // handlers. We defer beginDrag (and stopPropagation) until the cursor has
  // actually moved past a small threshold — a plain click stays a plain
  // click so the pane-click handler upstream can still shift focus.
  const computeCell = (ev: MouseEvent): { row: number; col: number; startedInScrollback: boolean } => {
    // Use the same measured cell grid as the selection overlay so mouse
    // hit-testing and highlight rendering can never drift apart.
    const dims = getTerminalOverlayDims(id);
    if (!dims) {
      return { row: 0, col: 0, startedInScrollback: false };
    }
    const elementRect = element.getBoundingClientRect();
    const offsetX = ev.clientX - elementRect.left - dims.gridLeft;
    const offsetY = ev.clientY - elementRect.top - dims.gridTop;
    const col = Math.min(dims.cols - 1, Math.max(0, Math.floor(offsetX / dims.cellWidth)));
    const viewportRow = Math.min(dims.rows - 1, Math.max(0, Math.floor(offsetY / dims.cellHeight)));
    const absRow = dims.viewportY + viewportRow;
    const startedInScrollback = absRow < dims.baseY;
    return { row: absRow, col, startedInScrollback };
  };

  const DRAG_THRESHOLD_PX_SQ = 16; // 4px squared — typical click-vs-drag threshold
  let pendingDrag: {
    row: number;
    col: number;
    altKey: boolean;
    startedInScrollback: boolean;
    clientX: number;
    clientY: number;
  } | null = null;

  const onMouseDown = (ev: MouseEvent) => {
    if (ev.button !== 0) return; // only left-click can start a selection
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
    // Record the anchor but don't commit — this might be a plain click. We
    // deliberately do NOT preventDefault / stopPropagation here so pane
    // focus-on-click (and xterm's own focus handling) still work.
    pendingDrag = {
      row: cell.row,
      col: cell.col,
      altKey: ev.altKey,
      startedInScrollback: cell.startedInScrollback,
      clientX: ev.clientX,
      clientY: ev.clientY,
    };
  };
  const onWindowMouseMove = (ev: MouseEvent) => {
    if (pendingDrag) {
      const dx = ev.clientX - pendingDrag.clientX;
      const dy = ev.clientY - pendingDrag.clientY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX_SQ) return;
      // Threshold crossed — promote pending anchor into a real drag.
      beginDrag(id, {
        row: pendingDrag.row,
        col: pendingDrag.col,
        altKey: pendingDrag.altKey,
        startedInScrollback: pendingDrag.startedInScrollback,
      });
      // Wipe any nascent xterm selection that started on the bare mousedown.
      terminal.clearSelection();
      pendingDrag = null;
    }
    if (!isDragging(id)) return;
    const cell = computeCell(ev);
    updateDrag(id, { row: cell.row, col: cell.col, altKey: ev.altKey });
    ev.preventDefault();
    ev.stopPropagation();
    // Smart-extension hint (spec §5): scan the line under the current drag
    // cursor for a URL/path token.
    const line = terminal.buffer.active.getLine(cell.row);
    const text = line?.translateToString(false, 0, terminal.cols);
    const token = text ? detectTokenAt(text, cell.col) : null;
    setHintToken(id, token ? {
      kind: token.kind,
      row: cell.row,
      startCol: token.start,
      endCol: token.end,
      text: token.text,
    } : null);
  };
  const onWindowMouseUp = (ev: MouseEvent) => {
    if (ev.button !== 0) return; // only left-button release ends a drag
    if (pendingDrag) {
      // Pure click — never crossed the drag threshold. Still counts as the
      // mouse-up that terminates a temporary override (spec §2.1).
      if (getMouseSelectionState(id).override === 'temporary') {
        setOverride(id, 'off');
      }
      pendingDrag = null;
      return;
    }
    if (!isDragging(id)) return;
    endDrag(id);
    setHintToken(id, null);
    // Take a text snapshot of the finalized selection for cancel-on-change.
    const sel = getMouseSelectionState(id).selection;
    selectionBaseline = sel ? extractSelectionText(terminal, sel) : null;
    // Per spec §2.1: a temporary override ends on the mouse-up that
    // finalizes the drag.
    if (getMouseSelectionState(id).override === 'temporary') {
      setOverride(id, 'off');
    }
    ev.preventDefault();
    ev.stopPropagation();
  };
  element.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onWindowMouseMove, true);
  window.addEventListener('mouseup', onWindowMouseUp, true);

  // Live-flip block/linewise shape when Alt is pressed/released without
  // mouse movement (spec §3.2).
  const onAltChange = (ev: KeyboardEvent) => {
    if (!isDragging(id)) return;
    setDragAlt(id, ev.altKey);
  };
  window.addEventListener('keydown', onAltChange, true);
  window.addEventListener('keyup', onAltChange, true);

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
    window.removeEventListener('keydown', onAltChange, true);
    window.removeEventListener('keyup', onAltChange, true);
  };

  const entry: TerminalEntry = {
    ptyId: id,
    terminal,
    fit,
    element,
    cleanup,
    alertStatus: 'ALERT_DISABLED',
    todo: false,
    attentionDismissedRing: false,
  };

  // Apply any primed alert state (from platform resume)
  const primed = primedActivityStates.get(id);
  if (primed) {
    if (primed.status !== undefined) entry.alertStatus = primed.status;
    if (primed.todo !== undefined) entry.todo = primed.todo;
    primedActivityStates.delete(id);
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
 * Resume an existing PTY after the webview is recreated.
 * Creates the xterm instance and writes replay data, but does NOT spawn a new PTY.
 */
export function resumeTerminal(
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
  opts: { cwd?: string | null; scrollback?: string | null; title?: string; cwdWarning?: string | null; shell?: string; args?: string[] },
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
    shell: opts.shell,
    args: opts.args,
  });

  return entry;
}

/**
 * Attach a terminal's persistent element to a container div.
 * Call this when the TerminalPane component mounts or reparents.
 */
export function mountElement(id: string, container: HTMLElement): void {
  const entry = registry.get(id);
  if (!entry) return;
  container.appendChild(entry.element);
  // Refit after reparenting (container size may have changed)
  requestAnimationFrame(() => entry.fit.fit());
}

/**
 * Unmount a terminal's element from its current container.
 * The terminal stays alive — just not in the DOM.
 */
export function unmountElement(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  entry.element.remove();
}

/**
 * Destroy all terminals. Used for cleanup between Storybook stories.
 */
export function disposeAllSessions(): void {
  for (const id of [...registry.keys()]) {
    disposeSession(id);
  }
}

/**
 * Permanently destroy a terminal: kill PTY, dispose xterm, remove from registry.
 */
export function disposeSession(id: string): void {
  const entry = registry.get(id);
  if (!entry) return;
  getPlatform().alertRemove(entry.ptyId);
  entry.cleanup();
  getPlatform().killPty(entry.ptyId);
  entry.element.remove();
  entry.terminal.dispose();
  registry.delete(id);
  removeMouseSelectionState(id);
  notifyActivityListeners();
}

/**
 * Swap two terminals' registry entries. Their DOM elements are unmounted,
 * entries swapped, and elements remounted into each other's containers.
 * The layout stays the same — only the terminal content swaps.
 *
 * Note: after swapping, registry key idA holds the entry that was originally
 * created for idB (and vice versa). The PTY data/exit handlers inside each
 * entry still filter by their original spawn ID, so PTY output continues to
 * route correctly — the PTY doesn't know or care about registry keys.
 * However, disposeSession(idA) after a swap will kill the PTY that was
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

  // Unmount both
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

  notifyActivityListeners();
}

/**
 * Refit the terminal to its container. Call after container resize.
 */
export function refitSession(id: string): void {
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
  /** Measured pixel width of a single cell. */
  cellWidth: number;
  /** Measured pixel height of a single cell. */
  cellHeight: number;
  /** Left offset of the cell grid (`.xterm-screen`) within the element. */
  gridLeft: number;
  /** Top offset of the cell grid within the element. */
  gridTop: number;
}

/**
 * Get the raw xterm Terminal instance for a pane id. Used by features that
 * need to read the buffer directly (selection extraction). Returns null
 * when the terminal isn't live.
 */
export function getTerminalInstance(id: string): Terminal | null {
  return registry.get(id)?.terminal ?? null;
}

export function getTerminalOverlayDims(id: string): TerminalOverlayDims | null {
  const entry = registry.get(id);
  if (!entry) return null;
  const elementRect = entry.element.getBoundingClientRect();
  // Measure xterm's actual cell grid, not the surrounding element. xterm puts
  // a few pixels of padding around `.xterm-screen`, so element-divided-by-
  // cols/rows is slightly off and the error accumulates with row count.
  const screen = entry.element.querySelector<HTMLElement>('.xterm-screen');
  let cellWidth: number;
  let cellHeight: number;
  let gridLeft: number;
  let gridTop: number;
  if (screen) {
    const screenRect = screen.getBoundingClientRect();
    cellWidth = screenRect.width / entry.terminal.cols;
    cellHeight = screenRect.height / entry.terminal.rows;
    gridLeft = screenRect.left - elementRect.left;
    gridTop = screenRect.top - elementRect.top;
  } else {
    // Before xterm has rendered, fall back to element dimensions. Not
    // perfectly aligned but selection UI isn't usable at this point anyway.
    cellWidth = elementRect.width / entry.terminal.cols;
    cellHeight = elementRect.height / entry.terminal.rows;
    gridLeft = 0;
    gridTop = 0;
  }
  return {
    cols: entry.terminal.cols,
    rows: entry.terminal.rows,
    viewportY: entry.terminal.buffer.active.viewportY,
    baseY: entry.terminal.buffer.active.baseY,
    elementWidth: elementRect.width,
    elementHeight: elementRect.height,
    cellWidth,
    cellHeight,
    gridLeft,
    gridTop,
  };
}

/**
 * Focus or blur the terminal.
 */
export function focusSession(id: string, focused: boolean): void {
  const entry = registry.get(id);
  if (!entry) return;

  if (focused) {
    entry.terminal.focus();
  } else {
    entry.terminal.blur();
    getPlatform().alertClearAttention(entry.ptyId);
  }
}
