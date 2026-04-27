import type { MouseTermTheme } from './types';

/** Previously applied variable names — tracked for cleanup. */
let appliedVarNames: string[] = [];

const HOST_TYPOGRAPHY_VARS: Record<string, string> = {
  '--vscode-font-size': '13px',
  '--vscode-editor-font-size': '13px',
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--vscode-editor-font-family':
    "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

const DERIVED_VAR_ALIASES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['--vscode-editorWidget-background', ['--vscode-editor-background']],
  ['--vscode-panel-border', ['--vscode-input-border', '--vscode-sideBar-background']],
  [
    '--vscode-list-activeSelectionForeground',
    ['--vscode-editor-foreground', '--vscode-terminal-foreground'],
  ],
  [
    '--vscode-list-inactiveSelectionBackground',
    ['--vscode-sideBar-background', '--vscode-editor-background'],
  ],
  [
    '--vscode-list-inactiveSelectionForeground',
    [
      '--vscode-list-activeSelectionForeground',
      '--vscode-editor-foreground',
      '--vscode-terminal-foreground',
    ],
  ],
  ['--vscode-terminal-background', ['--vscode-editor-background']],
  ['--vscode-terminal-foreground', ['--vscode-editor-foreground']],
  ['--vscode-descriptionForeground', ['--vscode-editor-foreground', '--vscode-terminal-foreground']],
  ['--vscode-input-background', ['--vscode-editorWidget-background', '--vscode-editor-background']],
  ['--vscode-input-border', ['--vscode-panel-border', '--vscode-input-background']],
  ['--vscode-textLink-foreground', ['--vscode-focusBorder', '--vscode-terminal-ansiBlue']],
  ['--vscode-button-background', ['--vscode-list-activeSelectionBackground', '--vscode-focusBorder']],
  [
    '--vscode-button-foreground',
    ['--vscode-list-activeSelectionForeground', '--vscode-editor-foreground'],
  ],
  ['--vscode-errorForeground', ['--vscode-terminal-ansiRed']],
] as const;

function completeThemeVars(vars: Record<string, string>): Record<string, string> {
  const complete = { ...vars };
  for (const [target, sources] of DERIVED_VAR_ALIASES) {
    if (complete[target]) continue;
    const source = sources.find((name) => complete[name]);
    if (source) complete[target] = complete[source];
  }
  return complete;
}

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

  // Apply new variables. Some VSCode color keys are optional in source theme
  // JSON; materialize the aliases we need here so theme.css can stay direct.
  const vars = completeThemeVars({ ...HOST_TYPOGRAPHY_VARS, ...theme.vars });
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
