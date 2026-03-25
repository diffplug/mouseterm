/**
 * Playground themes — sets of --vscode-* CSS variable overrides.
 *
 * When applied to document.body, these cascade into:
 *   1. --mt-* variables (via var(--vscode-*, fallback) in theme.css)
 *   2. xterm.js terminal themes (via getTerminalTheme() in terminal-registry)
 *   3. Dockview/Tailwind token colors (via @theme in index.css)
 *
 * The MutationObserver on body attributes triggers xterm.js re-reads automatically.
 */

export interface PlaygroundTheme {
  name: string;
  /** Label shown in the picker */
  label: string;
  /** Preview swatch color (the surface/background color) */
  swatch: string;
  /** Accent dot color */
  accent: string;
  /** CSS variable overrides (--vscode-* keys) */
  vars: Record<string, string>;
}

export const THEMES: PlaygroundTheme[] = [
  {
    name: 'dark-default',
    label: 'Dark',
    swatch: '#1e1e1e',
    accent: '#007fd4',
    vars: {}, // Uses the fallback values from theme.css — no overrides needed
  },
  {
    name: 'monokai',
    label: 'Monokai',
    swatch: '#272822',
    accent: '#f92672',
    vars: {
      '--vscode-editor-background': '#272822',
      '--vscode-editor-foreground': '#f8f8f2',
      '--vscode-editorGroupHeader-tabsBackground': '#1e1f1c',
      '--vscode-sideBar-background': '#1e1f1c',
      '--vscode-editorWidget-background': '#1e1f1c',
      '--vscode-descriptionForeground': '#75715e',
      '--vscode-focusBorder': '#f92672',
      '--vscode-panel-border': '#3e3d32',
      '--vscode-tab-activeBackground': '#272822',
      '--vscode-tab-inactiveBackground': '#1e1f1c',
      '--vscode-tab-activeForeground': '#f8f8f2',
      '--vscode-tab-inactiveForeground': '#75715e',
      '--vscode-terminal-background': '#272822',
      '--vscode-terminal-foreground': '#f8f8f2',
      '--vscode-badge-background': '#f92672',
      '--vscode-badge-foreground': '#ffffff',
      '--vscode-terminal-ansiBlack': '#272822',
      '--vscode-terminal-ansiRed': '#f92672',
      '--vscode-terminal-ansiGreen': '#a6e22e',
      '--vscode-terminal-ansiYellow': '#f4bf75',
      '--vscode-terminal-ansiBlue': '#66d9ef',
      '--vscode-terminal-ansiMagenta': '#ae81ff',
      '--vscode-terminal-ansiCyan': '#a1efe4',
      '--vscode-terminal-ansiWhite': '#f8f8f2',
      '--vscode-terminal-ansiBrightBlack': '#75715e',
      '--vscode-terminal-ansiBrightRed': '#f92672',
      '--vscode-terminal-ansiBrightGreen': '#a6e22e',
      '--vscode-terminal-ansiBrightYellow': '#f4bf75',
      '--vscode-terminal-ansiBrightBlue': '#66d9ef',
      '--vscode-terminal-ansiBrightMagenta': '#ae81ff',
      '--vscode-terminal-ansiBrightCyan': '#a1efe4',
      '--vscode-terminal-ansiBrightWhite': '#f9f8f5',
      '--vscode-terminalCursor-foreground': '#f8f8f0',
      '--vscode-terminal-selectionBackground': '#49483e80',
    },
  },
  {
    name: 'solarized-dark',
    label: 'Solarized',
    swatch: '#002b36',
    accent: '#268bd2',
    vars: {
      '--vscode-editor-background': '#002b36',
      '--vscode-editor-foreground': '#839496',
      '--vscode-editorGroupHeader-tabsBackground': '#00212b',
      '--vscode-sideBar-background': '#00212b',
      '--vscode-editorWidget-background': '#00212b',
      '--vscode-descriptionForeground': '#586e75',
      '--vscode-focusBorder': '#268bd2',
      '--vscode-panel-border': '#073642',
      '--vscode-tab-activeBackground': '#002b36',
      '--vscode-tab-inactiveBackground': '#00212b',
      '--vscode-tab-activeForeground': '#93a1a1',
      '--vscode-tab-inactiveForeground': '#586e75',
      '--vscode-terminal-background': '#002b36',
      '--vscode-terminal-foreground': '#839496',
      '--vscode-badge-background': '#268bd2',
      '--vscode-badge-foreground': '#ffffff',
      '--vscode-terminal-ansiBlack': '#073642',
      '--vscode-terminal-ansiRed': '#dc322f',
      '--vscode-terminal-ansiGreen': '#859900',
      '--vscode-terminal-ansiYellow': '#b58900',
      '--vscode-terminal-ansiBlue': '#268bd2',
      '--vscode-terminal-ansiMagenta': '#d33682',
      '--vscode-terminal-ansiCyan': '#2aa198',
      '--vscode-terminal-ansiWhite': '#eee8d5',
      '--vscode-terminal-ansiBrightBlack': '#586e75',
      '--vscode-terminal-ansiBrightRed': '#cb4b16',
      '--vscode-terminal-ansiBrightGreen': '#859900',
      '--vscode-terminal-ansiBrightYellow': '#b58900',
      '--vscode-terminal-ansiBrightBlue': '#268bd2',
      '--vscode-terminal-ansiBrightMagenta': '#6c71c4',
      '--vscode-terminal-ansiBrightCyan': '#2aa198',
      '--vscode-terminal-ansiBrightWhite': '#fdf6e3',
      '--vscode-terminalCursor-foreground': '#839496',
      '--vscode-terminal-selectionBackground': '#073642cc',
    },
  },
  {
    name: 'nord',
    label: 'Nord',
    swatch: '#2e3440',
    accent: '#88c0d0',
    vars: {
      '--vscode-editor-background': '#2e3440',
      '--vscode-editor-foreground': '#d8dee9',
      '--vscode-editorGroupHeader-tabsBackground': '#242933',
      '--vscode-sideBar-background': '#242933',
      '--vscode-editorWidget-background': '#242933',
      '--vscode-descriptionForeground': '#616e88',
      '--vscode-focusBorder': '#88c0d0',
      '--vscode-panel-border': '#3b4252',
      '--vscode-tab-activeBackground': '#2e3440',
      '--vscode-tab-inactiveBackground': '#242933',
      '--vscode-tab-activeForeground': '#eceff4',
      '--vscode-tab-inactiveForeground': '#616e88',
      '--vscode-terminal-background': '#2e3440',
      '--vscode-terminal-foreground': '#d8dee9',
      '--vscode-badge-background': '#88c0d0',
      '--vscode-badge-foreground': '#2e3440',
      '--vscode-terminal-ansiBlack': '#3b4252',
      '--vscode-terminal-ansiRed': '#bf616a',
      '--vscode-terminal-ansiGreen': '#a3be8c',
      '--vscode-terminal-ansiYellow': '#ebcb8b',
      '--vscode-terminal-ansiBlue': '#81a1c1',
      '--vscode-terminal-ansiMagenta': '#b48ead',
      '--vscode-terminal-ansiCyan': '#88c0d0',
      '--vscode-terminal-ansiWhite': '#e5e9f0',
      '--vscode-terminal-ansiBrightBlack': '#4c566a',
      '--vscode-terminal-ansiBrightRed': '#bf616a',
      '--vscode-terminal-ansiBrightGreen': '#a3be8c',
      '--vscode-terminal-ansiBrightYellow': '#ebcb8b',
      '--vscode-terminal-ansiBrightBlue': '#81a1c1',
      '--vscode-terminal-ansiBrightMagenta': '#b48ead',
      '--vscode-terminal-ansiBrightCyan': '#8fbcbb',
      '--vscode-terminal-ansiBrightWhite': '#eceff4',
      '--vscode-terminalCursor-foreground': '#d8dee9',
      '--vscode-terminal-selectionBackground': '#434c5ecc',
    },
  },
  {
    name: 'dracula',
    label: 'Dracula',
    swatch: '#282a36',
    accent: '#bd93f9',
    vars: {
      '--vscode-editor-background': '#282a36',
      '--vscode-editor-foreground': '#f8f8f2',
      '--vscode-editorGroupHeader-tabsBackground': '#21222c',
      '--vscode-sideBar-background': '#21222c',
      '--vscode-editorWidget-background': '#21222c',
      '--vscode-descriptionForeground': '#6272a4',
      '--vscode-focusBorder': '#bd93f9',
      '--vscode-panel-border': '#44475a',
      '--vscode-tab-activeBackground': '#282a36',
      '--vscode-tab-inactiveBackground': '#21222c',
      '--vscode-tab-activeForeground': '#f8f8f2',
      '--vscode-tab-inactiveForeground': '#6272a4',
      '--vscode-terminal-background': '#282a36',
      '--vscode-terminal-foreground': '#f8f8f2',
      '--vscode-badge-background': '#bd93f9',
      '--vscode-badge-foreground': '#282a36',
      '--vscode-terminal-ansiBlack': '#21222c',
      '--vscode-terminal-ansiRed': '#ff5555',
      '--vscode-terminal-ansiGreen': '#50fa7b',
      '--vscode-terminal-ansiYellow': '#f1fa8c',
      '--vscode-terminal-ansiBlue': '#bd93f9',
      '--vscode-terminal-ansiMagenta': '#ff79c6',
      '--vscode-terminal-ansiCyan': '#8be9fd',
      '--vscode-terminal-ansiWhite': '#f8f8f2',
      '--vscode-terminal-ansiBrightBlack': '#6272a4',
      '--vscode-terminal-ansiBrightRed': '#ff6e6e',
      '--vscode-terminal-ansiBrightGreen': '#69ff94',
      '--vscode-terminal-ansiBrightYellow': '#ffffa5',
      '--vscode-terminal-ansiBrightBlue': '#d6acff',
      '--vscode-terminal-ansiBrightMagenta': '#ff92df',
      '--vscode-terminal-ansiBrightCyan': '#a4ffff',
      '--vscode-terminal-ansiBrightWhite': '#ffffff',
      '--vscode-terminalCursor-foreground': '#f8f8f2',
      '--vscode-terminal-selectionBackground': '#44475a80',
    },
  },
];

/** Previously applied variable names — tracked for cleanup. */
let appliedVarNames: string[] = [];

/**
 * Apply a theme by setting --vscode-* CSS variables on document.body.
 * The MutationObserver in terminal-registry will detect the style change
 * and re-read the theme for all xterm.js terminals.
 */
export function applyTheme(themeName: string): void {
  const theme = THEMES.find((t) => t.name === themeName);
  if (!theme) return;

  // Clear previously applied variables
  for (const name of appliedVarNames) {
    document.body.style.removeProperty(name);
  }

  // Apply new variables
  appliedVarNames = Object.keys(theme.vars);
  for (const [name, value] of Object.entries(theme.vars)) {
    document.body.style.setProperty(name, value);
  }
}
