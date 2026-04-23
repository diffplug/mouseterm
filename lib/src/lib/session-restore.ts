import type { PlatformAdapter } from './platform/types';
import type { PersistedDoor, PersistedSession } from './session-types';
import { getDefaultShellOpts, restoreTerminal } from './terminal-registry';

export interface RestoredSession {
  paneIds: string[];
  layout: unknown;
  detached: PersistedDoor[];
}

export function restoreSession(platform: PlatformAdapter): RestoredSession | null {
  const saved = platform.getState() as PersistedSession | null;
  if (!saved || saved.version !== 1 || !saved.panes || saved.panes.length === 0) return null;
  const detached = saved.detached ?? [];
  const detachedIds = new Set(detached.map((item) => item.id));
  const shellOpts = getDefaultShellOpts();

  for (const pane of saved.panes) {
    restoreTerminal(pane.id, {
      cwd: pane.cwd,
      scrollback: pane.scrollback,
      title: pane.title,
      shell: shellOpts?.shell,
      args: shellOpts?.args,
    });
  }

  return {
    paneIds: saved.panes.filter((pane) => !detachedIds.has(pane.id)).map((p) => p.id),
    layout: saved.layout,
    detached,
  };
}
