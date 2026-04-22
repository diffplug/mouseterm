import { ActivityMonitor, type SessionStatus } from './activity-monitor';
import { cfg } from '../cfg';

export { type SessionStatus } from './activity-monitor';

/**
 * Unified todo state as a single number.
 *
 *   TODO_OFF  (-1)  — no TODO
 *   [0, 1]         — soft TODO; value is bucket fill level (1 = full, 0 = about to clear)
 *   TODO_HARD (2)   — hard TODO (manually set, never auto-clears)
 *
 * Helpers: isSoftTodo(), isHardTodo(), hasTodo()
 */
export type TodoState = number;
export const TODO_OFF = -1;
export const TODO_SOFT_FULL = 1;
export const TODO_HARD = 2;

export function isSoftTodo(todo: TodoState): boolean { return todo >= 0 && todo <= 1; }
export function isHardTodo(todo: TodoState): boolean { return todo === TODO_HARD; }
export function hasTodo(todo: TodoState): boolean { return todo !== TODO_OFF; }

/** Migrate legacy persisted TodoState values (false/'soft'/'hard') to numeric. */
export function migrateTodoState(todo: unknown): TodoState {
  if (typeof todo === 'number') return todo;
  if (todo === 'hard') return TODO_HARD;
  if (todo === 'soft') return TODO_SOFT_FULL;
  return TODO_OFF; // false, null, undefined, or any other unexpected value
}

export type AlertButtonActionResult = 'enabled' | 'disabled' | 'dismissed' | 'noop';

export interface AlertState {
  status: SessionStatus;
  todo: TodoState;
  /** Used by dismissOrToggleAlert to detect post-attention dismiss */
  attentionDismissedRing: boolean;
}

export const DEFAULT_ALERT_STATE: AlertState = {
  status: 'ALERT_DISABLED',
  todo: TODO_OFF,
  attentionDismissedRing: false,
};

interface AlertEntry {
  monitor: ActivityMonitor | null;
  todo: TodoState;
  attentionDismissedRing: boolean;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
}

const T_USER_ATTENTION = cfg.alert.userAttention;
const STRIKE_RECOVERY_MS = cfg.todoBucket.recoverySecondsPerLetter * 1_000;
const STRIKE_STEP = 0.25;

/**
 * Manages ActivityMonitors, attention tracking, and todo state for PTY sessions.
 *
 * Portable — no DOM dependencies. Can run in the extension host (VSCode),
 * in the webview adapter (Tauri), or in tests.
 */
export class AlertManager {
  private entries = new Map<string, AlertEntry>();
  private attentionId: string | null = null;
  private attentionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(id: string, state: AlertState) => void>();

  // --- State change subscription ---

  onStateChange(listener: (id: string, state: AlertState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Feed PTY events ---

  onData(id: string): void {
    const entry = this.entries.get(id);
    entry?.monitor?.onData();
  }

  onExit(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    // PTY exited — monitor will detect the silence and transition naturally.
    // We keep the entry so alert/todo state is preserved.
  }

  onResize(id: string): void {
    const entry = this.entries.get(id);
    entry?.monitor?.onResize();
  }

  // --- Attention tracking ---

  private hasAttention(id: string): boolean {
    return this.attentionId === id;
  }

  private clearAttentionTimer(): void {
    if (this.attentionTimer !== null) {
      clearTimeout(this.attentionTimer);
      this.attentionTimer = null;
    }
  }

  private setAttention(id: string): void {
    this.attentionId = id;
    this.clearAttentionTimer();
    this.attentionTimer = setTimeout(() => {
      if (this.attentionId === id) {
        this.attentionId = null;
      }
      this.attentionTimer = null;
    }, T_USER_ATTENTION);
  }

  /**
   * Mark that the user is paying attention to this session.
   * Equivalent to the old markSessionAttention.
   */
  attend(id: string): void {
    const entry = this.getOrCreateEntry(id);
    const previousStatus = entry.monitor?.getStatus();
    this.setAttention(id);

    if (previousStatus === 'ALERT_RINGING') {
      entry.attentionDismissedRing = true;
      if (!isHardTodo(entry.todo)) {
        this.clearRecoveryTimer(entry);
        entry.todo = TODO_SOFT_FULL;
      }
    }
    entry.monitor?.attend();
    this.notify(id);
  }

  clearAttention(id?: string): void {
    if (id !== undefined && this.attentionId !== id) return;
    this.attentionId = null;
    this.clearAttentionTimer();
  }

  // --- Monitor lifecycle ---

  private createMonitor(id: string): ActivityMonitor {
    return new ActivityMonitor({
      hasAttention: () => this.hasAttention(id),
      onChange: (_status) => {
        const entry = this.entries.get(id);
        if (!entry) return;

        // If the session has attention when it would ring, suppress by resetting
        if (_status === 'ALERT_RINGING' && this.hasAttention(id)) {
          entry.monitor?.attend();
          return;
        }

        this.notify(id);
      },
    });
  }

  // --- Alert controls ---

  toggleAlert(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.monitor) {
      entry.monitor.dispose();
      entry.monitor = null;
    } else {
      entry.monitor = this.createMonitor(id);
    }
    entry.attentionDismissedRing = false;
    this.notify(id);
  }

  disableAlert(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.monitor) return;
    entry.monitor.dispose();
    entry.monitor = null;
    entry.attentionDismissedRing = false;
    this.notify(id);
  }

  dismissAlert(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.monitor) return;
    if (entry.monitor.getStatus() !== 'ALERT_RINGING') return;
    if (!isHardTodo(entry.todo)) {
      this.clearRecoveryTimer(entry);
      entry.todo = TODO_SOFT_FULL;
    }
    entry.monitor.attend();
    // onChange fires → notify
  }

  /**
   * Apply the bell-button transition table.
   * Returns the action result synchronously.
   */
  dismissOrToggleAlert(id: string, displayedStatus: SessionStatus): AlertButtonActionResult {
    const entry = this.entries.get(id);
    if (!entry) {
      // No entry yet — treat as ALERT_DISABLED → enable
      this.toggleAlert(id);
      return 'enabled';
    }
    let result: AlertButtonActionResult;
    switch (displayedStatus) {
      case 'ALERT_DISABLED':
        this.toggleAlert(id);
        result = 'enabled';
        break;
      case 'ALERT_RINGING':
        this.dismissAlert(id);
        result = 'dismissed';
        break;
      default:
        if (entry.attentionDismissedRing) {
          entry.attentionDismissedRing = false;
          result = 'dismissed';
          this.notify(id);
          break;
        }
        this.disableAlert(id);
        result = 'disabled';
    }
    return result;
  }

  // --- Todo controls ---

  /** Toggle: off → hard, soft → hard, hard → off */
  toggleTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    this.clearRecoveryTimer(entry);
    if (entry.todo === TODO_HARD) {
      entry.todo = TODO_OFF;
      this.notify(id);
    } else {
      entry.todo = TODO_HARD;
      if (entry.monitor?.getStatus() === 'ALERT_RINGING') {
        entry.monitor.attend();
        return; // onChange fires → notify
      }
      this.notify(id);
    }
  }

  /** Explicitly mark as hard TODO */
  markTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    const isRinging = entry.monitor?.getStatus() === 'ALERT_RINGING';
    if (entry.todo === TODO_HARD && !isRinging) return;
    this.clearRecoveryTimer(entry);
    entry.todo = TODO_HARD;
    if (isRinging) {
      entry.monitor!.attend();
      return; // onChange fires → notify
    }
    this.notify(id);
  }

  /** Clear any TODO state */
  clearTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === TODO_OFF) return;
    this.clearRecoveryTimer(entry);
    entry.todo = TODO_OFF;
    this.notify(id);
  }

  /**
   * Strike one letter of the soft-TODO pill.
   * 4 strikes clear the TODO. One letter recovers after each `recoverySecondsPerLetter`
   * of idle (no further strikes).
   */
  drainTodoBucket(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !isSoftTodo(entry.todo)) return;

    entry.todo = entry.todo - STRIKE_STEP;

    if (entry.todo < 1e-9) {
      entry.todo = TODO_OFF;
      this.clearRecoveryTimer(entry);
      this.notify(id);
      return;
    }

    this.scheduleRecoveryTick(id, entry);
    this.notify(id);
  }

  private scheduleRecoveryTick(id: string, entry: AlertEntry): void {
    this.clearRecoveryTimer(entry);
    entry.recoveryTimer = setTimeout(() => {
      entry.recoveryTimer = null;
      if (!isSoftTodo(entry.todo)) return;
      entry.todo = Math.min(TODO_SOFT_FULL, entry.todo + STRIKE_STEP);
      this.notify(id);
      if (entry.todo < TODO_SOFT_FULL) {
        this.scheduleRecoveryTick(id, entry);
      }
    }, STRIKE_RECOVERY_MS);
  }

  // --- Query ---

  getState(id: string): AlertState {
    const entry = this.entries.get(id);
    if (!entry) return DEFAULT_ALERT_STATE;
    return {
      status: entry.monitor?.getStatus() ?? 'ALERT_DISABLED',
      todo: entry.todo,
      attentionDismissedRing: entry.attentionDismissedRing,
    };
  }

  getAllStates(): Map<string, AlertState> {
    const result = new Map<string, AlertState>();
    for (const [id] of this.entries) {
      result.set(id, this.getState(id));
    }
    return result;
  }

  /** Completely remove alert state for a PTY (used when PTY is destroyed) */
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.clearRecoveryTimer(entry);
    entry.monitor?.dispose();
    this.entries.delete(id);
    if (this.attentionId === id) {
      this.attentionId = null;
      this.clearAttentionTimer();
    }
    this.notify(id);
  }

  /**
   * Seed alert state from a persisted session (cold-start restore).
   * Creates an entry with the saved todo state and, if the alert was enabled,
   * creates a fresh ActivityMonitor (it will start in NOTHING_TO_SHOW until
   * PTY data arrives).
   */
  restore(id: string, state: { status: string; todo: TodoState }): void {
    const entry = this.getOrCreateEntry(id);
    entry.todo = migrateTodoState(state.todo);
    // If the alert was enabled (anything other than ALERT_DISABLED), create a monitor
    if (state.status !== 'ALERT_DISABLED') {
      if (!entry.monitor) {
        entry.monitor = this.createMonitor(id);
      }
    }
    this.notify(id);
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.clearRecoveryTimer(entry);
      entry.monitor?.dispose();
    }
    this.entries.clear();
    this.listeners.clear();
    this.clearAttentionTimer();
  }

  // --- Internals ---

  private getOrCreateEntry(id: string): AlertEntry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { monitor: null, todo: TODO_OFF, attentionDismissedRing: false, recoveryTimer: null };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private clearRecoveryTimer(entry: AlertEntry): void {
    if (entry.recoveryTimer !== null) {
      clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
    }
  }

  private notify(id: string): void {
    const state = this.getState(id);
    for (const listener of this.listeners) {
      listener(id, state);
    }
  }
}
