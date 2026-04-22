import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { attachMouseModeObserver } from './mouse-mode-observer';
import { __resetMouseSelectionForTests, getMouseSelectionState } from './mouse-selection';

afterEach(() => {
  __resetMouseSelectionForTests();
  vi.restoreAllMocks();
});

interface MockDisposables {
  setHandlers: Array<() => boolean>;
  resetHandlers: Array<() => boolean>;
}

function buildMockTerminal(): { terminal: Terminal; modes: { mouseTrackingMode: string; bracketedPasteMode: boolean }; handlers: MockDisposables } {
  const handlers: MockDisposables = { setHandlers: [], resetHandlers: [] };
  const modes = { mouseTrackingMode: 'none' as const, bracketedPasteMode: false };
  const parser = {
    registerCsiHandler(id: { prefix?: string; final?: string }, cb: () => boolean) {
      if (id.prefix === '?' && id.final === 'h') {
        handlers.setHandlers.push(cb);
      } else if (id.prefix === '?' && id.final === 'l') {
        handlers.resetHandlers.push(cb);
      }
      return { dispose: vi.fn() };
    },
  };
  const terminal = { parser, modes } as unknown as Terminal;
  return { terminal, modes, handlers };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('attachMouseModeObserver', () => {
  it('registers one DECSET and one DECRST handler', () => {
    const { terminal, handlers } = buildMockTerminal();
    attachMouseModeObserver('a', terminal);
    expect(handlers.setHandlers).toHaveLength(1);
    expect(handlers.resetHandlers).toHaveLength(1);
  });

  it('DECSET handler returns false so xterm still processes the sequence', () => {
    const { terminal, handlers } = buildMockTerminal();
    attachMouseModeObserver('a', terminal);
    expect(handlers.setHandlers[0]()).toBe(false);
    expect(handlers.resetHandlers[0]()).toBe(false);
  });

  it('syncs mouseReporting after a DECSET fires (modes updated in the mock)', async () => {
    const { terminal, modes, handlers } = buildMockTerminal();
    attachMouseModeObserver('a', terminal);

    // Simulate xterm processing `\e[?1000h`: our handler fires, then xterm's
    // builtin updates modes. We emulate by flipping the mode before the
    // microtask runs.
    handlers.setHandlers[0]();
    modes.mouseTrackingMode = 'vt200';

    await flushMicrotasks();
    expect(getMouseSelectionState('a').mouseReporting).toBe('vt200');
  });

  it('syncs bracketedPaste after a DECSET fires', async () => {
    const { terminal, modes, handlers } = buildMockTerminal();
    attachMouseModeObserver('a', terminal);

    handlers.setHandlers[0]();
    modes.bracketedPasteMode = true;

    await flushMicrotasks();
    expect(getMouseSelectionState('a').bracketedPaste).toBe(true);
  });

  it('syncs mouseReporting to none after DECRST', async () => {
    const { terminal, modes, handlers } = buildMockTerminal();
    attachMouseModeObserver('a', terminal);

    // Enable first
    handlers.setHandlers[0]();
    modes.mouseTrackingMode = 'any';
    await flushMicrotasks();
    expect(getMouseSelectionState('a').mouseReporting).toBe('any');

    // Then disable
    handlers.resetHandlers[0]();
    modes.mouseTrackingMode = 'none';
    await flushMicrotasks();
    expect(getMouseSelectionState('a').mouseReporting).toBe('none');
  });

  it('dispose tears down both handlers', () => {
    const disposables: Array<{ dispose: ReturnType<typeof vi.fn> }> = [];
    const terminal = {
      parser: {
        registerCsiHandler() {
          const d = { dispose: vi.fn() };
          disposables.push(d);
          return d;
        },
      },
      modes: { mouseTrackingMode: 'none', bracketedPasteMode: false },
    } as unknown as Terminal;

    const observer = attachMouseModeObserver('a', terminal);
    observer.dispose();

    expect(disposables).toHaveLength(2);
    expect(disposables[0].dispose).toHaveBeenCalledOnce();
    expect(disposables[1].dispose).toHaveBeenCalledOnce();
  });
});
