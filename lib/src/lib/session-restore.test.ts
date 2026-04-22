import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from './platform/types';
import type { PersistedSession } from './session-types';

const terminalRegistryMocks = vi.hoisted(() => ({
  getDefaultShellOpts: vi.fn(),
  restoreTerminal: vi.fn(),
}));

vi.mock('./terminal-registry', () => ({
  getDefaultShellOpts: terminalRegistryMocks.getDefaultShellOpts,
  restoreTerminal: terminalRegistryMocks.restoreTerminal,
}));

import { restoreSession } from './session-restore';

function createPlatform(savedState: PersistedSession | null): PlatformAdapter {
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
    onPtyData: vi.fn(),
    offPtyData: vi.fn(),
    onPtyExit: vi.fn(),
    offPtyExit: vi.fn(),
    requestInit: vi.fn(),
    onPtyList: vi.fn(),
    offPtyList: vi.fn(),
    onPtyReplay: vi.fn(),
    offPtyReplay: vi.fn(),
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

describe('restoreSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns restored terminals with the configured default shell', () => {
    terminalRegistryMocks.getDefaultShellOpts.mockReturnValue({
      shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      args: ['-NoLogo'],
    });
    const saved: PersistedSession = {
      version: 1,
      layout: { panels: { 'pane-a': {} } },
      panes: [
        { id: 'pane-a', title: 'Pane A', cwd: 'C:\\repo', scrollback: 'hello', resumeCommand: null },
      ],
    };

    restoreSession(createPlatform(saved));

    expect(terminalRegistryMocks.restoreTerminal).toHaveBeenCalledWith('pane-a', {
      cwd: 'C:\\repo',
      scrollback: 'hello',
      title: 'Pane A',
      shell: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      args: ['-NoLogo'],
    });
  });
});
