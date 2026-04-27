export type VscodeThemeKind = 'dark' | 'light' | 'hcDark' | 'hcLight';

type ThemePalette = Record<VscodeThemeKind, string | null>;
type StyleDeclaration = Pick<CSSStyleDeclaration, 'getPropertyValue' | 'setProperty' | 'removeProperty'>;

const THEME_KINDS: readonly VscodeThemeKind[] = ['dark', 'light', 'hcDark', 'hcLight'];

const NULL_COLOR = Symbol('null-color');
type ResolvedColor = string | typeof NULL_COLOR;

const REGISTRY_DEFAULTS: Record<string, ThemePalette> = {
  '--vscode-foreground': {
    dark: '#CCCCCC',
    light: '#616161',
    hcDark: '#FFFFFF',
    hcLight: '#292929',
  },
  '--vscode-editor-background': {
    dark: '#1E1E1E',
    light: '#ffffff',
    hcDark: '#000000',
    hcLight: '#ffffff',
  },
  '--vscode-editor-foreground': {
    dark: '#BBBBBB',
    light: '#333333',
    hcDark: '#ffffff',
    hcLight: null,
  },
  '--vscode-editorWidget-background': {
    dark: '#252526',
    light: '#F3F3F3',
    hcDark: '#0C141F',
    hcLight: '#ffffff',
  },
  '--vscode-sideBar-background': {
    dark: '#252526',
    light: '#F3F3F3',
    hcDark: '#000000',
    hcLight: '#ffffff',
  },
  '--vscode-descriptionForeground': {
    dark: '#ccccccb3',
    light: '#717171',
    hcDark: '#ffffffb3',
    hcLight: '#292929b3',
  },
  '--vscode-panel-border': {
    dark: '#80808059',
    light: '#80808059',
    hcDark: null,
    hcLight: null,
  },
  '--vscode-focusBorder': {
    dark: '#007FD4',
    light: '#0090F1',
    hcDark: '#F38518',
    hcLight: '#006BBD',
  },
  '--vscode-list-activeSelectionBackground': {
    dark: '#04395E',
    light: '#0060C0',
    hcDark: null,
    hcLight: '#0F4A851a',
  },
  '--vscode-list-activeSelectionForeground': {
    dark: '#ffffff',
    light: '#ffffff',
    hcDark: null,
    hcLight: null,
  },
  '--vscode-list-inactiveSelectionBackground': {
    dark: '#37373D',
    light: '#E4E6F1',
    hcDark: null,
    hcLight: '#0F4A851a',
  },
  '--vscode-list-inactiveSelectionForeground': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
  },
  '--vscode-errorForeground': {
    dark: '#F48771',
    light: '#A1260D',
    hcDark: '#F48771',
    hcLight: '#B5200D',
  },
  '--vscode-input-background': {
    dark: '#3C3C3C',
    light: '#ffffff',
    hcDark: '#000000',
    hcLight: '#ffffff',
  },
  '--vscode-input-border': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
  },
  '--vscode-button-background': {
    dark: '#0E639C',
    light: '#007ACC',
    hcDark: '#000000',
    hcLight: '#0F4A85',
  },
  '--vscode-button-foreground': {
    dark: '#ffffff',
    light: '#ffffff',
    hcDark: '#ffffff',
    hcLight: '#ffffff',
  },
  '--vscode-textLink-foreground': {
    dark: '#3794FF',
    light: '#006AB1',
    hcDark: '#21A6FF',
    hcLight: '#0F4A85',
  },
  '--vscode-terminal-background': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
  },
  '--vscode-terminal-foreground': {
    dark: '#CCCCCC',
    light: '#333333',
    hcDark: '#ffffff',
    hcLight: '#292929',
  },
  '--vscode-terminalCursor-foreground': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
  },
  '--vscode-editor-selectionBackground': {
    dark: '#264F78',
    light: '#ADD6FF',
    hcDark: '#f3f518',
    hcLight: '#0F4A85',
  },
  '--vscode-terminal-selectionBackground': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
  },
  '--vscode-terminal-ansiBlack': {
    dark: '#000000',
    light: '#000000',
    hcDark: '#000000',
    hcLight: '#292929',
  },
  '--vscode-terminal-ansiRed': {
    dark: '#cd3131',
    light: '#cd3131',
    hcDark: '#cd0000',
    hcLight: '#cd3131',
  },
  '--vscode-terminal-ansiGreen': {
    dark: '#0DBC79',
    light: '#107C10',
    hcDark: '#00cd00',
    hcLight: '#136C13',
  },
  '--vscode-terminal-ansiYellow': {
    dark: '#e5e510',
    light: '#949800',
    hcDark: '#cdcd00',
    hcLight: '#949800',
  },
  '--vscode-terminal-ansiBlue': {
    dark: '#2472c8',
    light: '#0451a5',
    hcDark: '#0000ee',
    hcLight: '#0451a5',
  },
  '--vscode-terminal-ansiMagenta': {
    dark: '#bc3fbc',
    light: '#bc05bc',
    hcDark: '#cd00cd',
    hcLight: '#bc05bc',
  },
  '--vscode-terminal-ansiCyan': {
    dark: '#11a8cd',
    light: '#0598bc',
    hcDark: '#00cdcd',
    hcLight: '#0598bc',
  },
  '--vscode-terminal-ansiWhite': {
    dark: '#e5e5e5',
    light: '#555555',
    hcDark: '#e5e5e5',
    hcLight: '#555555',
  },
  '--vscode-terminal-ansiBrightBlack': {
    dark: '#666666',
    light: '#666666',
    hcDark: '#7f7f7f',
    hcLight: '#666666',
  },
  '--vscode-terminal-ansiBrightRed': {
    dark: '#f14c4c',
    light: '#cd3131',
    hcDark: '#ff0000',
    hcLight: '#cd3131',
  },
  '--vscode-terminal-ansiBrightGreen': {
    dark: '#23d18b',
    light: '#14CE14',
    hcDark: '#00ff00',
    hcLight: '#00bc00',
  },
  '--vscode-terminal-ansiBrightYellow': {
    dark: '#f5f543',
    light: '#b5ba00',
    hcDark: '#ffff00',
    hcLight: '#b5ba00',
  },
  '--vscode-terminal-ansiBrightBlue': {
    dark: '#3b8eea',
    light: '#0451a5',
    hcDark: '#5c5cff',
    hcLight: '#0451a5',
  },
  '--vscode-terminal-ansiBrightMagenta': {
    dark: '#d670d6',
    light: '#bc05bc',
    hcDark: '#ff00ff',
    hcLight: '#bc05bc',
  },
  '--vscode-terminal-ansiBrightCyan': {
    dark: '#29b8db',
    light: '#0598bc',
    hcDark: '#00ffff',
    hcLight: '#0598bc',
  },
  '--vscode-terminal-ansiBrightWhite': {
    dark: '#e5e5e5',
    light: '#a5a5a5',
    hcDark: '#ffffff',
    hcLight: '#a5a5a5',
  },
};

export const RESOLVABLE_VSCODE_VAR_NAMES: readonly string[] = Object.keys(REGISTRY_DEFAULTS);

let materializedVars = new Map<string, string>();
let scheduled = false;

function normalized(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function read(vars: Record<string, string>, name: string): string {
  return normalized(vars[name]);
}

function registryDefault(name: string, themeKind: VscodeThemeKind): ResolvedColor {
  const defaults = REGISTRY_DEFAULTS[name];
  if (!defaults) return NULL_COLOR;

  const value = defaults[themeKind];
  if (value) return value;
  return NULL_COLOR;
}

function firstDefined(vars: Record<string, string>, names: readonly string[]): string {
  for (const name of names) {
    const value = read(vars, name);
    if (value) return value;
  }
  return '';
}

function setDefault(
  vars: Record<string, string>,
  name: string,
  themeKind: VscodeThemeKind,
  nullFallback: string | ((vars: Record<string, string>) => string) = '',
): void {
  if (read(vars, name)) return;

  const value = registryDefault(name, themeKind);
  if (value !== NULL_COLOR) {
    vars[name] = value;
    return;
  }

  const fallback = typeof nullFallback === 'function' ? nullFallback(vars) : nullFallback;
  if (fallback) vars[name] = fallback;
}

function inferThemeKind(): VscodeThemeKind {
  if (typeof document === 'undefined') return 'dark';

  const body = document.body;
  const root = document.documentElement;
  const has = (className: string) => body.classList.contains(className) || root.classList.contains(className);

  if (has('vscode-high-contrast-light')) return 'hcLight';
  if (has('vscode-high-contrast') || has('vscode-high-contrast-dark')) return has('vscode-light') ? 'hcLight' : 'hcDark';
  return has('vscode-light') ? 'light' : 'dark';
}

function coerceThemeKind(themeKind: VscodeThemeKind | 'dark' | 'light'): VscodeThemeKind {
  return THEME_KINDS.includes(themeKind as VscodeThemeKind) ? themeKind as VscodeThemeKind : 'dark';
}

function completeInRegistryOrder(vars: Record<string, string>, themeKind: VscodeThemeKind): Record<string, string> {
  const complete = { ...vars };

  setDefault(complete, '--vscode-foreground', themeKind);
  setDefault(complete, '--vscode-editor-background', themeKind);
  setDefault(complete, '--vscode-editor-foreground', themeKind, (current) => read(current, '--vscode-foreground'));
  setDefault(complete, '--vscode-editorWidget-background', themeKind);
  setDefault(complete, '--vscode-sideBar-background', themeKind);
  setDefault(complete, '--vscode-descriptionForeground', themeKind, (current) => read(current, '--vscode-foreground'));
  setDefault(complete, '--vscode-panel-border', themeKind, 'transparent');
  setDefault(complete, '--vscode-focusBorder', themeKind);

  setDefault(complete, '--vscode-list-activeSelectionBackground', themeKind, (current) => (
    firstDefined(current, ['--vscode-sideBar-background', '--vscode-editor-background'])
  ));
  setDefault(complete, '--vscode-list-activeSelectionForeground', themeKind, (current) => (
    firstDefined(current, ['--vscode-editor-foreground', '--vscode-foreground', '--vscode-terminal-foreground'])
  ));
  setDefault(complete, '--vscode-list-inactiveSelectionBackground', themeKind, (current) => (
    firstDefined(current, ['--vscode-sideBar-background', '--vscode-editor-background'])
  ));
  setDefault(complete, '--vscode-list-inactiveSelectionForeground', themeKind, (current) => (
    firstDefined(current, ['--vscode-editor-foreground', '--vscode-foreground', '--vscode-terminal-foreground'])
  ));

  setDefault(complete, '--vscode-errorForeground', themeKind);
  setDefault(complete, '--vscode-input-background', themeKind);
  setDefault(complete, '--vscode-input-border', themeKind, 'transparent');
  setDefault(complete, '--vscode-button-background', themeKind);
  setDefault(complete, '--vscode-button-foreground', themeKind);
  setDefault(complete, '--vscode-textLink-foreground', themeKind);

  setDefault(complete, '--vscode-terminal-background', themeKind, (current) => read(current, '--vscode-editor-background'));
  setDefault(complete, '--vscode-terminal-foreground', themeKind);
  setDefault(complete, '--vscode-terminalCursor-foreground', themeKind, (current) => (
    read(current, '--vscode-terminal-foreground')
  ));
  setDefault(complete, '--vscode-editor-selectionBackground', themeKind);
  setDefault(complete, '--vscode-terminal-selectionBackground', themeKind, (current) => (
    read(current, '--vscode-editor-selectionBackground')
  ));

  setDefault(complete, '--vscode-terminal-ansiBlack', themeKind);
  setDefault(complete, '--vscode-terminal-ansiRed', themeKind);
  setDefault(complete, '--vscode-terminal-ansiGreen', themeKind);
  setDefault(complete, '--vscode-terminal-ansiYellow', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBlue', themeKind);
  setDefault(complete, '--vscode-terminal-ansiMagenta', themeKind);
  setDefault(complete, '--vscode-terminal-ansiCyan', themeKind);
  setDefault(complete, '--vscode-terminal-ansiWhite', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightBlack', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightRed', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightGreen', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightYellow', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightBlue', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightMagenta', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightCyan', themeKind);
  setDefault(complete, '--vscode-terminal-ansiBrightWhite', themeKind);

  return complete;
}

export function completeThemeVars(
  vars: Record<string, string>,
  themeKind: VscodeThemeKind | 'dark' | 'light',
): Record<string, string> {
  return completeInRegistryOrder(vars, coerceThemeKind(themeKind));
}

export function resolveMissingVscodeThemeVars(
  vars: Record<string, string>,
  themeKind: VscodeThemeKind | 'dark' | 'light',
): Record<string, string> {
  const complete = completeThemeVars(vars, themeKind);
  const missing: Record<string, string> = {};

  for (const name of RESOLVABLE_VSCODE_VAR_NAMES) {
    if (!read(vars, name) && read(complete, name)) {
      missing[name] = complete[name];
    }
  }

  return missing;
}

export function reconcileMaterializedVars(
  style: StyleDeclaration,
  previous: ReadonlyMap<string, string>,
  desired: Record<string, string>,
): Map<string, string> {
  for (const [name, value] of previous) {
    if (desired[name] !== undefined) continue;
    if (normalized(style.getPropertyValue(name)) === value) {
      style.removeProperty(name);
    }
  }

  const next = new Map<string, string>();
  for (const [name, value] of Object.entries(desired)) {
    if (normalized(style.getPropertyValue(name)) !== value) {
      style.setProperty(name, value);
    }
    next.set(name, value);
  }

  return next;
}

function readHostVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  const styles = getComputedStyle(document.body);

  for (const name of RESOLVABLE_VSCODE_VAR_NAMES) {
    const value = normalized(styles.getPropertyValue(name));
    if (!value || materializedVars.get(name) === value) continue;
    vars[name] = value;
  }

  return vars;
}

function recomputeDocumentVars(): void {
  scheduled = false;
  if (typeof document === 'undefined') return;

  const desired = resolveMissingVscodeThemeVars(readHostVars(), inferThemeKind());
  materializedVars = reconcileMaterializedVars(document.body.style, materializedVars, desired);
}

function scheduleRecompute(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(recomputeDocumentVars);
}

export function installVscodeThemeVarResolver(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  recomputeDocumentVars();

  const observer = new MutationObserver(scheduleRecompute);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  return () => {
    observer.disconnect();
    for (const [name, value] of materializedVars) {
      if (normalized(document.body.style.getPropertyValue(name)) === value) {
        document.body.style.removeProperty(name);
      }
    }
    materializedVars = new Map();
    scheduled = false;
  };
}
