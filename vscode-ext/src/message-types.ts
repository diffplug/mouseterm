import type { SessionStatus, TodoState } from '../../lib/src/lib/alarm-manager';

// Messages from webview → extension host
export type WebviewMessage =
  | { type: 'pty:spawn'; id: string; options?: { cols?: number; rows?: number; cwd?: string } }
  | { type: 'pty:input'; id: string; data: string }
  | { type: 'pty:resize'; id: string; cols: number; rows: number }
  | { type: 'pty:kill'; id: string }
  | { type: 'pty:getCwd'; id: string; requestId?: string }
  | { type: 'pty:getScrollback'; id: string; requestId?: string }
  | { type: 'mouseterm:init' }
  | { type: 'mouseterm:saveState'; state: unknown }
  | { type: 'mouseterm:flushSessionSaveDone'; requestId: string }
  // Alarm actions
  | { type: 'alarm:remove'; id: string }
  | { type: 'alarm:toggle'; id: string }
  | { type: 'alarm:disable'; id: string }
  | { type: 'alarm:dismiss'; id: string }
  | { type: 'alarm:dismissOrToggle'; id: string; displayedStatus: string }
  | { type: 'alarm:attend'; id: string }
  | { type: 'alarm:resize'; id: string }
  | { type: 'alarm:clearAttention'; id?: string }
  | { type: 'alarm:toggleTodo'; id: string }
  | { type: 'alarm:markTodo'; id: string }
  | { type: 'alarm:promoteTodo'; id: string }
  | { type: 'alarm:clearTodo'; id: string }
  | { type: 'alarm:drainTodoBucket'; id: string };

export interface PtyInfo {
  id: string;
  alive: boolean;
  exitCode?: number;
}

// Messages from extension host → webview
export type ExtensionMessage =
  | { type: 'pty:data'; id: string; data: string }
  | { type: 'pty:exit'; id: string; exitCode: number }
  | { type: 'pty:list'; ptys: PtyInfo[] }
  | { type: 'pty:replay'; id: string; data: string }
  | { type: 'pty:cwd'; id: string; cwd: string | null; requestId?: string }
  | { type: 'pty:scrollback'; id: string; data: string | null; requestId?: string }
  | { type: 'mouseterm:flushSessionSave'; requestId: string }
  // Alarm state updates
  | { type: 'alarm:state'; id: string; status: SessionStatus; todo: TodoState; attentionDismissedRing: boolean };
