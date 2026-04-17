/**
 * Per-terminal mouse and selection state.
 *
 * Owns the data that the mouse-and-clipboard feature needs:
 * - Which mouse-reporting regime the inside program requested.
 * - Whether bracketed paste is on.
 * - Whether the user has activated an override (temporary / permanent).
 * - The current text selection and the current smart-extension hint.
 *
 * Exposes a `useSyncExternalStore`-compatible subscription API. Pure state,
 * no DOM dependencies — safe to unit-test.
 */

export type MouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';
export type OverrideState = 'off' | 'temporary' | 'permanent';
export type SelectionShape = 'linewise' | 'block';

export interface Selection {
  /** Absolute buffer row (scrollback + viewport), 0-indexed. */
  startRow: number;
  /** Cell column at the drag anchor. */
  startCol: number;
  /** Absolute buffer row. */
  endRow: number;
  /** Cell column at the current drag position (or release position). */
  endCol: number;
  shape: SelectionShape;
  /** True while the user is still dragging; false once the mouse is released. */
  dragging: boolean;
}

export interface TokenHint {
  kind: 'url' | 'path';
  /** Absolute buffer row the token occupies. */
  row: number;
  startCol: number;
  /** Exclusive. */
  endCol: number;
  text: string;
}

export interface MouseSelectionState {
  mouseReporting: MouseTrackingMode;
  bracketedPaste: boolean;
  override: OverrideState;
  selection: Selection | null;
  hintToken: TokenHint | null;
}

export const DEFAULT_MOUSE_SELECTION_STATE: MouseSelectionState = Object.freeze({
  mouseReporting: 'none',
  bracketedPaste: false,
  override: 'off',
  selection: null,
  hintToken: null,
}) as MouseSelectionState;

const states = new Map<string, MouseSelectionState>();
const listeners = new Set<() => void>();
let cachedSnapshot: Map<string, MouseSelectionState> | null = null;

function notify(): void {
  cachedSnapshot = null;
  listeners.forEach((l) => l());
}

function ensure(id: string): MouseSelectionState {
  let s = states.get(id);
  if (!s) {
    s = { ...DEFAULT_MOUSE_SELECTION_STATE };
    states.set(id, s);
  }
  return s;
}

export function subscribeToMouseSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMouseSelectionSnapshot(): Map<string, MouseSelectionState> {
  if (cachedSnapshot) return cachedSnapshot;
  cachedSnapshot = new Map(states);
  return cachedSnapshot;
}

export function getMouseSelectionState(id: string): MouseSelectionState {
  return states.get(id) ?? DEFAULT_MOUSE_SELECTION_STATE;
}

export function setMouseReporting(id: string, mode: MouseTrackingMode): void {
  const s = ensure(id);
  if (s.mouseReporting === mode) return;
  s.mouseReporting = mode;
  // Per spec §1.1 / §2: when the inside program stops requesting mouse reporting,
  // any active override is no longer meaningful. End it.
  if (mode === 'none' && s.override !== 'off') {
    s.override = 'off';
  }
  notify();
}

export function setBracketedPaste(id: string, on: boolean): void {
  const s = ensure(id);
  if (s.bracketedPaste === on) return;
  s.bracketedPaste = on;
  notify();
}

export function setOverride(id: string, override: OverrideState): void {
  const s = ensure(id);
  if (s.override === override) return;
  // Override only makes sense while the inside program is requesting mouse
  // reporting. Ignore attempts to activate it otherwise.
  if (override !== 'off' && s.mouseReporting === 'none') return;
  s.override = override;
  notify();
}

export function setSelection(id: string, selection: Selection | null): void {
  const s = ensure(id);
  if (s.selection === null && selection === null) return;
  s.selection = selection;
  notify();
}

export function setHintToken(id: string, hint: TokenHint | null): void {
  const s = ensure(id);
  if (s.hintToken === null && hint === null) return;
  s.hintToken = hint;
  notify();
}

export function removeMouseSelectionState(id: string): void {
  if (!states.has(id)) return;
  states.delete(id);
  notify();
}

/** Test-only helper. Do not use in application code. */
export function __resetMouseSelectionForTests(): void {
  states.clear();
  listeners.clear();
  cachedSnapshot = null;
}
