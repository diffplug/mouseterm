import type { DoorDirection } from './spatial-nav';
import type { SessionStatus } from './activity-monitor';
import type { TodoState } from './alert-manager';

export interface PersistedAlertState {
  status: SessionStatus;
  todo: TodoState;
}

export interface PersistedPane {
  id: string;
  cwd: string | null;
  title: string;
  scrollback: string | null;
  resumeCommand: string | null;
  alert?: PersistedAlertState | null;
}

export interface PersistedDoor {
  id: string;
  title: string;
  neighborId: string | null;
  direction: DoorDirection;
  remainingPaneIds: string[];
  layoutAtMinimize: unknown;
  layoutAtMinimizeSignature: string;
}

export interface PersistedSession {
  version: 2;
  panes: PersistedPane[];
  doors?: PersistedDoor[];
  layout: unknown; // SerializedDockview — kept as `unknown` to avoid dockview dep in types
}

// --- Legacy v1 shapes (read-only, for migration) ---

export interface PersistedDoorV1 {
  id: string;
  title: string;
  neighborId: string | null;
  direction: DoorDirection;
  remainingPanelIds: string[];
  restoreLayout: unknown;
  detachedLayoutSignature: string;
}

export interface PersistedSessionV1 {
  version: 1;
  panes: PersistedPane[];
  detached?: PersistedDoorV1[];
  layout: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPersistedAlertState(value: unknown): value is PersistedAlertState {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return typeof value.status === 'string' && (typeof value.todo === 'number' || typeof value.todo === 'boolean');
}

function isPersistedPane(value: unknown): value is PersistedPane {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.cwd === 'string' || value.cwd === null) &&
    (typeof value.scrollback === 'string' || value.scrollback === null) &&
    (typeof value.resumeCommand === 'string' || value.resumeCommand === null) &&
    (value.alert === undefined || isPersistedAlertState(value.alert))
  );
}

function isPersistedDoorV1(value: unknown): value is PersistedDoorV1 {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.neighborId === 'string' || value.neighborId === null) &&
    typeof value.direction === 'string' &&
    Array.isArray(value.remainingPanelIds) &&
    value.remainingPanelIds.every((id) => typeof id === 'string') &&
    typeof value.detachedLayoutSignature === 'string'
  );
}

function isPersistedDoor(value: unknown): value is PersistedDoor {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.neighborId === 'string' || value.neighborId === null) &&
    typeof value.direction === 'string' &&
    Array.isArray(value.remainingPaneIds) &&
    value.remainingPaneIds.every((id) => typeof id === 'string') &&
    typeof value.layoutAtMinimizeSignature === 'string'
  );
}

function isPersistedSessionV1(value: unknown): value is PersistedSessionV1 {
  if (!isRecord(value) || value.version !== 1) return false;
  return (
    Array.isArray(value.panes) &&
    value.panes.every(isPersistedPane) &&
    (value.detached === undefined || (Array.isArray(value.detached) && value.detached.every(isPersistedDoorV1))) &&
    'layout' in value
  );
}

function isPersistedSessionV2(value: unknown): value is PersistedSession {
  if (!isRecord(value) || value.version !== 2) return false;
  return (
    Array.isArray(value.panes) &&
    value.panes.every(isPersistedPane) &&
    (value.doors === undefined || (Array.isArray(value.doors) && value.doors.every(isPersistedDoor))) &&
    'layout' in value
  );
}

export function migrateSessionV1toV2(v1: PersistedSessionV1): PersistedSession {
  return {
    version: 2,
    panes: v1.panes,
    layout: v1.layout,
    doors: (v1.detached ?? []).map((door) => ({
      id: door.id,
      title: door.title,
      neighborId: door.neighborId,
      direction: door.direction,
      remainingPaneIds: door.remainingPanelIds,
      layoutAtMinimize: door.restoreLayout,
      layoutAtMinimizeSignature: door.detachedLayoutSignature,
    })),
  };
}

export function readPersistedSession(raw: unknown): PersistedSession | null {
  if (!isRecord(raw)) return null;
  if (isPersistedSessionV2(raw)) return raw;
  if (isPersistedSessionV1(raw)) return migrateSessionV1toV2(raw);
  return null;
}
