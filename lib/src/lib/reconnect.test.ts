import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, PtyInfo } from './platform/types';
import type { PersistedSession } from './session-types';

const terminalRegistryMocks = vi.hoisted(() => ({
  reconnectTerminal: vi.fn(),
  restoreTerminal: vi.fn(),
}));

vi.mock('./terminal-registry', () => ({
  reconnectTerminal: terminalRegistryMocks.reconnectTerminal,
  restoreTerminal: terminalRegistryMocks.restoreTerminal,
}));

import { reconnectFromInit } from './reconnect';

function createPlatform(ptys: PtyInfo[], savedState: PersistedSession | null): PlatformAdapter {
  const listHandlers = new Set<(detail: { ptys: PtyInfo[] }) => void>();
  const replayHandlers = new Set<(detail: { id: string; data: string }) => void>();

  return {
    init: async () => {},
    shutdown: () => {},
    getAvailableShells: vi.fn(async () => []),
    spawnPty: vi.fn(),
    writePty: vi.fn(),
    resizePty: vi.fn(),
    killPty: vi.fn(),
    getCwd: vi.fn(async () => null),
    getScrollback: vi.fn(async () => null),
    readClipboardFilePaths: vi.fn(async () => null),
    readClipboardImageAsFilePath: vi.fn(async () => null),
    saveDroppedBytesToTempFile: vi.fn(async () => null),
    onPtyData: vi.fn(),
    offPtyData: vi.fn(),
    onPtyExit: vi.fn(),
    offPtyExit: vi.fn(),
    requestInit: vi.fn(() => {
      for (const handler of listHandlers) handler({ ptys });
      for (const pty of ptys) {
        for (const handler of replayHandlers) handler({ id: pty.id, data: `${pty.id}-replay` });
      }
    }),
    onPtyList: (handler) => { listHandlers.add(handler); },
    offPtyList: (handler) => { listHandlers.delete(handler); },
    onPtyReplay: (handler) => { replayHandlers.add(handler); },
    offPtyReplay: (handler) => { replayHandlers.delete(handler); },
    onRequestSessionFlush: vi.fn(),
    offRequestSessionFlush: vi.fn(),
    notifySessionFlushComplete: vi.fn(),
    alarmRemove: vi.fn(),
    alarmToggle: vi.fn(),
    alarmDisable: vi.fn(),
    alarmDismiss: vi.fn(),
    alarmDismissOrToggle: vi.fn(),
    alarmAttend: vi.fn(),
    alarmResize: vi.fn(),
    alarmClearAttention: vi.fn(),
    alarmToggleTodo: vi.fn(),
    alarmMarkTodo: vi.fn(),
    alarmClearTodo: vi.fn(),
    alarmDrainTodoBucket: vi.fn(),
    onAlarmState: vi.fn(),
    offAlarmState: vi.fn(),
    saveState: vi.fn(),
    getState: vi.fn(() => savedState),
  };
}

describe('reconnectFromInit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores saved visible layout and detached doors for matching live PTYs', async () => {
    const layout = {
      panels: {
        'pane-a': {},
        'pane-b': {},
      },
    };
    const detached = [{
      id: 'pane-c',
      title: 'Pane C',
      neighborId: 'pane-b',
      direction: 'right' as const,
      remainingPanelIds: ['pane-a', 'pane-b'],
      restoreLayout: layout,
      detachedLayoutSignature: 'sig',
    }];
    const saved: PersistedSession = {
      version: 1,
      layout,
      detached,
      panes: [
        { id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null },
        { id: 'pane-b', title: 'Pane B', cwd: null, scrollback: null, resumeCommand: null },
        { id: 'pane-c', title: 'Pane C', cwd: null, scrollback: null, resumeCommand: null },
      ],
    };

    const result = await reconnectFromInit(createPlatform([
      { id: 'pane-a', alive: true },
      { id: 'pane-b', alive: true },
      { id: 'pane-c', alive: true },
    ], saved));

    expect(result).toEqual({
      paneIds: ['pane-a', 'pane-b'],
      detached,
      layout,
    });
    expect(terminalRegistryMocks.reconnectTerminal).toHaveBeenCalledWith('pane-c', 'pane-c-replay', {
      alive: true,
      exitCode: undefined,
    });
  });

  it('does not reuse a saved layout when live PTYs do not match saved panes', async () => {
    const saved: PersistedSession = {
      version: 1,
      layout: { panels: { 'pane-a': {}, 'pane-b': {} } },
      panes: [
        { id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null },
        { id: 'pane-b', title: 'Pane B', cwd: null, scrollback: null, resumeCommand: null },
      ],
    };

    const result = await reconnectFromInit(createPlatform([
      { id: 'pane-a', alive: true },
      { id: 'pane-b', alive: true },
      { id: 'extra-pane', alive: true },
    ], saved));

    expect(result).toEqual({
      paneIds: ['pane-a', 'pane-b', 'extra-pane'],
      detached: [],
    });
  });

  it('ignores stale saved panes when the saved layout still matches live visible panes', async () => {
    const layout = { panels: { 'pane-a': {}, 'pane-b': {} } };
    const saved: PersistedSession = {
      version: 1,
      layout,
      panes: [
        { id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null },
        { id: 'pane-b', title: 'Pane B', cwd: null, scrollback: null, resumeCommand: null },
        { id: 'stale-pane', title: 'Stale Pane', cwd: null, scrollback: null, resumeCommand: null },
      ],
    };

    const result = await reconnectFromInit(createPlatform([
      { id: 'pane-a', alive: true },
      { id: 'pane-b', alive: true },
    ], saved));

    expect(result).toEqual({
      paneIds: ['pane-a', 'pane-b'],
      detached: [],
      layout,
    });
  });
});
