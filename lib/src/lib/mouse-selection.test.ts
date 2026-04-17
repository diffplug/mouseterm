import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MOUSE_SELECTION_STATE,
  __resetMouseSelectionForTests,
  getMouseSelectionSnapshot,
  getMouseSelectionState,
  removeMouseSelectionState,
  setBracketedPaste,
  setHintToken,
  setMouseReporting,
  setOverride,
  setSelection,
  subscribeToMouseSelection,
  type Selection,
  type TokenHint,
} from './mouse-selection';

afterEach(() => {
  __resetMouseSelectionForTests();
});

describe('mouse-selection: default state', () => {
  it('returns the default state for an unknown id', () => {
    expect(getMouseSelectionState('missing')).toEqual(DEFAULT_MOUSE_SELECTION_STATE);
  });

  it('default state has mouse reporting off, override off, no selection', () => {
    expect(DEFAULT_MOUSE_SELECTION_STATE).toEqual({
      mouseReporting: 'none',
      bracketedPaste: false,
      override: 'off',
      selection: null,
      hintToken: null,
    });
  });
});

describe('mouse-selection: state setters', () => {
  it('setMouseReporting updates the mode', () => {
    setMouseReporting('a', 'vt200');
    expect(getMouseSelectionState('a').mouseReporting).toBe('vt200');

    setMouseReporting('a', 'any');
    expect(getMouseSelectionState('a').mouseReporting).toBe('any');
  });

  it('setBracketedPaste toggles the flag', () => {
    setBracketedPaste('a', true);
    expect(getMouseSelectionState('a').bracketedPaste).toBe(true);
    setBracketedPaste('a', false);
    expect(getMouseSelectionState('a').bracketedPaste).toBe(false);
  });

  it('setSelection stores a selection', () => {
    const sel: Selection = { startRow: 5, startCol: 3, endRow: 5, endCol: 10, shape: 'linewise', dragging: false };
    setSelection('a', sel);
    expect(getMouseSelectionState('a').selection).toBe(sel);

    setSelection('a', null);
    expect(getMouseSelectionState('a').selection).toBeNull();
  });

  it('setHintToken stores a hint', () => {
    const hint: TokenHint = { kind: 'url', row: 1, startCol: 0, endCol: 20, text: 'https://example.com' };
    setHintToken('a', hint);
    expect(getMouseSelectionState('a').hintToken).toBe(hint);

    setHintToken('a', null);
    expect(getMouseSelectionState('a').hintToken).toBeNull();
  });

  it('removeMouseSelectionState drops all state for an id', () => {
    setMouseReporting('a', 'vt200');
    setSelection('a', { startRow: 0, startCol: 0, endRow: 0, endCol: 5, shape: 'linewise', dragging: false });
    removeMouseSelectionState('a');
    expect(getMouseSelectionState('a')).toEqual(DEFAULT_MOUSE_SELECTION_STATE);
  });
});

describe('mouse-selection: override rules', () => {
  it('cannot activate override while mouse reporting is off', () => {
    setOverride('a', 'temporary');
    expect(getMouseSelectionState('a').override).toBe('off');
    setOverride('a', 'permanent');
    expect(getMouseSelectionState('a').override).toBe('off');
  });

  it('can activate override while mouse reporting is on', () => {
    setMouseReporting('a', 'vt200');
    setOverride('a', 'temporary');
    expect(getMouseSelectionState('a').override).toBe('temporary');

    setOverride('a', 'permanent');
    expect(getMouseSelectionState('a').override).toBe('permanent');
  });

  it('can always deactivate an override', () => {
    setMouseReporting('a', 'vt200');
    setOverride('a', 'temporary');
    setOverride('a', 'off');
    expect(getMouseSelectionState('a').override).toBe('off');
  });

  it('mouse reporting going to none auto-ends the override', () => {
    setMouseReporting('a', 'vt200');
    setOverride('a', 'temporary');
    setMouseReporting('a', 'none');
    expect(getMouseSelectionState('a').override).toBe('off');
  });

  it('mouse reporting going to none auto-ends a permanent override too', () => {
    setMouseReporting('a', 'drag');
    setOverride('a', 'permanent');
    setMouseReporting('a', 'none');
    expect(getMouseSelectionState('a').override).toBe('off');
  });
});

describe('mouse-selection: subscription', () => {
  it('subscribe + setMouseReporting notifies listeners', () => {
    const listener = vi.fn();
    subscribeToMouseSelection(listener);
    setMouseReporting('a', 'vt200');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setting the same value does not notify', () => {
    setMouseReporting('a', 'vt200');
    const listener = vi.fn();
    subscribeToMouseSelection(listener);
    setMouseReporting('a', 'vt200');
    expect(listener).not.toHaveBeenCalled();
  });

  it('setBracketedPaste, setOverride, setSelection, setHintToken all notify', () => {
    setMouseReporting('a', 'vt200'); // prerequisite for override activation
    const listener = vi.fn();
    subscribeToMouseSelection(listener);

    setBracketedPaste('a', true);
    setOverride('a', 'temporary');
    setSelection('a', { startRow: 0, startCol: 0, endRow: 0, endCol: 1, shape: 'linewise', dragging: true });
    setHintToken('a', { kind: 'path', row: 0, startCol: 0, endCol: 5, text: '/tmp' });

    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsub = subscribeToMouseSelection(listener);
    unsub();
    setMouseReporting('a', 'vt200');
    expect(listener).not.toHaveBeenCalled();
  });

  it('removeMouseSelectionState notifies', () => {
    setMouseReporting('a', 'vt200');
    const listener = vi.fn();
    subscribeToMouseSelection(listener);
    removeMouseSelectionState('a');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('removing a state that was never set does not notify', () => {
    const listener = vi.fn();
    subscribeToMouseSelection(listener);
    removeMouseSelectionState('never-existed');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('mouse-selection: snapshot caching', () => {
  it('returns the same snapshot reference between changes', () => {
    setMouseReporting('a', 'vt200');
    const s1 = getMouseSelectionSnapshot();
    const s2 = getMouseSelectionSnapshot();
    expect(s1).toBe(s2);
  });

  it('invalidates the snapshot after a change', () => {
    setMouseReporting('a', 'vt200');
    const s1 = getMouseSelectionSnapshot();
    setMouseReporting('a', 'any');
    const s2 = getMouseSelectionSnapshot();
    expect(s1).not.toBe(s2);
  });

  it('snapshot contains state for every known id', () => {
    setMouseReporting('a', 'vt200');
    setMouseReporting('b', 'any');
    const snap = getMouseSelectionSnapshot();
    expect(snap.get('a')?.mouseReporting).toBe('vt200');
    expect(snap.get('b')?.mouseReporting).toBe('any');
  });
});
