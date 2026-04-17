import type { MouseTermTheme } from './types';

/** Previously applied variable names — tracked for cleanup. */
let appliedVarNames: string[] = [];

/**
 * Apply a theme by setting --vscode-* CSS variables on document.body.
 *
 * Also manages body classes (vscode-light / vscode-dark) so that
 * theme.css fallback selectors activate correctly.
 *
 * The MutationObserver in terminal-registry.ts detects the style change
 * and re-reads the theme for all xterm.js terminals.
 */
export function applyTheme(theme: MouseTermTheme): void {
  if (typeof document === 'undefined') return;

  // Clear previously applied variables
  for (const name of appliedVarNames) {
    document.body.style.removeProperty(name);
  }

  // Apply new variables
  appliedVarNames = Object.keys(theme.vars);
  for (const [name, value] of Object.entries(theme.vars)) {
    document.body.style.setProperty(name, value);
  }

  // Set body class for light/dark so theme.css fallbacks work
  if (theme.type === 'light') {
    document.body.classList.add('vscode-light');
    document.body.classList.remove('vscode-dark');
  } else {
    document.body.classList.add('vscode-dark');
    document.body.classList.remove('vscode-light');
  }
}
