/** Host-owned auxiliary identity survives live renderer reconnection. */
export interface HelperIdentity { parentId: string; command: string }
export type TerminalContextRequest =
  | { op: 'info'; id: string }
  | { op: 'promote'; id: string; restore?: HelperIdentity }
  | { op: 'openDirectory'; id: string; path: string }
  | { op: 'settings'; command?: string };
export interface TerminalContextInfo {
  home: string;
  /** null means inspection failed; never treat that as idle. */
  busy: boolean | null;
  command: string;
  error?: string;
}
