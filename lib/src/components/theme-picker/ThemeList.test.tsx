/** @vitest-environment jsdom */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveThemeVars, type DormouseTheme } from '../../lib/themes';
import { ThemeList } from './ThemeList';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const dark: DormouseTheme = {
  id: 'dark', label: 'Dark preview', type: 'dark', swatch: '#112233', accent: '#abcdef',
  vars: { '--vscode-terminal-background': '#112233', '--vscode-terminal-foreground': '#abcdef' },
  origin: { kind: 'bundled' },
};
const light: DormouseTheme = {
  ...dark, id: 'light', label: 'Light preview', type: 'light',
  vars: { '--vscode-editor-background': '#ffffff' },
  origin: { kind: 'installed', extensionId: 'test/light', installedAt: '2026-01-01' },
};

let container: HTMLDivElement;
let root: Root;
let resize: () => void;
let viewportHeight: number;
let contentHeight: number;
const onSelect = vi.fn();
const onUninstall = vi.fn();

beforeEach(() => {
  viewportHeight = 100;
  contentHeight = 300;
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewportHeight);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function render(themes = [dark, light], activeId = dark.id) {
  act(() => root.render(<ThemeList themes={themes} activeId={activeId} onSelect={onSelect} onUninstall={onUninstall} />));
}

function fades() {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-scroll-fade]'))
    .map((element) => element.dataset.scrollFade);
}

describe('ThemeList', () => {
  it('previews each candidate palette, resolving omitted colors independently of selection', () => {
    render();
    const rows = container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    expect(rows[0].parentElement!.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(rows[0].parentElement!.style.color).toBe('rgb(171, 205, 239)');
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(rows[0].getAttribute('aria-checked')).toBe('true');
    const resolvedLight = resolveThemeVars(light);
    const expected = document.createElement('div');
    expected.style.color = resolvedLight['--vscode-terminal-foreground'];
    expect(rows[1].parentElement!.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(rows[1].parentElement!.style.color).toBe(expected.style.color);
    render([dark, light], light.id);
    expect(rows[0].parentElement!.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(rows[1].getAttribute('aria-checked')).toBe('true');
    expect((container.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('keeps selection and uninstall as separate actions', () => {
    render();
    act(() => container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[1].click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(light.id);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Uninstall Light preview"]')!.click());
    expect(onUninstall).toHaveBeenCalledExactlyOnceWith(light);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="Uninstall Dark preview"]')).toBeNull();
  });

  it('shows only the overflowing directions at the top, middle, and bottom', () => {
    render();
    const scroll = container.querySelector<HTMLElement>('[data-theme-list-scroll]')!;
    expect(fades()).toEqual(['below']);
    act(() => { scroll.scrollTop = 50; scroll.dispatchEvent(new Event('scroll')); });
    expect(fades()).toEqual(['above', 'below']);
    act(() => { scroll.scrollTop = 199.5; scroll.dispatchEvent(new Event('scroll')); });
    expect(fades()).toEqual(['above']);
    act(() => { scroll.scrollTop = -0.5; scroll.dispatchEvent(new Event('scroll')); });
    expect(fades()).toEqual(['below']);
  });

  it('remeasures when content or viewport size changes and hides fades when everything fits', () => {
    render();
    expect(fades()).toEqual(['below']);
    act(() => { viewportHeight = 400; resize(); });
    expect(fades()).toEqual([]);
    act(() => { viewportHeight = 100; resize(); });
    expect(fades()).toEqual(['below']);
    contentHeight = 44;
    render([dark]);
    expect(fades()).toEqual([]);
    act(() => { contentHeight = 300; resize(); });
    expect(fades()).toEqual(['below']);
  });
});
