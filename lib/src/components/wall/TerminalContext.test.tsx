// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TerminalContextView, type TerminalContextViewProps } from './TerminalContextView';
import { TerminalPaneHeader } from './TerminalPaneHeader';
import { TerminalPanel } from './TerminalPanel';
import { TerminalContextContext } from './wall-context';
import { ensureResizeObserver } from './wall-test-utils';
import { setMouseReporting, removeMouseSelectionState } from '../../lib/mouse-selection';
import { setPlatform } from '../../lib/platform';
import { FakePtyAdapter } from '../../lib/platform/fake-adapter';

vi.mock('../TerminalPane', () => ({ TerminalPane: () => <textarea aria-label="Fake terminal input" /> }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let props: TerminalContextViewProps;
const port = (value: number) => ({ port: value, host: 'localhost', url: `http://localhost:${value}/` });
beforeEach(() => {
  setPlatform(new FakePtyAdapter()); ensureResizeObserver();
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  props = { title: 'pnpm dev', surfaceRef: 'surface:3', cwd: '~/repo', titleSources: [{ source: 'OSC 2', value: 'pnpm dev', note: 'Used' }], scan: { status: 'loaded', entries: [port(5173)] },
    argv0: 'pnpm', watching: false, todo: false, status: 'completed', command: 'git status', explorerLabel: 'Open in Finder', canExplore: true, canAgent: true, canPopout: true, canIframe: true,
    onClose: vi.fn(), onCopyRef: vi.fn(), onCopyPath: vi.fn(), onExplore: vi.fn(), onWatch: vi.fn(), onTodo: vi.fn(), onPort: vi.fn(), onModify: vi.fn(async () => {}), onReset: vi.fn(async () => {}), onPromote: vi.fn(async () => {}),
    children: <div data-helper-terminal="helper"><textarea aria-label="Helper input" /></div> };
});
afterEach(() => { act(() => root.unmount()); container.remove(); removeMouseSelectionState('parent'); });
const render = () => act(() => root.render(<TerminalContextView {...props} />));
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const click = async (label: string) => { await act(async () => button(label).click()); };

it('uses labeled title, directory and port actions without a redundant heading', () => {
  render(); expect(container.querySelector('h1,h2,h3')).toBeNull();
  for (const label of ['Explain this title', 'Copy absolute path', 'Open in Finder', 'Open in system browser', 'Open in iframe embed', 'Open in agent-browser screencast', 'Open in agent-browser popout']) expect(button(label)).not.toBeNull();
  expect(container.querySelector('select')).toBeNull();
});
it.each(['system', 'iframe', 'ab-screencast', 'ab-popout'] as const)('dispatches the selected port to %s', async mode => {
  props.scan = { status: 'loaded', entries: [port(5173), port(6006), port(9229)] }; render();
  const select = container.querySelector('select')!;
  act(() => { select.value = '6006'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(select.parentElement?.textContent).toContain('3 ports');
  const label = { system: 'Open in system browser', iframe: 'Open in iframe embed', 'ab-screencast': 'Open in agent-browser screencast', 'ab-popout': 'Open in agent-browser popout' }[mode];
  await click(label); expect(props.onPort).toHaveBeenCalledWith(port(6006), mode); expect(props.onClose).not.toHaveBeenCalled();
});
it.each(['scanning', 'failed', 'empty'] as const)('distinguishes %s ports', state => {
  props.scan = state === 'empty' ? { status: 'loaded', entries: [] } : { status: state }; render();
  expect(container.textContent).toContain(state === 'empty' ? 'No listening ports' : state === 'failed' ? 'Port scan failed' : 'Scanning ports');
  expect(button('Open in system browser')).toBeNull();
});
it('disables unsupported host capabilities with an explanation', () => {
  props.canAgent = false; props.canPopout = false; props.canExplore = false; render();
  expect(button('Agent browser unavailable on this host').disabled).toBe(true);
  expect(button('Popout unavailable on this host').disabled).toBe(true);
  expect(button('Directory unavailable on this host').disabled).toBe(true);
});
it('opens title explanation as a disclosure', async () => {
  render(); expect(container.textContent).not.toContain('OSC 2'); await click('Explain this title');
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain('OSC 2');
});
it('keeps helper keystrokes out of context dismissal', () => {
  render(); const input = container.querySelector('textarea')!;
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(props.onClose).not.toHaveBeenCalled();
  act(() => button('Close terminal context').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(props.onClose).toHaveBeenCalledOnce();
});
it('requires explicit confirmation before resetting a preserved helper', async () => {
  props.status = 'preserved'; render(); await click('Reset helper terminal'); await click('Keep helper'); expect(props.onReset).not.toHaveBeenCalled();
  await click('Reset helper terminal'); await click('Discard and reset'); expect(props.onReset).toHaveBeenCalledOnce();
});
it('keeps a failed promotion visible and retryable', async () => {
  props.onPromote = vi.fn(async () => { throw new Error('Placement failed'); }); render(); await click('Move this terminal into a new pane');
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Placement failed'); expect(props.onClose).not.toHaveBeenCalled();
});
it('shows both directories in the mismatch warning', () => {
  props.mismatch = true; props.helperCwd = '~/other'; render(); expect(container.querySelector('[role="alert"]')?.textContent).toContain('~/other'); expect(container.querySelector('[role="alert"]')?.textContent).toContain('~/repo');
});
it('shares header, alert and uncaptured body entry points; captured mouse has no Shift escape', () => {
  const open = vi.fn(); const value = { id: null, open, close: vi.fn(), promote: vi.fn(), openPort: vi.fn() };
  act(() => root.render(<TerminalContextContext.Provider value={value}><TerminalPaneHeader id="parent" /><TerminalPanel id="parent" /></TerminalContextContext.Provider>));
  const header = container.querySelector('[data-pane-header-for]')!;
  const body = container.querySelector('textarea')!;
  const rightClick = (target: Element, shiftKey = false) => act(() => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, shiftKey })));
  rightClick(header); rightClick(container.querySelector('[data-alert-button-for]')!); rightClick(body);
  expect(open).toHaveBeenCalledTimes(3);
  act(() => setMouseReporting('parent', 'vt200'));
  rightClick(body); rightClick(body, true); expect(open).toHaveBeenCalledTimes(3);
  rightClick(header); expect(open).toHaveBeenCalledTimes(4);
});
