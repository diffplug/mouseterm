/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SelectionPopup } from './SelectionPopup';
import { copyRaw } from '../lib/clipboard';
import {
  __resetMouseSelectionForTests, beginDrag, bumpRenderTick, endDrag, flashCopy, getMouseSelectionState, setSelection,
} from '../lib/mouse-selection';
import type { TerminalOverlayDims } from '../lib/terminal-store';

const mocks = vi.hoisted(() => ({ dims: null as TerminalOverlayDims | null }));
vi.mock('../lib/terminal-registry', () => ({ getTerminalOverlayDims: () => mocks.dims }));
vi.mock('../lib/clipboard', () => ({ copyRaw: vi.fn(), copyRewrapped: vi.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  __resetMouseSelectionForTests();
  vi.mocked(copyRaw).mockReset();
  mocks.dims = {
    cols: 80, rows: 24, viewportY: 0, baseY: 10,
    elementWidth: 800, elementHeight: 240, cellWidth: 10, cellHeight: 10, gridLeft: 0, gridTop: 0,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  beginDrag('one', { row: 5, col: 3, altKey: false, startedInScrollback: true });
  endDrag('one');
  act(() => root.render(<SelectionPopup terminalId="one" />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  __resetMouseSelectionForTests();
});

it('reanchors after scrolling with the same finalized selection', () => {
  const popup = () => container.querySelector<HTMLElement>('[data-selection-popup-for]')!;
  expect(popup().style.top).toBe('74px');
  mocks.dims!.viewportY = 3;
  act(() => bumpRenderTick());
  expect(popup().style.top).toBe('44px');
});

it('dismisses immediately when selection is canceled during the copied flash', () => {
  vi.useFakeTimers();
  act(() => flashCopy('one', 'raw'));
  act(() => setSelection('one', null));
  expect(container.querySelector('[data-selection-popup-for]')).toBeNull();
});

it('keeps a newer copied selection for its own confirmation duration', () => {
  vi.useFakeTimers();
  act(() => flashCopy('one', 'raw'));
  act(() => vi.advanceTimersByTime(400));
  act(() => {
    beginDrag('one', { row: 8, col: 1, altKey: false, startedInScrollback: true });
    endDrag('one');
    flashCopy('one', 'raw');
  });
  act(() => vi.advanceTimersByTime(300));
  expect(getMouseSelectionState('one').selection?.startRow).toBe(8);
  act(() => vi.advanceTimersByTime(400));
  expect(getMouseSelectionState('one').selection).toBeNull();
});

it('retains a selection without a success flash when copying fails', async () => {
  vi.mocked(copyRaw).mockResolvedValue(false);
  await act(async () => container.querySelector<HTMLButtonElement>('button')!.click());
  expect(getMouseSelectionState('one').copyFlash).toBeNull();
  expect(getMouseSelectionState('one').selection).not.toBeNull();
});

it('does not clear a newer selection when a previous copy finishes', async () => {
  let complete!: (copied: boolean) => void;
  vi.mocked(copyRaw).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  act(() => container.querySelector<HTMLButtonElement>('button')!.click());
  act(() => beginDrag('one', { row: 8, col: 1, altKey: false, startedInScrollback: true }));
  await act(async () => complete(true));
  expect(getMouseSelectionState('one').copyFlash).toBeNull();
  expect(getMouseSelectionState('one').selection?.startRow).toBe(8);
});
