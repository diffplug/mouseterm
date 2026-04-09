import type { AlarmState } from '../alarm-manager';

export interface PtyInfo {
  id: string;
  alive: boolean;
  exitCode?: number;
}

export type AlarmStateDetail = { id: string } & AlarmState;

export interface PlatformAdapter {
  // Lifecycle
  init(): Promise<void>;
  shutdown(): void;

  // PTY operations
  spawnPty(id: string, options?: { cols?: number; rows?: number; cwd?: string }): void;
  writePty(id: string, data: string): void;
  resizePty(id: string, cols: number, rows: number): void;
  killPty(id: string): void;

  // PTY queries
  getCwd(id: string): Promise<string | null>;
  getScrollback(id: string): Promise<string | null>;

  // PTY event listeners
  onPtyData(handler: (detail: { id: string; data: string }) => void): void;
  offPtyData(handler: (detail: { id: string; data: string }) => void): void;
  onPtyExit(handler: (detail: { id: string; exitCode: number }) => void): void;
  offPtyExit(handler: (detail: { id: string; exitCode: number }) => void): void;

  // Reconnection
  requestInit(): void;
  onPtyList(handler: (detail: { ptys: PtyInfo[] }) => void): void;
  offPtyList(handler: (detail: { ptys: PtyInfo[] }) => void): void;
  onPtyReplay(handler: (detail: { id: string; data: string }) => void): void;
  offPtyReplay(handler: (detail: { id: string; data: string }) => void): void;

  // Host-initiated session persistence
  onRequestSessionFlush(handler: (detail: { requestId: string }) => void): void;
  offRequestSessionFlush(handler: (detail: { requestId: string }) => void): void;
  notifySessionFlushComplete(requestId: string): void;

  // Alarm management
  alarmRemove(id: string): void;
  alarmToggle(id: string): void;
  alarmDisable(id: string): void;
  alarmDismiss(id: string): void;
  alarmDismissOrToggle(id: string, displayedStatus: string): void;
  alarmAttend(id: string): void;
  alarmResize(id: string): void;
  alarmClearAttention(id?: string): void;
  alarmToggleTodo(id: string): void;
  alarmMarkTodo(id: string): void;
  alarmClearTodo(id: string): void;
  alarmDrainTodoBucket(id: string): void;
  onAlarmState(handler: (detail: AlarmStateDetail) => void): void;
  offAlarmState(handler: (detail: AlarmStateDetail) => void): void;

  // State persistence
  saveState(state: unknown): void;
  getState(): unknown;
}
