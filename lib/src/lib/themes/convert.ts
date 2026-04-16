/**
 * Conversion from VSCode theme JSON `colors` to --vscode-* CSS variables.
 *
 * Two consumers read --vscode-* variables:
 *   1. @theme fallbacks in theme.css — UI colors (surfaces, tabs, etc.)
 *   2. getTerminalTheme() in terminal-registry.ts — ANSI, cursor, selection
 */

/** VSCode theme color keys consumed by MouseTerm. Derived from theme.css and terminal-registry.ts. */
export const CONSUMED_VSCODE_KEYS: readonly string[] = [
  // Surfaces (theme.css @theme)
  'editor.background',
  'editorGroupHeader.tabsBackground',
  'sideBar.background',
  'editorWidget.background',
  // Text
  'editor.foreground',
  'descriptionForeground',
  // Accent & borders
  'focusBorder',
  'panel.border',
  // Tabs
  'tab.activeBackground',
  'tab.inactiveBackground',
  'tab.activeForeground',
  'tab.inactiveForeground',
  'list.activeSelectionBackground',
  'list.activeSelectionForeground',
  // Terminal
  'terminal.background',
  'terminal.foreground',
  // Badges
  'badge.background',
  'badge.foreground',
  // Status
  'errorForeground',
  'editorWarning.foreground',
  // Inputs
  'input.background',
  'input.border',
  // Buttons
  'button.background',
  'button.foreground',
  'button.hoverBackground',
  // Links
  'textLink.foreground',
  // Terminal (read directly by getTerminalTheme())
  'terminalCursor.foreground',
  'terminal.selectionBackground',
  'terminal.ansiBlack',
  'terminal.ansiRed',
  'terminal.ansiGreen',
  'terminal.ansiYellow',
  'terminal.ansiBlue',
  'terminal.ansiMagenta',
  'terminal.ansiCyan',
  'terminal.ansiWhite',
  'terminal.ansiBrightBlack',
  'terminal.ansiBrightRed',
  'terminal.ansiBrightGreen',
  'terminal.ansiBrightYellow',
  'terminal.ansiBrightBlue',
  'terminal.ansiBrightMagenta',
  'terminal.ansiBrightCyan',
  'terminal.ansiBrightWhite',
] as const;

const consumedSet = new Set<string>(CONSUMED_VSCODE_KEYS);

/**
 * Convert a VSCode theme `colors` object to --vscode-* CSS variable entries.
 * Only keys in CONSUMED_VSCODE_KEYS are included; the rest are dropped.
 *
 * Conversion rule: `editor.background` → `--vscode-editor-background`
 */
export function convertVscodeThemeColors(
  colors: Record<string, string>,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(colors)) {
    if (consumedSet.has(key)) {
      vars[`--vscode-${key.replace(/\./g, '-')}`] = value;
    }
  }
  return vars;
}

/** Map package.json contributes.themes[].uiTheme to our type field. */
export function uiThemeToType(uiTheme: string): 'dark' | 'light' {
  switch (uiTheme) {
    case 'vs':
    case 'hc-light':
      return 'light';
    default:
      return 'dark';
  }
}
