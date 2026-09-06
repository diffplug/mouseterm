/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { computeDynamicPalette } from './dynamic-palette';
import { useDynamicPalette } from './use-dynamic-palette';

vi.mock('./dynamic-palette', () => ({ computeDynamicPalette: vi.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Palette() {
  useDynamicPalette();
  return null;
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  vi.mocked(computeDynamicPalette).mockReturnValue({ '--color-alarm-vs-door': '#ffffff' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Palette />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.documentElement.removeAttribute('class');
  vi.restoreAllMocks();
});

it('republishes palette properties removed after mount and stops once restored', async () => {
  vi.mocked(computeDynamicPalette).mockClear();
  await act(async () => {
    document.body.style.removeProperty('--color-alarm-vs-door');
  });
  expect(document.body.style.getPropertyValue('--color-alarm-vs-door')).toBe('#ffffff');
  expect(computeDynamicPalette).toHaveBeenCalledTimes(2);
});

it('refreshes dynamic picks for host theme changes on html', async () => {
  vi.mocked(computeDynamicPalette).mockReturnValue({ '--color-alarm-vs-door': '#000000' });
  await act(async () => {
    document.documentElement.classList.add('vscode-light');
  });
  expect(document.body.style.getPropertyValue('--color-alarm-vs-door')).toBe('#000000');
});
