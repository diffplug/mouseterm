import { ActivityMonitor, type SessionStatus } from './activity-monitor';
import { cfg } from '../cfg';

export { type SessionStatus } from './activity-monitor';

export type TodoState = false | 'soft' | 'hard';
export type AlarmButtonActionResult = 'enabled' | 'disabled' | 'dismissed' | 'noop';

export interface AlarmState {
  status: SessionStatus;
  todo: TodoState;
  /** Used by dismissOrToggleAlarm to detect post-attention dismiss */
  attentionDismissedRing: boolean;
}

export const DEFAULT_ALARM_STATE: AlarmState = {
  status: 'ALARM_DISABLED',
  todo: false,
  attentionDismissedRing: false,
};

interface AlarmEntry {
  monitor: ActivityMonitor | null;
  todo: TodoState;
  attentionDismissedRing: boolean;
}

const T_USER_ATTENTION = cfg.alarm.userAttention;

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
      if (entry.todo === false) {
        entry.todo = 'soft';
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
    if (entry.todo === false) {
      entry.todo = 'soft';
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

  /** Toggle: false → hard, soft → hard, hard → false */
  toggleTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === 'hard') {
      entry.todo = false;
      this.notify(id);
    } else {
      entry.todo = 'hard';
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
    if (entry.todo === 'hard' && !isRinging) return;
    entry.todo = 'hard';
    if (isRinging) {
      entry.monitor!.attend();
      return; // onChange fires → notify
    }
    this.notify(id);
  }

  /** Promote soft TODO to hard */
  promoteTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo !== 'soft') return;
    entry.todo = 'hard';
    this.notify(id);
  }

  /** Explicitly set to soft TODO */
  softTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === 'soft') return;
    entry.todo = 'soft';
    this.notify(id);
  }

  /** Clear any TODO state */
  clearTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (entry.todo === false) return;
    entry.todo = false;
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
      entry = { monitor: null, todo: false, attentionDismissedRing: false };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private notify(id: string): void {
    const state = this.getState(id);
    for (const listener of this.listeners) {
      listener(id, state);
    }
  }
}
