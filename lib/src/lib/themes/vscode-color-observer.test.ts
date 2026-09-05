/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { getMaterializedVscodeThemeVars, installVscodeThemeVarResolver } from './vscode-color-observer';

let dispose: (() => void) | undefined;
let sheet: HTMLStyleElement | undefined;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  sheet?.remove();
  sheet = undefined;
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
});

it('releases an inline fallback when a later host theme supplies the CSS variable', async () => {
  sheet = document.createElement('style');
  sheet.textContent = 'body.vscode-light { --vscode-list-inactiveSelectionForeground: #123456; }';
  document.head.append(sheet);
  dispose = installVscodeThemeVarResolver();
  const name = '--vscode-list-inactiveSelectionForeground';
  expect(getMaterializedVscodeThemeVars().has(name)).toBe(true);

  document.body.classList.add('vscode-light');
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(document.body.style.getPropertyValue(name)).toBe('');
  expect(getComputedStyle(document.body).getPropertyValue(name)).toBe('#123456');
  expect(getMaterializedVscodeThemeVars().has(name)).toBe(false);
});

it('does not republish fallbacks after disposal with a recompute queued', async () => {
  dispose = installVscodeThemeVarResolver();
  document.body.classList.add('vscode-light');
  // Let MutationObserver queue its refresh, then dispose before that runs.
  await Promise.resolve();
  dispose();
  dispose = undefined;
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(getMaterializedVscodeThemeVars().size).toBe(0);
  expect(document.body.style.getPropertyValue('--vscode-foreground')).toBe('');
});
