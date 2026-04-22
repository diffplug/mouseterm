import type { AlarmStateDetail, PlatformAdapter, PtyInfo } from './types';
import { setDefaultShellOpts } from '../shell-defaults';

export class VSCodeAdapter implements PlatformAdapter {
  private vscode: ReturnType<typeof acquireVsCodeApi>;
  private hostState: unknown = (globalThis as typeof globalThis & { __MOUSETERM_HOST_STATE__?: unknown }).__MOUSETERM_HOST_STATE__ ?? null;
  private dataHandlers = new Set<(detail: { id: string; data: string }) => void>();
  private exitHandlers = new Set<(detail: { id: string; exitCode: number }) => void>();
  private listHandlers = new Set<(detail: { ptys: PtyInfo[] }) => void>();
  private replayHandlers = new Set<(detail: { id: string; data: string }) => void>();
  private flushRequestHandlers = new Set<(detail: { requestId: string }) => void>();
  private alarmStateHandlers = new Set<(detail: AlarmStateDetail) => void>();

  constructor() {
    this.vscode = acquireVsCodeApi();

    // Seed the default shell from the extension-injected global so that
    // the first terminal on startup (which spawns synchronously on Pond
    // mount) picks up the selected shell, not the platform default.
    const injectedShell = (globalThis as typeof globalThis & {
      __MOUSETERM_SELECTED_SHELL__?: { shell?: string; args?: string[] } | null;
    }).__MOUSETERM_SELECTED_SHELL__;
    if (injectedShell?.shell) {
      setDefaultShellOpts({ shell: injectedShell.shell, args: injectedShell.args });
    }

    window.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'pty:data') {
        for (const handler of this.dataHandlers) {
          handler({ id: msg.id, data: msg.data });
        }
      } else if (msg.type === 'pty:exit') {
        for (const handler of this.exitHandlers) {
          handler({ id: msg.id, exitCode: msg.exitCode });
        }
      } else if (msg.type === 'pty:list') {
        for (const handler of this.listHandlers) {
          handler({ ptys: msg.ptys });
        }
      } else if (msg.type === 'pty:replay') {
        for (const handler of this.replayHandlers) {
          handler({ id: msg.id, data: msg.data });
        }
      } else if (msg.type === 'mouseterm:flushSessionSave') {
        for (const handler of this.flushRequestHandlers) {
          handler({ requestId: msg.requestId });
        }
      } else if (msg.type === 'alarm:state') {
        for (const handler of this.alarmStateHandlers) {
          handler({ id: msg.id, status: msg.status, todo: msg.todo, attentionDismissedRing: msg.attentionDismissedRing });
        }
      } else if (msg.type === 'mouseterm:newTerminal') {
        window.dispatchEvent(new CustomEvent('mouseterm:new-terminal', {
          detail: { shell: msg.shell, args: msg.args },
        }));
      } else if (msg.type === 'mouseterm:selectedShell') {
        setDefaultShellOpts(msg.shell ? { shell: msg.shell, args: msg.args } : null);
      }
    });
  }

  private nextRequestId = 0;

  /**
   * Send a request and wait for a matching response.
   * Uses a unique requestId to avoid collisions when multiple concurrent
   * requests target the same PTY ID.
   */
  private requestResponse<T>(requestType: string, responseType: string, data: Record<string, unknown>, extract: (msg: any) => T, timeoutMs = 1000): Promise<T | null> {
    const requestId = `req-${++this.nextRequestId}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(null);
      }, timeoutMs);
      const handler = (event: MessageEvent) => {
        const msg = event.data;
        if (msg?.type === responseType && msg.requestId === requestId) {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(extract(msg));
        }
      };
      window.addEventListener('message', handler);
      this.vscode.postMessage({ type: requestType, ...data, requestId });
    });
  }

  async init(): Promise<void> {
    // No initialization needed — the webview is already running
  }

  shutdown(): void {
    // No-op — the extension host handles cleanup
  }

  async getAvailableShells(): Promise<{ name: string; path: string; args?: string[] }[]> {
    const result = await this.requestResponse(
      'pty:getShells', 'pty:shells', {},
      (msg) => msg.shells as { name: string; path: string; args?: string[] }[],
      5000,
    );
    return result ?? [];
  }

  spawnPty(id: string, options?: { cols?: number; rows?: number; cwd?: string; shell?: string; args?: string[] }): void {
    this.vscode.postMessage({ type: 'pty:spawn', id, options });
  }

  writePty(id: string, data: string): void {
    this.vscode.postMessage({ type: 'pty:input', id, data });
  }

  resizePty(id: string, cols: number, rows: number): void {
    this.vscode.postMessage({ type: 'pty:resize', id, cols, rows });
  }

  killPty(id: string): void {
    this.vscode.postMessage({ type: 'pty:kill', id });
  }

  getCwd(id: string): Promise<string | null> {
    return this.requestResponse('pty:getCwd', 'pty:cwd', { id }, (msg) => msg.cwd);
  }

  getScrollback(id: string): Promise<string | null> {
    return this.requestResponse('pty:getScrollback', 'pty:scrollback', { id }, (msg) => msg.data);
  }

  readClipboardFilePaths(): Promise<string[] | null> {
    return this.requestResponse<string[] | null>(
      'clipboard:readFiles', 'clipboard:files', {},
      (msg) => msg.paths,
      5000,
    );
  }

  readClipboardImageAsFilePath(): Promise<string | null> {
    return this.requestResponse<string | null>(
      'clipboard:readImage', 'clipboard:image', {},
      (msg) => msg.path,
      10000,
    );
  }

  saveDroppedBytesToTempFile(bytes: Uint8Array, filename: string): Promise<string | null> {
    return this.requestResponse<string | null>(
      'file:saveBytes', 'file:savedBytes',
      { filename, bytes: Array.from(bytes) },
      (msg) => msg.path,
      10000,
    );
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
    this.vscode.postMessage({ type: 'mouseterm:init' });
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

  onRequestSessionFlush(handler: (detail: { requestId: string }) => void): void {
    this.flushRequestHandlers.add(handler);
  }

  offRequestSessionFlush(handler: (detail: { requestId: string }) => void): void {
    this.flushRequestHandlers.delete(handler);
  }

  notifySessionFlushComplete(requestId: string): void {
    this.vscode.postMessage({ type: 'mouseterm:flushSessionSaveDone', requestId });
  }

  // --- Alarm management (proxied to extension host) ---

  alarmRemove(id: string): void {
    this.vscode.postMessage({ type: 'alarm:remove', id });
  }

  alarmToggle(id: string): void {
    this.vscode.postMessage({ type: 'alarm:toggle', id });
  }

  alarmDisable(id: string): void {
    this.vscode.postMessage({ type: 'alarm:disable', id });
  }

  alarmDismiss(id: string): void {
    this.vscode.postMessage({ type: 'alarm:dismiss', id });
  }

  alarmDismissOrToggle(id: string, displayedStatus: string): void {
    this.vscode.postMessage({ type: 'alarm:dismissOrToggle', id, displayedStatus });
  }

  alarmAttend(id: string): void {
    this.vscode.postMessage({ type: 'alarm:attend', id });
  }

  alarmResize(id: string): void {
    this.vscode.postMessage({ type: 'alarm:resize', id });
  }

  alarmClearAttention(id?: string): void {
    this.vscode.postMessage({ type: 'alarm:clearAttention', id });
  }

  alarmToggleTodo(id: string): void {
    this.vscode.postMessage({ type: 'alarm:toggleTodo', id });
  }

  alarmMarkTodo(id: string): void {
    this.vscode.postMessage({ type: 'alarm:markTodo', id });
  }

  alarmClearTodo(id: string): void {
    this.vscode.postMessage({ type: 'alarm:clearTodo', id });
  }

  alarmDrainTodoBucket(id: string): void {
    this.vscode.postMessage({ type: 'alarm:drainTodoBucket', id });
  }

  onAlarmState(handler: (detail: AlarmStateDetail) => void): void {
    this.alarmStateHandlers.add(handler);
  }

  offAlarmState(handler: (detail: AlarmStateDetail) => void): void {
    this.alarmStateHandlers.delete(handler);
  }

  // --- State persistence ---

  saveState(state: unknown): void {
    this.hostState = state;
    this.vscode.setState(state);
    this.vscode.postMessage({ type: 'mouseterm:saveState', state });
  }

  getState(): unknown {
    // vscode.getState() is VSCode's own per-webview storage and persists
    // across re-mount (e.g. panel collapsed then re-expanded). Prefer it
    // so splits made after initial resolve aren't lost — the injected
    // hostState only reflects what the extension put in the HTML at the
    // first resolveWebviewView call. Fall back to hostState on the very
    // first load, before any setState has run.
    return this.vscode.getState() ?? this.hostState;
  }
}
