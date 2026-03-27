import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from './platform/types';
import type { PersistedSession } from './session-types';
import { TODO_HARD } from './alarm-manager';

const terminalRegistryMocks = vi.hoisted(() => ({
  getLivePersistedAlarmState: vi.fn(),
  resolveTerminalSessionId: vi.fn(),
}));

vi.mock('./terminal-registry', () => ({
  getLivePersistedAlarmState: terminalRegistryMocks.getLivePersistedAlarmState,
  resolveTerminalSessionId: terminalRegistryMocks.resolveTerminalSessionId,
}));

import { saveSession } from './session-save';

function createPlatform(savedState: PersistedSession | null): PlatformAdapter {
  let persistedState: unknown = savedState;

  return {
    init: async () => {},
    shutdown: () => {},
    spawnPty: () => {},
    writePty: () => {},
    resizePty: () => {},
    killPty: () => {},
    getCwd: vi.fn(async () => '/tmp/live'),
    getScrollback: vi.fn(async () => 'echo hello\n'),
    onPtyData: () => {},
    offPtyData: () => {},
    onPtyExit: () => {},
    offPtyExit: () => {},
    requestInit: () => {},
    onPtyList: () => {},
    offPtyList: () => {},
    onPtyReplay: () => {},
    offPtyReplay: () => {},
    onRequestSessionFlush: () => {},
    offRequestSessionFlush: () => {},
    notifySessionFlushComplete: () => {},
    alarmRemove: () => {},
    alarmToggle: () => {},
    alarmDisable: () => {},
    alarmDismiss: () => {},
    alarmDismissOrToggle: () => {},
    alarmAttend: () => {},
    alarmResize: () => {},
    alarmClearAttention: () => {},
    alarmToggleTodo: () => {},
    alarmMarkTodo: () => {},
    alarmPromoteTodo: () => {},
    alarmClearTodo: () => {},
    alarmDrainTodoBucket: () => {},
    onAlarmState: () => {},
    offAlarmState: () => {},
    saveState: vi.fn((state: unknown) => {
      persistedState = state;
    }),
    getState: vi.fn(() => persistedState),
  };
}

describe('saveSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalRegistryMocks.resolveTerminalSessionId.mockImplementation((id: string) => id);
    terminalRegistryMocks.getLivePersistedAlarmState.mockReturnValue(null);
  });

  it('persists the live alarm state even when the previous snapshot was empty', async () => {
    const platform = createPlatform({
      version: 1,
      layout: null,
      panes: [{ id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null, alarm: null }],
    });

    terminalRegistryMocks.getLivePersistedAlarmState.mockReturnValue({ status: 'NOTHING_TO_SHOW', todo: TODO_HARD });

    await saveSession(platform, { root: true }, [{ id: 'pane-a', title: 'Pane A' }]);

    expect(platform.saveState).toHaveBeenCalledWith({
      version: 1,
      layout: { root: true },
      detached: [],
      panes: [
        expect.objectContaining({
          id: 'pane-a',
          alarm: { status: 'NOTHING_TO_SHOW', todo: TODO_HARD },
        }),
      ],
    });
  });

  it('reads PTY data from the swapped terminal session id but persists the pane id', async () => {
    const platform = createPlatform(null);
    terminalRegistryMocks.resolveTerminalSessionId.mockReturnValue('pane-b');

    await saveSession(platform, { root: true }, [{ id: 'pane-a', title: 'Pane A' }]);

    expect(platform.getScrollback).toHaveBeenCalledWith('pane-b');
    expect(platform.getCwd).toHaveBeenCalledWith('pane-b');
    expect(platform.saveState).toHaveBeenCalledWith({
      version: 1,
      layout: { root: true },
      detached: [],
      panes: [
        expect.objectContaining({
          id: 'pane-a',
          cwd: '/tmp/live',
          scrollback: 'echo hello\n',
        }),
      ],
    });
  });
});
