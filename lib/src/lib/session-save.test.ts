import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from './platform/types';
import type { PersistedSession } from './session-types';

const terminalRegistryMocks = vi.hoisted(() => ({
  getLivePersistedAlertState: vi.fn(),
  resolveTerminalSessionId: vi.fn(),
}));

vi.mock('./terminal-registry', () => ({
  getLivePersistedAlertState: terminalRegistryMocks.getLivePersistedAlertState,
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
    getAvailableShells: vi.fn(async () => []),
    getCwd: vi.fn(async () => '/tmp/live'),
    getScrollback: vi.fn(async () => 'echo hello\n'),
    readClipboardFilePaths: vi.fn(async () => null),
    readClipboardImageAsFilePath: vi.fn(async () => null),
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
    alertRemove: () => {},
    alertToggle: () => {},
    alertDisable: () => {},
    alertDismiss: () => {},
    alertDismissOrToggle: () => {},
    alertAttend: () => {},
    alertResize: () => {},
    alertClearAttention: () => {},
    alertToggleTodo: () => {},
    alertMarkTodo: () => {},
    alertClearTodo: () => {},
    onAlertState: () => {},
    offAlertState: () => {},
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
    terminalRegistryMocks.getLivePersistedAlertState.mockReturnValue(null);
  });

  it('persists the live alert state even when the previous snapshot was empty', async () => {
    const platform = createPlatform({
      version: 3,
      layout: null,
      panes: [{ id: 'pane-a', title: 'Pane A', cwd: null, scrollback: null, resumeCommand: null, alert: null }],
    });

    terminalRegistryMocks.getLivePersistedAlertState.mockReturnValue({ status: 'NOTHING_TO_SHOW', todo: true });

    await saveSession(platform, { root: true }, [{ id: 'pane-a', title: 'Pane A' }]);

    expect(platform.saveState).toHaveBeenCalledWith({
      version: 3,
      layout: { root: true },
      doors: [],
      panes: [
        expect.objectContaining({
          id: 'pane-a',
          alert: { status: 'NOTHING_TO_SHOW', todo: true },
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
      version: 3,
      layout: { root: true },
      doors: [],
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
