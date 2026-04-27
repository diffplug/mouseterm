import type { MouseTermTheme } from './types';
import { completeThemeVars } from './vscode-color-resolver';

/** Previously applied variable names — tracked for cleanup. */
let appliedVarNames: string[] = [];

const HOST_TYPOGRAPHY_VARS: Record<string, string> = {
  '--vscode-font-size': '13px',
  '--vscode-editor-font-size': '13px',
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--vscode-editor-font-family':
    "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

/**
 * Apply a theme by setting --vscode-* CSS variables on document.body.
 *
 * Also manages body classes (vscode-light / vscode-dark) for consumers that
 * need to branch on theme type.
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

  // Apply new variables. Imported theme JSON usually omits VSCode registry
  // defaults; materialize them here so theme.css can stay direct.
  const vars = completeThemeVars({ ...HOST_TYPOGRAPHY_VARS, ...theme.vars }, theme.type);
  appliedVarNames = Object.keys(vars);
  for (const [name, value] of Object.entries(vars)) {
    document.body.style.setProperty(name, value);
  }

  // Set body class for light/dark consumers.
  if (theme.type === 'light') {
    document.body.classList.add('vscode-light');
    document.body.classList.remove('vscode-dark');
  } else {
    document.body.classList.add('vscode-dark');
    document.body.classList.remove('vscode-light');
  }
}
