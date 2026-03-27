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

export type AlarmButtonActionResult = 'enabled' | 'disabled' | 'dismissed' | 'noop';

export interface AlarmState {
  status: SessionStatus;
  todo: TodoState;
  /** Used by dismissOrToggleAlarm to detect post-attention dismiss */
  attentionDismissedRing: boolean;
}

export const DEFAULT_ALARM_STATE: AlarmState = {
  status: 'ALARM_DISABLED',
  todo: TODO_OFF,
  attentionDismissedRing: false,
};

interface AlarmEntry {
  monitor: ActivityMonitor | null;
  todo: TodoState;
  attentionDismissedRing: boolean;
  bucketLastDrainAt: number;
  bucketRefillTimer: ReturnType<typeof setTimeout> | null;
}

const T_USER_ATTENTION = cfg.alarm.userAttention;
const BUCKET_TIME_TO_FULL_MS = cfg.todoBucket.timeToFullSeconds * 1_000;
const BUCKET_KEYPRESSES_TO_EMPTY = cfg.todoBucket.keypressesToEmpty;

/**
 * Manages ActivityMonitors, attention tracking, and todo state for PTY sessions.
 *
 * Portable — no DOM dependencies. Can run in the extension host (VSCode),
 * in the webview adapter (Tauri), or in tests.
 */
export class AlarmManager {
  private entries = new Map<string, AlarmEntry>();
  private attentionId: string | null = null;
  private attentionTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(id: string, state: AlarmState) => void>();

  // --- State change subscription ---

  onStateChange(listener: (id: string, state: AlarmState) => void): () => void {
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
    // We keep the entry so alarm/todo state is preserved.
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

    if (previousStatus === 'ALARM_RINGING') {
      entry.attentionDismissedRing = true;
      if (entry.todo === TODO_OFF) {
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
        if (_status === 'ALARM_RINGING' && this.hasAttention(id)) {
          entry.monitor?.attend();
          return;
        }

        this.notify(id);
      },
    });
  }

  // --- Alarm controls ---

  toggleAlarm(id: string): void {
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

  disableAlarm(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.monitor) return;
    entry.monitor.dispose();
    entry.monitor = null;
    entry.attentionDismissedRing = false;
    this.notify(id);
  }

  dismissAlarm(id: string): void {
    const entry = this.entries.get(id);
    if (!entry?.monitor) return;
    if (entry.monitor.getStatus() !== 'ALARM_RINGING') return;
    if (entry.todo === TODO_OFF) {
      entry.todo = TODO_SOFT_FULL;
    }
    entry.monitor.attend();
    // onChange fires → notify
  }

  /**
   * Apply the bell-button transition table.
   * Returns the action result synchronously.
   */
  dismissOrToggleAlarm(id: string, displayedStatus: SessionStatus): AlarmButtonActionResult {
    const entry = this.entries.get(id);
    if (!entry) {
      // No entry yet — treat as ALARM_DISABLED → enable
      this.toggleAlarm(id);
      return 'enabled';
    }
    let result: AlarmButtonActionResult;
    switch (displayedStatus) {
      case 'ALARM_DISABLED':
        this.toggleAlarm(id);
        result = 'enabled';
        break;
      case 'ALARM_RINGING':
        this.dismissAlarm(id);
        result = 'dismissed';
        break;
      default:
        if (entry.attentionDismissedRing) {
          entry.attentionDismissedRing = false;
          result = 'dismissed';
          this.notify(id);
          break;
        }
        this.disableAlarm(id);
        result = 'disabled';
    }
    return result;
  }

  // --- Todo controls ---

  /** Toggle: off → hard, soft → hard, hard → off */
  toggleTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === TODO_HARD) {
      this.clearBucketRefillTimer(entry);
      entry.todo = TODO_OFF;
      this.notify(id);
    } else {
      this.clearBucketRefillTimer(entry);
      entry.todo = TODO_HARD;
      if (entry.monitor?.getStatus() === 'ALARM_RINGING') {
        entry.monitor.attend();
        return; // onChange fires → notify
      }
      this.notify(id);
    }
  }

  /** Explicitly mark as hard TODO */
  markTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    const isRinging = entry.monitor?.getStatus() === 'ALARM_RINGING';
    if (entry.todo === TODO_HARD && !isRinging) return;
    this.clearBucketRefillTimer(entry);
    entry.todo = TODO_HARD;
    if (isRinging) {
      entry.monitor!.attend();
      return; // onChange fires → notify
    }
    this.notify(id);
  }

  /** Promote soft TODO to hard */
  promoteTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (!isSoftTodo(entry.todo)) return;
    this.clearBucketRefillTimer(entry);
    entry.todo = TODO_HARD;
    this.notify(id);
  }

  /** Clear any TODO state */
  clearTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === TODO_OFF) return;
    this.clearBucketRefillTimer(entry);
    entry.todo = TODO_OFF;
    this.notify(id);
  }

  /** Drain the soft-TODO bucket by one keypress. Clears the TODO if bucket empties. */
  drainTodoBucket(id: string): void {
    const entry = this.entries.get(id);
    if (!entry || !isSoftTodo(entry.todo)) return;

    const now = Date.now();

    // Apply refill based on time since last drain
    if (entry.bucketLastDrainAt > 0) {
      const elapsed = now - entry.bucketLastDrainAt;
      entry.todo = Math.min(TODO_SOFT_FULL, entry.todo + elapsed / BUCKET_TIME_TO_FULL_MS);
    }

    // Drain by one keypress
    entry.todo = entry.todo - 1 / BUCKET_KEYPRESSES_TO_EMPTY;
    entry.bucketLastDrainAt = now;

    if (entry.todo < 1e-9) {
      entry.todo = TODO_OFF;
      this.clearBucketRefillTimer(entry);
      this.notify(id);
      return;
    }

    // Schedule refill timer
    this.clearBucketRefillTimer(entry);
    entry.bucketRefillTimer = setTimeout(() => {
      entry.bucketRefillTimer = null;
      if (isSoftTodo(entry.todo)) {
        entry.todo = TODO_SOFT_FULL;
        entry.bucketLastDrainAt = 0;
        this.notify(id);
      }
    }, (TODO_SOFT_FULL - entry.todo) * BUCKET_TIME_TO_FULL_MS);

    this.notify(id);
  }

  // --- Query ---

  getState(id: string): AlarmState {
    const entry = this.entries.get(id);
    if (!entry) return DEFAULT_ALARM_STATE;
    return {
      status: entry.monitor?.getStatus() ?? 'ALARM_DISABLED',
      todo: entry.todo,
      attentionDismissedRing: entry.attentionDismissedRing,
    };
  }

  getAllStates(): Map<string, AlarmState> {
    const result = new Map<string, AlarmState>();
    for (const [id] of this.entries) {
      result.set(id, this.getState(id));
    }
    return result;
  }

  /** Completely remove alarm state for a PTY (used when PTY is destroyed) */
  remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.clearBucketRefillTimer(entry);
    entry.monitor?.dispose();
    this.entries.delete(id);
    if (this.attentionId === id) {
      this.attentionId = null;
      this.clearAttentionTimer();
    }
    this.notify(id);
  }

  /**
   * Seed alarm state from a persisted session (cold-start restore).
   * Creates an entry with the saved todo state and, if the alarm was enabled,
   * creates a fresh ActivityMonitor (it will start in NOTHING_TO_SHOW until
   * PTY data arrives).
   */
  restore(id: string, state: { status: string; todo: TodoState }): void {
    const entry = this.getOrCreateEntry(id);
    entry.todo = state.todo;
    // If the alarm was enabled (anything other than ALARM_DISABLED), create a monitor
    if (state.status !== 'ALARM_DISABLED') {
      if (!entry.monitor) {
        entry.monitor = this.createMonitor(id);
      }
    }
    this.notify(id);
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.clearBucketRefillTimer(entry);
      entry.monitor?.dispose();
    }
    this.entries.clear();
    this.listeners.clear();
    this.clearAttentionTimer();
  }

  // --- Internals ---

  private getOrCreateEntry(id: string): AlarmEntry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { monitor: null, todo: TODO_OFF, attentionDismissedRing: false, bucketLastDrainAt: 0, bucketRefillTimer: null };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private clearBucketRefillTimer(entry: AlarmEntry): void {
    if (entry.bucketRefillTimer !== null) {
      clearTimeout(entry.bucketRefillTimer);
      entry.bucketRefillTimer = null;
    }
  }

  private notify(id: string): void {
    const state = this.getState(id);
    for (const listener of this.listeners) {
      listener(id, state);
    }
  }
}
