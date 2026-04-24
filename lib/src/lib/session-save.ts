import type { PlatformAdapter } from './platform/types';
import { readPersistedSession, type PersistedDoor, type PersistedPane, type PersistedSession } from './session-types';
import { detectResumeCommand } from './resume-patterns';
import { getLivePersistedAlertState, resolveTerminalSessionId } from './terminal-registry';

function getPreviousPaneMap(platform: PlatformAdapter): Map<string, PersistedPane> {
  const saved = readPersistedSession(platform.getState());
  if (!saved || !Array.isArray(saved.panes)) {
    return new Map();
  }
  return new Map(saved.panes.map((pane) => [pane.id, pane]));
}

export async function saveSession(
  platform: PlatformAdapter,
  layout: unknown,
  panes: Array<{ id: string; title: string }>,
  doors: PersistedDoor[] = [],
): Promise<void> {
  const previousPanes = getPreviousPaneMap(platform);
  const allPanes = new Map<string, { id: string; title: string }>();
  for (const pane of panes) {
    allPanes.set(pane.id, pane);
  }
  for (const item of doors) {
    allPanes.set(item.id, { id: item.id, title: item.title });
  }

  const persisted: PersistedPane[] = await Promise.all(
    [...allPanes.values()].map(async (pane) => {
      const previousPane = previousPanes.get(pane.id);
      const liveAlert = getLivePersistedAlertState(pane.id);
      const sessionId = resolveTerminalSessionId(pane.id);
      const [scrollback, cwd] = await Promise.all([
        platform.getScrollback(sessionId),
        platform.getCwd(sessionId),
      ]);
      const resolvedScrollback = scrollback ?? previousPane?.scrollback ?? null;
      return {
        id: pane.id,
        title: pane.title,
        cwd: cwd ?? previousPane?.cwd ?? null,
        scrollback: resolvedScrollback,
        resumeCommand: resolvedScrollback ? detectResumeCommand(resolvedScrollback) : null,
        alert: liveAlert ?? previousPane?.alert ?? null,
      };
    }),
  );
  const session: PersistedSession = { version: 2, panes: persisted, doors, layout };
  platform.saveState(session);
}
