import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit(): void {}

    proposeDimensions(): { cols: number; rows: number } {
      return { cols: 80, rows: 24 };
    }
  }

  return { FitAddon };
});

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    writes: string[] = [];
    private dataListeners = new Set<(data: string) => void>();
    private resizeListeners = new Set<(size: { cols: number; rows: number }) => void>();

    parser = {
      registerCsiHandler: () => ({ dispose: () => {} }),
    };
    modes = {
      mouseTrackingMode: 'none' as const,
      bracketedPasteMode: false,
    };

    loadAddon(): void {}

    open(): void {}

    write(data: string): void {
      this.writes.push(data);
    }

    onData(listener: (data: string) => void): { dispose: () => void } {
      this.dataListeners.add(listener);
      return {
        dispose: () => {
          this.dataListeners.delete(listener);
        },
      };
    }

    onResize(listener: (size: { cols: number; rows: number }) => void): { dispose: () => void } {
      this.resizeListeners.add(listener);
      return {
        dispose: () => {
          this.resizeListeners.delete(listener);
        },
      };
    }

    onRender(): { dispose: () => void } {
      return { dispose: () => {} };
    }

    focus(): void {}

    blur(): void {}

    dispose(): void {}

    emitInput(data: string): void {
      this.dataListeners.forEach((listener) => listener(data));
    }

    emitResize(cols: number, rows: number): void {
      this.resizeListeners.forEach((listener) => listener({ cols, rows }));
    }
  }

  return { Terminal: MockTerminal };
});

vi.mock('./platform', async () => {
  const actual = await vi.importActual<typeof import('./platform')>('./platform');
  const fakePlatform = new actual.FakePtyAdapter();
  return {
    ...actual,
    getPlatform: () => fakePlatform,
    __fakePlatform: fakePlatform,
  };
});

import * as platformModule from './platform';
import { makeAlertScenario, type FakePtyAdapter, type FakeScenario } from './platform';
import { cfg } from '../cfg';

const STRIKE_RECOVERY_MS = cfg.todoBucket.recoverySecondsPerLetter * 1_000;
import {
  DEFAULT_ACTIVITY_STATE,
  mountElement,
  clearSessionAttention,
  clearSessionTodo,
  disposeAllSessions,
  disposeSession,
  unmountElement,
  disableSessionAlert,
  dismissOrToggleAlert,
  dismissSessionAlert,
  focusSession,
  getOrCreateTerminal,
  getActivity,
  initAlertStateReceiver,
  markSessionAttention,
  markSessionTodo,
  swapTerminals,
  toggleSessionAlert,
  toggleSessionTodo,
  TODO_OFF,
  TODO_SOFT_FULL,
  TODO_HARD,
  isSoftTodo,
} from './terminal-registry';

interface MockTerminalInstance {
  writes: string[];
  emitInput(data: string): void;
  emitResize(cols: number, rows: number): void;
}

class MockElement {
  style: Record<string, string> = {};
  parentElement: MockElement | null = null;
  children: MockElement[] = [];

  appendChild(child: MockElement): MockElement {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) {
      this.parentElement.children.splice(index, 1);
    }
    this.parentElement = null;
  }

  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect(): DOMRect {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
  }
}

type PlatformModuleWithMock = typeof platformModule & { __fakePlatform: FakePtyAdapter };
type TestTerminalEntry = ReturnType<typeof getOrCreateTerminal> & {
  terminal: MockTerminalInstance;
  element: MockElement;
};

const fakePlatform = (platformModule as PlatformModuleWithMock).__fakePlatform;

function createContainer(): MockElement {
  return new MockElement();
}

function createSession(id: string, scenario?: FakeScenario): TestTerminalEntry {
  fakePlatform.clearScenario(id);
  if (scenario) {
    fakePlatform.setScenario(id, scenario);
  }
  return getOrCreateTerminal(id) as TestTerminalEntry;
}

function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
}

function emitOutput(id: string, data = 'output'): void {
  fakePlatform.writePty(id, data);
}

function attendSession(id: string): void {
  markSessionAttention(id);
}

function expireAttention(id?: string): void {
  clearSessionAttention(id);
}

function detachSession(id: string): void {
  unmountElement(id);
  clearSessionAttention(id);
}

function reattachDoorViaEnter(id: string): void {
  mountElement(id, createContainer() as unknown as HTMLElement);
  markSessionAttention(id);
}

function reattachDoorViaD(id: string): void {
  mountElement(id, createContainer() as unknown as HTMLElement);
}

// Timing helpers based on cfg.alert values:
// busyCandidateGap=1500, busyConfirmGap=500, mightNeedAttention=2000, needsAttentionConfirm=3000

function driveToBusy(id: string): void {
  emitOutput(id, 'prompt> ');
  advance(1_600);
  emitOutput(id, 'working...');
  emitOutput(id, 'more work');
  expect(getActivity(id).status).toBe('BUSY');
}

function driveToRingingNeedsAttention(id: string): void {
  driveToBusy(id);
  expireAttention(id);
  advance(2_000);
  expect(getActivity(id).status).toBe('MIGHT_NEED_ATTENTION');
  advance(3_000);
  expect(getActivity(id).status).toBe('ALERT_RINGING');
}

describe('terminal-registry alert behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fakePlatform.reset();
    initAlertStateReceiver();

    const documentElement = new MockElement();
    vi.stubGlobal('document', {
      createElement: () => new MockElement(),
      documentElement,
    });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: () => '#000000',
    }));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('window', {
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    disposeAllSessions();
    fakePlatform.reset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('Story 1: quick response never becomes busy', () => {
    const id = 'story-1';
    createSession(
      id,
      makeAlertScenario([{ at: 0, data: 'prompt> quick result\r\nprompt> ' }], {
        name: 'quick-response',
      }),
    );
    toggleSessionAlert(id);
    attendSession(id);

    advance(12_000);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',

      todo: TODO_OFF,
    });
  });

  it('Story 2: long-running work becomes busy, then completes unattended', () => {
    const id = 'story-2';
    createSession(
      id,
      makeAlertScenario([
        { at: 0, data: 'prompt> ' },
        { at: 1_600, data: 'working...' },
        { at: 1_800, data: 'more work' },
      ], { name: 'long-running' }),
    );
    toggleSessionAlert(id);
    attendSession(id);

    advance(1_800);
    expect(getActivity(id)).toMatchObject({
      status: 'BUSY',

    });

    expireAttention(id);
    advance(2_000);
    expect(getActivity(id).status).toBe('MIGHT_NEED_ATTENTION');

    advance(3_000);
    expect(getActivity(id)).toMatchObject({
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    });
  });

  it('Story 3: busy session pauses, then resumes', () => {
    const id = 'story-3';
    createSession(id);
    toggleSessionAlert(id);

    driveToBusy(id);
    advance(2_000);
    expect(getActivity(id).status).toBe('MIGHT_NEED_ATTENTION');

    emitOutput(id, 'still running');

    expect(getActivity(id)).toMatchObject({
      status: 'BUSY',

    });
  });

  it('Story 4: completion while still attended does not ring', () => {
    const id = 'story-4';
    createSession(id);
    toggleSessionAlert(id);
    attendSession(id);

    driveToBusy(id);
    advance(2_000);
    advance(3_000);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',

      todo: TODO_OFF,
    });
  });

  it('Story 5: user attends to a ringing pane — creates soft TODO', () => {
    const id = 'story-5';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    attendSession(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('Story 6: dismiss resets to NOTHING_TO_SHOW, can ring again later', () => {
    const id = 'story-6';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    dismissSessionAlert(id);

    expect(getActivity(id)).toMatchObject({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });

    // New output starts a fresh cycle that can ring again
    driveToBusy(id);
    expireAttention(id);
    advance(2_000);
    advance(3_000);

    expect(getActivity(id)).toMatchObject({
      status: 'ALERT_RINGING',
      todo: TODO_SOFT_FULL,
    });
  });

  it('Story 7: TODO clears ring and resets status, leaves alerts enabled', () => {
    const id = 'story-7';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    markSessionTodo(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_HARD,
    });
  });

  it('Story 8: disable alerts clears ring and stops tracking', () => {
    const id = 'story-8';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    disableSessionAlert(id);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });

    // No monitor means output doesn't drive state changes
    emitOutput(id, 'new cycle');
    emitOutput(id, 'more work');
    advance(12_000);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
  });

  it('Story 9: new output while ringing latches until user attends', () => {
    const id = 'story-9';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    // Shell prompt output should NOT silently dismiss the alert
    emitOutput(id, 'shell prompt');
    expect(getActivity(id).status).toBe('ALERT_RINGING');

    // User attends (focuses the pane) — this resets the monitor via attend()
    attendSession(id);
    expect(getActivity(id).status).toBe('NOTHING_TO_SHOW');

    // Now new output starts a fresh cycle
    emitOutput(id, 'next task');
    advance(1_600);
    emitOutput(id, 'still going');
    emitOutput(id, 'more work');
    expect(getActivity(id).status).toBe('BUSY');
  });

  it('Story 10: detach preserves state, click restore clears ring', () => {
    const id = 'story-10';
    createSession(id);
    toggleSessionAlert(id);
    attendSession(id);

    detachSession(id);
    driveToRingingNeedsAttention(id);

    expect(getActivity(id)).toMatchObject({
      status: 'ALERT_RINGING',

    });

    reattachDoorViaEnter(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('Story 11: detach preserves state, d restore does not clear ring', () => {
    const id = 'story-11';
    createSession(id);
    toggleSessionAlert(id);
    attendSession(id);

    detachSession(id);
    driveToRingingNeedsAttention(id);
    reattachDoorViaD(id);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    });
  });

  it('Story 12: resize noise never creates a false alert', () => {
    const id = 'story-12';
    const entry = createSession(id);
    toggleSessionAlert(id);

    entry.terminal.emitResize(120, 40);
    emitOutput(id, 'redraw noise');
    advance(12_000);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',

      todo: TODO_OFF,
    });
  });

  it('Story 13: multiple sessions ring independently', () => {
    const alpha = 'story-13-a';
    const beta = 'story-13-b';
    createSession(alpha);
    createSession(beta);
    toggleSessionAlert(alpha);
    toggleSessionAlert(beta);

    driveToRingingNeedsAttention(alpha);
    driveToRingingNeedsAttention(beta);

    dismissSessionAlert(alpha);
    attendSession(beta);

    expect(getActivity(alpha)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
    expect(getActivity(beta)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('Story 14: destroying a session clears alert, TODO, and attention state', () => {
    const id = 'story-14';
    createSession(id);
    toggleSessionAlert(id);
    driveToRingingNeedsAttention(id);
    toggleSessionTodo(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_HARD,
    });

    disposeSession(id);
    expect(getActivity(id)).toEqual(DEFAULT_ACTIVITY_STATE);

    createSession(id);
    toggleSessionAlert(id);
    driveToBusy(id);
    expireAttention(id);
    advance(2_000);
    advance(3_000);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    });
  });

  it('marks attention from terminal input and clears ringing immediately', () => {
    const id = 'input-attention';
    const entry = createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    entry.terminal.emitInput('x');

    // Typing while ringing: attend creates a fresh soft TODO, then the keypress strikes one letter
    expect(getActivity(id).status).toBe('NOTHING_TO_SHOW');
    expect(isSoftTodo(getActivity(id).todo)).toBe(true);
    expect(getActivity(id).todo).toBeCloseTo(0.75);
  });

  it('no monitor is created until alert is enabled', () => {
    const id = 'no-monitor';
    createSession(id);

    emitOutput(id, 'prompt> ');
    advance(1_200);
    emitOutput(id, 'working...');
    emitOutput(id, 'more work');
    advance(12_000);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_DISABLED',

      todo: TODO_OFF,
    });
  });

  it('enabling alert starts tracking fresh from that moment', () => {
    const id = 'fresh-start';
    createSession(id);

    // Output before alert is enabled — ignored
    emitOutput(id, 'old output');
    advance(5_000);

    toggleSessionAlert(id);

    // Status starts at NOTHING_TO_SHOW, not retroactively computed
    expect(getActivity(id).status).toBe('NOTHING_TO_SHOW');

    // New output after enabling drives state normally
    emitOutput(id, 'prompt> ');
    advance(1_600);
    emitOutput(id, 'working...');
    emitOutput(id, 'more work');
    expect(getActivity(id).status).toBe('BUSY');
  });

  it('phantom dismiss creates soft TODO, typing 4 chars clears it', () => {
    const id = 'soft-todo-clear';
    const entry = createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    attendSession(id);

    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);

    // 3 keypresses strike 3 letters but don't clear
    for (let i = 0; i < 3; i++) {
      entry.terminal.emitInput('a');
    }
    expect(isSoftTodo(getActivity(id).todo)).toBe(true);

    // 4th keypress clears it
    entry.terminal.emitInput('a');
    expect(getActivity(id).todo).toBe(TODO_OFF);
  });

  it('soft TODO recovers after idle and requires fresh keypresses', () => {
    const id = 'soft-todo-refill';
    const entry = createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    attendSession(id);

    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);

    // 2 keypresses strike 2 letters
    entry.terminal.emitInput('a');
    entry.terminal.emitInput('a');
    expect(getActivity(id).todo).toBeCloseTo(0.5);

    // 2 recovery intervals restore both letters
    vi.advanceTimersByTime(2 * STRIKE_RECOVERY_MS);
    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);

    // Need 4 fresh keypresses to clear again
    for (let i = 0; i < 3; i++) {
      entry.terminal.emitInput('a');
    }
    expect(isSoftTodo(getActivity(id).todo)).toBe(true);

    entry.terminal.emitInput('a');
    expect(getActivity(id).todo).toBe(TODO_OFF);
  });

  it('focus-report control sequences do not clear a soft TODO', () => {
    const id = 'soft-todo-focus-report';
    const entry = createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    attendSession(id);

    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);

    entry.terminal.emitInput('\x1b[I');

    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);
  });

  it('typing does not clear a hard TODO', () => {
    const id = 'hard-todo-persist';
    const entry = createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    toggleSessionTodo(id); // ringing → hard TODO + attend

    expect(getActivity(id).todo).toBe(TODO_HARD);

    entry.terminal.emitInput('ls');

    expect(getActivity(id).todo).toBe(TODO_HARD);
  });

  it('toggleSessionTodo promotes soft to hard', () => {
    const id = 'promote-soft';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    attendSession(id);

    expect(getActivity(id).todo).toBe(TODO_SOFT_FULL);

    toggleSessionTodo(id);

    expect(getActivity(id).todo).toBe(TODO_HARD);
  });

  it('toggleSessionTodo cycles: false → hard → false', () => {
    const id = 'toggle-cycle';
    createSession(id);

    expect(getActivity(id).todo).toBe(TODO_OFF);

    toggleSessionTodo(id);
    expect(getActivity(id).todo).toBe(TODO_HARD);

    toggleSessionTodo(id);
    expect(getActivity(id).todo).toBe(TODO_OFF);
  });

  it('dismiss does not downgrade hard TODO to soft', () => {
    const id = 'hard-survives-dismiss';
    createSession(id);
    toggleSessionAlert(id);
    toggleSessionTodo(id); // set hard TODO before ringing

    driveToBusy(id);
    expireAttention(id);
    advance(2_000);
    advance(3_000);
    expect(getActivity(id).status).toBe('ALERT_RINGING');

    dismissSessionAlert(id);

    // Hard TODO should survive — soft TODO only set when todo === false
    expect(getActivity(id).todo).toBe(TODO_HARD);
  });

  it('new output while ringing without attention does not create a soft TODO', () => {
    const id = 'ringing-output-no-soft-todo';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    // New output without attention — alert latches, no soft TODO created
    emitOutput(id, 'next task');

    expect(getActivity(id)).toEqual({
      status: 'ALERT_RINGING',
      todo: TODO_OFF,
    });
  });

  it('disabling alerts while ringing does not create a soft TODO', () => {
    const id = 'disable-no-soft-todo';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    disableSessionAlert(id);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
  });

  it('alert button enables alerts from ALERT_DISABLED', () => {
    const id = 'alert-button-enable';
    createSession(id);

    dismissOrToggleAlert(id, 'ALERT_DISABLED');

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_OFF,
    });
  });

  it('alert button disables alerts from enabled non-ringing states', () => {
    const id = 'alert-button-disable';
    createSession(id);
    toggleSessionAlert(id);
    driveToBusy(id);

    dismissOrToggleAlert(id, 'BUSY');

    expect(getActivity(id)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
  });

  it('alert button dismisses ringing alerts to soft TODO', () => {
    const id = 'alert-button-dismiss';
    createSession(id);
    toggleSessionAlert(id);
    driveToRingingNeedsAttention(id);

    dismissOrToggleAlert(id, 'ALERT_RINGING');

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('clicking a bell rendered as ringing does not disable alerts after attention already reset it', () => {
    const id = 'displayed-ringing-dismiss';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    markSessionAttention(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });

    dismissOrToggleAlert(id, 'ALERT_RINGING');

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('a bell click immediately after attention clears ringing is treated as a dismiss, not disable', () => {
    const id = 'recent-ringing-dismiss';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    markSessionAttention(id);

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });

    expect(dismissOrToggleAlert(id, 'NOTHING_TO_SHOW')).toBe('dismissed');
    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_SOFT_FULL,
    });
  });

  it('programmatic terminal focus does not count as attention', () => {
    const id = 'focus-without-attention';
    createSession(id);
    toggleSessionAlert(id);

    driveToRingingNeedsAttention(id);
    focusSession(id, true);

    expect(getActivity(id)).toEqual({
      status: 'ALERT_RINGING',
      todo: TODO_OFF,
    });
  });

  it('ignores prompt redraw output immediately after a resize', () => {
    const id = 'resize-debounce';
    const session = createSession(id);
    toggleSessionAlert(id);
    markSessionAttention(id);

    session.terminal.emitResize(120, 30);
    emitOutput(id, 'prompt redraw');
    advance(1_600);
    emitOutput(id, 'working...');

    expect(getActivity(id)).toEqual({
      status: 'NOTHING_TO_SHOW',
      todo: TODO_OFF,
    });
  });

  it('routes alert state updates to the swapped-in pane entry', () => {
    const alpha = 'swap-alpha';
    const beta = 'swap-beta';
    createSession(alpha);
    createSession(beta);

    toggleSessionAlert(alpha);
    markSessionAttention(alpha);
    swapTerminals(alpha, beta);

    emitOutput(alpha, 'prompt> ');
    advance(1_600);
    emitOutput(alpha, 'working...');
    emitOutput(alpha, 'more work');

    expect(getActivity(alpha)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
    expect(getActivity(beta)).toEqual({
      status: 'BUSY',
      todo: TODO_OFF,
    });
  });

  it('routes alert actions to the swapped-in pane entry', () => {
    const alpha = 'swap-action-alpha';
    const beta = 'swap-action-beta';
    createSession(alpha);
    createSession(beta);

    markSessionTodo(alpha);
    swapTerminals(alpha, beta);

    expect(getActivity(alpha)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
    expect(getActivity(beta)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_HARD,
    });

    clearSessionTodo(beta);

    expect(getActivity(alpha)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
    expect(getActivity(beta)).toEqual({
      status: 'ALERT_DISABLED',
      todo: TODO_OFF,
    });
  });
});
