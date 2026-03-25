import type { DetachDirection } from './spatial-nav';
import type { SessionStatus } from './activity-monitor';
import type { TodoState } from './alarm-manager';

export interface PersistedAlarmState {
  status: SessionStatus;
  todo: TodoState;
}

export interface PersistedPane {
  id: string;
  cwd: string | null;
  title: string;
  scrollback: string | null;
  resumeCommand: string | null;
  alarm?: PersistedAlarmState | null;
}

export interface PersistedDetachedItem {
  id: string;
  title: string;
  neighborId: string | null;
  direction: DetachDirection;
  remainingPanelIds: string[];
  restoreLayout: unknown;
  detachedLayoutSignature: string;
}

export interface PersistedSession {
  version: 1;
  panes: PersistedPane[];
  detached?: PersistedDetachedItem[];
  layout: unknown; // SerializedDockview — kept as `unknown` to avoid dockview dep in types
}
