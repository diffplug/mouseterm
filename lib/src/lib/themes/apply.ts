import type { MouseTermTheme } from './types';
import { completeThemeVars } from './vscode-color-resolver';

let appliedVarNames: string[] = [];
let lastApplied: MouseTermTheme | null = null;

const HOST_TYPOGRAPHY_VARS: Record<string, string> = {
  '--vscode-font-size': '13px',
  '--vscode-editor-font-size': '13px',
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--vscode-editor-font-family':
    "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

export function applyTheme(theme: MouseTermTheme): void {
  if (typeof document === 'undefined') return;
  if (theme === lastApplied) return;

  for (const name of appliedVarNames) {
    document.body.style.removeProperty(name);
  }

  // Imported theme JSON usually omits VSCode registry defaults; materialize
  // them here so theme.css can read --vscode-* directly without fallbacks.
  const vars = completeThemeVars({ ...HOST_TYPOGRAPHY_VARS, ...theme.vars }, theme.type);
  appliedVarNames = Object.keys(vars);
  for (const [name, value] of Object.entries(vars)) {
    document.body.style.setProperty(name, value);
  }

  if (theme.type === 'light') {
    document.body.classList.add('vscode-light');
    document.body.classList.remove('vscode-dark');
  } else {
    document.body.classList.add('vscode-dark');
    document.body.classList.remove('vscode-light');
  }

  lastApplied = theme;
}
