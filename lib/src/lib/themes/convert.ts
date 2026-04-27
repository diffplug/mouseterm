/**
 * Conversion from VSCode theme JSON `colors` to --vscode-* CSS variables.
 *
 * Two consumers read --vscode-* variables:
 *   1. @theme fallbacks in theme.css — UI colors (surfaces, tabs, etc.)
 *   2. getTerminalTheme() in terminal-registry.ts — ANSI, cursor, selection
 */

/** VSCode theme color keys consumed by MouseTerm. Derived from theme.css,
 *  Pond.useDynamicPalette, ThemePicker inline styles, SelectionOverlay, and
 *  terminal-registry. */
export const CONSUMED_VSCODE_KEYS: readonly string[] = [
  // Surfaces (theme.css @theme)
  'editor.background',
  'editorGroupHeader.tabsBackground',
  'sideBar.background',
  'editorWidget.background',
  // Text
  'editor.foreground',
  'descriptionForeground',
  'foreground',
  // Borders
  'panel.border',
  // Focus / file-tree palette — anchors the four-surface chrome hierarchy
  // (active panel = list active selection, inactive = list inactive selection)
  // and is read by Pond's useDynamicPalette for the focus ring.
  'focusBorder',
  'list.activeSelectionBackground',
  'list.activeSelectionForeground',
  'list.inactiveSelectionBackground',
  'list.inactiveSelectionForeground',
  // Terminal
  'terminal.background',
  'terminal.foreground',
  // Status
  'errorForeground',
  'editorWarning.foreground',
  // Inputs (ThemePicker dialog)
  'input.background',
  'input.border',
  // Buttons (ThemePicker dialog only)
  'button.background',
  'button.foreground',
  // Links (ThemePicker dialog only)
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
