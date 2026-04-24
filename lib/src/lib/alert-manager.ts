import { ActivityMonitor, type SessionStatus } from './activity-monitor';
import { cfg } from '../cfg';

export { type SessionStatus } from './activity-monitor';

/** Boolean TODO state: on (true) or off (false). */
export type TodoState = boolean;

/** Migrate legacy persisted TodoState values (numeric, string, boolean) to a boolean. */
export function migrateTodoState(todo: unknown): TodoState {
  if (typeof todo === 'boolean') return todo;
  // v2 numeric encoding: -1 = off, [0,1] = soft, 2 = hard
  if (typeof todo === 'number') return todo !== -1;
  // v1 string encoding: 'soft' | 'hard' | false
  if (todo === 'hard' || todo === 'soft') return true;
  return false;
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
  todo: false,
  attentionDismissedRing: false,
};

interface AlertEntry {
  monitor: ActivityMonitor | null;
  todo: TodoState;
  attentionDismissedRing: boolean;
}

const T_USER_ATTENTION = cfg.alert.userAttention;

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
      entry.todo = true;
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
    entry.todo = true;
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

  toggleTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    entry.todo = !entry.todo;
    if (entry.todo && entry.monitor?.getStatus() === 'ALERT_RINGING') {
      entry.monitor.attend();
      return; // onChange fires → notify
    }
    this.notify(id);
  }

  markTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    const isRinging = entry.monitor?.getStatus() === 'ALERT_RINGING';
    if (entry.todo && !isRinging) return;
    entry.todo = true;
    if (isRinging) {
      entry.monitor!.attend();
      return; // onChange fires → notify
    }
    this.notify(id);
  }

  clearTodo(id: string): void {
    const entry = this.getOrCreateEntry(id);
    if (!entry.todo) return;
    entry.todo = false;
    this.notify(id);
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
  seed(id: string, state: { status: string; todo: unknown }): void {
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
