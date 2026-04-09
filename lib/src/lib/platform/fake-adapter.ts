import type { AlarmStateDetail, PlatformAdapter, PtyInfo } from './types';
import { AlarmManager, type SessionStatus } from '../alarm-manager';

export interface FakeScenario {
  name: string;
  chunks: { delay: number; data: string }[];
  exitCode?: number;
}

export class FakePtyAdapter implements PlatformAdapter {
  private dataHandlers = new Set<(detail: { id: string; data: string }) => void>();
  private exitHandlers = new Set<(detail: { id: string; exitCode: number }) => void>();
  private alarmStateHandlers = new Set<(detail: AlarmStateDetail) => void>();
  private terminals = new Set<string>();
  private activeTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
  private defaultScenario: FakeScenario | null = null;
  private scenarioMap = new Map<string, FakeScenario>();
  private inputHandlers = new Map<string, (data: string) => void>();
  private alarmManager = new AlarmManager();

  constructor() {
    this.alarmManager.onStateChange((id, state) => {
      for (const handler of this.alarmStateHandlers) {
        handler({ id, ...state });
      }
    });
  }

  async init(): Promise<void> {}
  shutdown(): void {
    this.reset();
  }

  setDefaultScenario(scenario: FakeScenario): void {
    this.defaultScenario = scenario;
  }

  clearDefaultScenario(): void {
    this.defaultScenario = null;
  }

  setScenario(id: string, scenario: FakeScenario): void {
    this.scenarioMap.set(id, scenario);
  }

  clearScenario(id: string): void {
    this.scenarioMap.delete(id);
  }

  reset(): void {
    for (const timers of this.activeTimers.values()) {
      timers.forEach(clearTimeout);
    }
    this.activeTimers.clear();
    this.terminals.clear();
    this.defaultScenario = null;
    this.scenarioMap.clear();
    this.dataHandlers.clear();
    this.exitHandlers.clear();
    this.alarmManager.dispose();
    this.alarmManager = new AlarmManager();
    this.alarmManager.onStateChange((id, state) => {
      for (const handler of this.alarmStateHandlers) {
        handler({ id, ...state });
      }
    });
  }

  spawnPty(id: string): void {
    this.terminals.add(id);
    const scenario = this.scenarioMap.get(id) ?? this.defaultScenario;
    if (scenario) {
      this.playScenario(id, scenario);
    }
  }

  writePty(id: string, data: string): void {
    if (!this.terminals.has(id)) return;
    // Only echo if no scenario is actively playing
    if (this.activeTimers.has(id)) return;
    // Route to custom input handler if set
    const inputHandler = this.inputHandlers.get(id);
    if (inputHandler) {
      inputHandler(data);
      return;
    }
    this.alarmManager.onData(id);
    for (const handler of this.dataHandlers) {
      handler({ id, data });
    }
  }

  resizePty(_id: string, _cols: number, _rows: number): void {}

  killPty(id: string): void {
    const timers = this.activeTimers.get(id);
    if (timers) {
      timers.forEach(clearTimeout);
      this.activeTimers.delete(id);
    }
    this.terminals.delete(id);
    for (const handler of this.exitHandlers) {
      handler({ id, exitCode: 0 });
    }
  }

  onPtyData(handler: (detail: { id: string; data: string }) => void): void {
    this.dataHandlers.add(handler);
  }

  offPtyData(handler: (detail: { id: string; data: string }) => void): void {
    this.dataHandlers.delete(handler);
  }

  onPtyExit(handler: (detail: { id: string; exitCode: number }) => void): void {
    this.exitHandlers.add(handler);
  }

  offPtyExit(handler: (detail: { id: string; exitCode: number }) => void): void {
    this.exitHandlers.delete(handler);
  }

  async getCwd(_id: string): Promise<string | null> { return null; }
  async getScrollback(_id: string): Promise<string | null> { return null; }

  requestInit(): void {}
  onPtyList(_handler: (detail: { ptys: PtyInfo[] }) => void): void {}
  offPtyList(_handler: (detail: { ptys: PtyInfo[] }) => void): void {}
  onPtyReplay(_handler: (detail: { id: string; data: string }) => void): void {}
  offPtyReplay(_handler: (detail: { id: string; data: string }) => void): void {}
  onRequestSessionFlush(_handler: (detail: { requestId: string }) => void): void {}
  offRequestSessionFlush(_handler: (detail: { requestId: string }) => void): void {}
  notifySessionFlushComplete(_requestId: string): void {}

  // Alarm management (local AlarmManager, same as TauriAdapter)
  alarmRemove(id: string): void { this.alarmManager.remove(id); }
  alarmToggle(id: string): void { this.alarmManager.toggleAlarm(id); }
  alarmDisable(id: string): void { this.alarmManager.disableAlarm(id); }
  alarmDismiss(id: string): void { this.alarmManager.dismissAlarm(id); }
  alarmDismissOrToggle(id: string, displayedStatus: string): void { this.alarmManager.dismissOrToggleAlarm(id, displayedStatus as SessionStatus); }
  alarmAttend(id: string): void { this.alarmManager.attend(id); }
  alarmResize(id: string): void { this.alarmManager.onResize(id); }
  alarmClearAttention(id?: string): void { this.alarmManager.clearAttention(id); }
  alarmToggleTodo(id: string): void { this.alarmManager.toggleTodo(id); }
  alarmMarkTodo(id: string): void { this.alarmManager.markTodo(id); }
  alarmPromoteTodo(id: string): void { this.alarmManager.promoteTodo(id); }
  alarmClearTodo(id: string): void { this.alarmManager.clearTodo(id); }
  alarmDrainTodoBucket(id: string): void { this.alarmManager.drainTodoBucket(id); }
  onAlarmState(handler: (detail: AlarmStateDetail) => void): void { this.alarmStateHandlers.add(handler); }
  offAlarmState(handler: (detail: AlarmStateDetail) => void): void { this.alarmStateHandlers.delete(handler); }

  private savedState: unknown = null;
  saveState(state: unknown): void { this.savedState = state; }
  getState(): unknown { return this.savedState; }

  /** Register a custom input handler for a terminal. When set, `writePty` routes
   *  keystrokes to this handler instead of the default echo behavior. */
  setInputHandler(id: string, handler: (data: string) => void): void {
    this.inputHandlers.set(id, handler);
  }

  clearInputHandler(id: string): void {
    this.inputHandlers.delete(id);
  }

  /** Send data to a terminal's output (as if the PTY produced it). */
  sendOutput(id: string, data: string): void {
    if (!this.terminals.has(id)) return;
    for (const handler of this.dataHandlers) {
      handler({ id, data });
    }
  }

  private playScenario(id: string, scenario: FakeScenario): void {
    const timers: ReturnType<typeof setTimeout>[] = [];
    this.activeTimers.set(id, timers);

    let cumulativeDelay = 0;
    for (const chunk of scenario.chunks) {
      cumulativeDelay += chunk.delay;
      const timer = setTimeout(() => {
        if (!this.terminals.has(id)) return;
        this.alarmManager.onData(id);
        for (const handler of this.dataHandlers) {
          handler({ id, data: chunk.data });
        }
      }, cumulativeDelay);
      timers.push(timer);
    }

    if (scenario.exitCode !== undefined) {
      const exitTimer = setTimeout(() => {
        if (!this.terminals.has(id)) return;
        this.activeTimers.delete(id);
        this.alarmManager.onExit(id);
        for (const handler of this.exitHandlers) {
          handler({ id, exitCode: scenario.exitCode ?? 0 });
        }
      }, cumulativeDelay + 100);
      timers.push(exitTimer);
    } else {
      // Clean up timer tracking after last chunk fires (terminal stays alive)
      const cleanupTimer = setTimeout(() => {
        this.activeTimers.delete(id);
      }, cumulativeDelay + 1);
      timers.push(cleanupTimer);
    }
  }
}
