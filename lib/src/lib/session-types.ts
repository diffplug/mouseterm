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

/**
 * Migrate a v1 session blob to v2. Renames `detached` → `doors` and per-door
 * fields: `remainingPanelIds` → `remainingPaneIds`, `restoreLayout` →
 * `layoutAtMinimize`, `detachedLayoutSignature` → `layoutAtMinimizeSignature`.
 */
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

/**
 * Read a persisted blob of unknown version and normalize to the current
 * `PersistedSession` shape. Returns null if the blob is missing or malformed.
 */
export function readPersistedSession(raw: unknown): PersistedSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const blob = raw as { version?: number };
  if (blob.version === 2) return raw as PersistedSession;
  if (blob.version === 1) return migrateSessionV1toV2(raw as PersistedSessionV1);
  return null;
}
