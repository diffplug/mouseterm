import { invoke as rawInvoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AlarmStateDetail, PlatformAdapter, PtyInfo } from "mouseterm-lib/lib/platform/types";
import { AlarmManager, type SessionStatus } from "mouseterm-lib/lib/alarm-manager";

function invoke(cmd: string, args?: Record<string, unknown>): void {
  rawInvoke(cmd, args).catch((err) =>
    console.error(`[tauri-adapter] ${cmd} failed:`, err),
  );
}

/**
 * Platform adapter for the Tauri standalone app.
 *
 * Communication flow:
 *   Webview (this adapter)
 *     ↕ Tauri IPC (invoke / listen)
 *   Rust backend (src-tauri/src/lib.rs)
 *     ↕ stdin/stdout JSON messages
 *   Node.js sidecar (sidecar/main.js)
 *     ↕ node-pty
 *   Shell processes
 */
export class TauriAdapter implements PlatformAdapter {
  private dataHandlers = new Set<(detail: { id: string; data: string }) => void>();
  private exitHandlers = new Set<(detail: { id: string; exitCode: number }) => void>();
  private listHandlers = new Set<(detail: { ptys: PtyInfo[] }) => void>();
  private replayHandlers = new Set<(detail: { id: string; data: string }) => void>();
  private alarmStateHandlers = new Set<(detail: AlarmStateDetail) => void>();
  private unlistenFns: Array<() => void> = [];
  private alarmManager = new AlarmManager();

  constructor() {
    // Wire alarm manager state changes to handlers
    this.alarmManager.onStateChange((id, state) => {
      for (const handler of this.alarmStateHandlers) {
        handler({ id, ...state });
      }
    });
  }

  async init(): Promise<void> {
    // Set up event listeners for PTY events from the Rust backend
    // (The Rust backend manages the Node.js sidecar lifecycle via std::process::Command)
    this.unlistenFns.push(
      await listen<{ id: string; data: string }>("pty:data", (event) => {
        // Feed data to alarm manager for activity monitoring
        this.alarmManager.onData(event.payload.id);
        for (const handler of this.dataHandlers) {
          handler(event.payload);
        }
      }),
    );

    this.unlistenFns.push(
      await listen<{ id: string; exitCode: number }>("pty:exit", (event) => {
        this.alarmManager.onExit(event.payload.id);
        for (const handler of this.exitHandlers) {
          handler(event.payload);
        }
      }),
    );

    this.unlistenFns.push(
      await listen<{ ptys: PtyInfo[] }>("pty:list", (event) => {
        for (const handler of this.listHandlers) {
          handler(event.payload);
        }
      }),
    );

    this.unlistenFns.push(
      await listen<{ id: string; data: string }>("pty:replay", (event) => {
        for (const handler of this.replayHandlers) {
          handler(event.payload);
        }
      }),
    );
  }

  shutdown(): void {
    this.alarmManager.dispose();
    for (const unlisten of this.unlistenFns) {
      unlisten();
    }
    this.unlistenFns = [];
    invoke("shutdown_sidecar");
  }

  async getAvailableShells(): Promise<{ name: string; path: string; args?: string[] }[]> {
    try {
      return await rawInvoke<{ name: string; path: string; args?: string[] }[]>("get_available_shells");
    } catch { return []; }
  }

  spawnPty(id: string, options?: { cols?: number; rows?: number; cwd?: string; shell?: string; args?: string[] }): void {
    invoke("pty_spawn", { id, options });
  }

  writePty(id: string, data: string): void {
    invoke("pty_write", { id, data });
  }

  resizePty(id: string, cols: number, rows: number): void {
    invoke("pty_resize", { id, cols, rows });
  }

  killPty(id: string): void {
    invoke("pty_kill", { id });
  }

  async getCwd(id: string): Promise<string | null> {
    try {
      return await rawInvoke<string | null>("pty_get_cwd", { id });
    } catch { return null; }
  }

  async getScrollback(id: string): Promise<string | null> {
    try {
      return await rawInvoke<string | null>("pty_get_scrollback", { id });
    } catch { return null; }
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

  requestInit(): void {
    invoke("pty_request_init");
  }

  onPtyList(handler: (detail: { ptys: PtyInfo[] }) => void): void {
    this.listHandlers.add(handler);
  }

  offPtyList(handler: (detail: { ptys: PtyInfo[] }) => void): void {
    this.listHandlers.delete(handler);
  }

  onPtyReplay(handler: (detail: { id: string; data: string }) => void): void {
    this.replayHandlers.add(handler);
  }

  offPtyReplay(handler: (detail: { id: string; data: string }) => void): void {
    this.replayHandlers.delete(handler);
  }

  onRequestSessionFlush(_handler: (detail: { requestId: string }) => void): void {}

  offRequestSessionFlush(_handler: (detail: { requestId: string }) => void): void {}

  notifySessionFlushComplete(_requestId: string): void {}

  // --- Alarm management (local AlarmManager) ---

  alarmRemove(id: string): void {
    this.alarmManager.remove(id);
  }

  alarmToggle(id: string): void {
    this.alarmManager.toggleAlarm(id);
  }

  alarmDisable(id: string): void {
    this.alarmManager.disableAlarm(id);
  }

  alarmDismiss(id: string): void {
    this.alarmManager.dismissAlarm(id);
  }

  alarmDismissOrToggle(id: string, displayedStatus: string): void {
    this.alarmManager.dismissOrToggleAlarm(id, displayedStatus as SessionStatus);
  }

  alarmAttend(id: string): void {
    this.alarmManager.attend(id);
  }

  alarmResize(id: string): void {
    this.alarmManager.onResize(id);
  }

  alarmClearAttention(id?: string): void {
    this.alarmManager.clearAttention(id);
  }

  alarmToggleTodo(id: string): void {
    this.alarmManager.toggleTodo(id);
  }

  alarmMarkTodo(id: string): void {
    this.alarmManager.markTodo(id);
  }

  alarmClearTodo(id: string): void {
    this.alarmManager.clearTodo(id);
  }

  alarmDrainTodoBucket(id: string): void {
    this.alarmManager.drainTodoBucket(id);
  }

  onAlarmState(handler: (detail: AlarmStateDetail) => void): void {
    this.alarmStateHandlers.add(handler);
  }

  offAlarmState(handler: (detail: AlarmStateDetail) => void): void {
    this.alarmStateHandlers.delete(handler);
  }

  // --- State persistence ---

  private static STATE_KEY = 'mouseterm.session';

  saveState(state: unknown): void {
    try {
      localStorage.setItem(TauriAdapter.STATE_KEY, JSON.stringify(state));
    } catch {
      console.error('[tauri-adapter] Failed to save session state');
    }
  }

  getState(): unknown {
    try {
      const raw = localStorage.getItem(TauriAdapter.STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
