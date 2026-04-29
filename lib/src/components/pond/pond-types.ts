import type { SerializedDockview } from 'dockview-react';
import type { PersistedDoor } from '../../lib/session-types';

export type DooredItem = Omit<PersistedDoor, 'layoutAtMinimize'> & {
  layoutAtMinimize: SerializedDockview | null;
};

export type PondMode = 'command' | 'passthrough';

export type PondSelectionKind = 'pane' | 'door';

export type PondEvent =
  | { type: 'modeChange'; mode: PondMode }
  | { type: 'zoomChange'; zoomed: boolean }
  | { type: 'minimizeChange'; count: number }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; source: 'keyboard' | 'mouse' }
  | { type: 'selectionChange'; id: string | null; kind: PondSelectionKind };

export type SpawnDirection = 'left' | 'top' | 'top-left';
