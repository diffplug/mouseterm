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
  '--vscode-sideBar-foreground': {
    dark: null,
    light: null,
    hcDark: null,
    hcLight: null,
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

export type VscodeThemeVarTraceOrigin = 'provided' | 'registry-default' | 'fallback' | 'unresolved';

export interface VscodeThemeVarTrace {
  name: string;
  providedValue: string | null;
  registryDefault: string | null;
  fallbackPath: readonly string[];
  fallbackSource: string | null;
  fallbackValue: string | null;
  resolvedValue: string | null;
  origin: VscodeThemeVarTraceOrigin;
}

export interface VscodeThemeResolverTrace {
  themeKind: VscodeThemeKind;
  vars: Record<string, string>;
  traces: VscodeThemeVarTrace[];
}

type NullFallbackRule =
  | { kind: 'literal'; value: string }
  | { kind: 'firstDefined'; names: readonly string[] };

interface ResolutionRule {
  name: string;
  nullFallback?: NullFallbackRule;
}

const literal = (value: string): NullFallbackRule => ({ kind: 'literal', value });
const firstDefined = (names: readonly string[]): NullFallbackRule => ({ kind: 'firstDefined', names });

const RESOLUTION_RULES: readonly ResolutionRule[] = [
  { name: '--vscode-foreground' },
  { name: '--vscode-editor-background' },
  { name: '--vscode-editor-foreground', nullFallback: firstDefined(['--vscode-foreground']) },
  { name: '--vscode-editorWidget-background' },
  { name: '--vscode-sideBar-background' },
  { name: '--vscode-sideBar-foreground', nullFallback: firstDefined(['--vscode-foreground']) },
  { name: '--vscode-descriptionForeground', nullFallback: firstDefined(['--vscode-foreground']) },
  { name: '--vscode-panel-border', nullFallback: literal('transparent') },
  { name: '--vscode-focusBorder' },

  {
    name: '--vscode-list-activeSelectionBackground',
    nullFallback: firstDefined(['--vscode-sideBar-background', '--vscode-editor-background']),
  },
  {
    name: '--vscode-list-activeSelectionForeground',
    nullFallback: firstDefined([
      '--vscode-editor-foreground',
      '--vscode-foreground',
      '--vscode-terminal-foreground',
    ]),
  },
  {
    name: '--vscode-list-inactiveSelectionBackground',
    nullFallback: firstDefined(['--vscode-sideBar-background', '--vscode-editor-background']),
  },
  {
    name: '--vscode-list-inactiveSelectionForeground',
    nullFallback: firstDefined([
      '--vscode-sideBar-foreground',
      '--vscode-foreground',
      '--vscode-editor-foreground',
      '--vscode-terminal-foreground',
    ]),
  },

  { name: '--vscode-errorForeground' },
  { name: '--vscode-input-background' },
  { name: '--vscode-input-border', nullFallback: literal('transparent') },
  { name: '--vscode-button-background' },
  { name: '--vscode-button-foreground' },
  { name: '--vscode-textLink-foreground' },

  { name: '--vscode-terminal-background', nullFallback: firstDefined(['--vscode-editor-background']) },
  { name: '--vscode-terminal-foreground' },
  { name: '--vscode-terminalCursor-foreground', nullFallback: firstDefined(['--vscode-terminal-foreground']) },
  { name: '--vscode-editor-selectionBackground' },
  { name: '--vscode-terminal-selectionBackground', nullFallback: firstDefined(['--vscode-editor-selectionBackground']) },

  { name: '--vscode-terminal-ansiBlack' },
  { name: '--vscode-terminal-ansiRed' },
  { name: '--vscode-terminal-ansiGreen' },
  { name: '--vscode-terminal-ansiYellow' },
  { name: '--vscode-terminal-ansiBlue' },
  { name: '--vscode-terminal-ansiMagenta' },
  { name: '--vscode-terminal-ansiCyan' },
  { name: '--vscode-terminal-ansiWhite' },
  { name: '--vscode-terminal-ansiBrightBlack' },
  { name: '--vscode-terminal-ansiBrightRed' },
  { name: '--vscode-terminal-ansiBrightGreen' },
  { name: '--vscode-terminal-ansiBrightYellow' },
  { name: '--vscode-terminal-ansiBrightBlue' },
  { name: '--vscode-terminal-ansiBrightMagenta' },
  { name: '--vscode-terminal-ansiBrightCyan' },
  { name: '--vscode-terminal-ansiBrightWhite' },
];

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

function registryDefaultValue(name: string, themeKind: VscodeThemeKind): string | null {
  const value = registryDefault(name, themeKind);
  return value === NULL_COLOR ? null : value;
}

function fallbackPath(fallback?: NullFallbackRule): readonly string[] {
  if (!fallback) return [];
  return fallback.kind === 'literal' ? [fallback.value] : fallback.names;
}

function resolveNullFallback(
  vars: Record<string, string>,
  fallback?: NullFallbackRule,
): { source: string | null; value: string | null } {
  if (!fallback) return { source: null, value: null };

  if (fallback.kind === 'literal') {
    return { source: fallback.value, value: fallback.value };
  }

  for (const name of fallback.names) {
    const value = read(vars, name);
    if (value) return { source: name, value };
  }
  return { source: null, value: null };
}

export function inferVscodeThemeKind(): VscodeThemeKind {
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

function resolveInRegistryOrder(vars: Record<string, string>, themeKind: VscodeThemeKind): VscodeThemeResolverTrace {
  const complete = { ...vars };
  const traces: VscodeThemeVarTrace[] = [];

  for (const rule of RESOLUTION_RULES) {
    const providedValue = read(vars, rule.name) || null;
    const registryDefaultForKind = registryDefaultValue(rule.name, themeKind);
    let fallbackSource: string | null = null;
    let fallbackValue: string | null = null;
    let resolvedValue: string | null = null;
    let origin: VscodeThemeVarTraceOrigin = 'unresolved';

    if (providedValue) {
      resolvedValue = providedValue;
      origin = 'provided';
      complete[rule.name] = providedValue;
    } else if (registryDefaultForKind) {
      resolvedValue = registryDefaultForKind;
      origin = 'registry-default';
      complete[rule.name] = registryDefaultForKind;
    } else {
      const fallback = resolveNullFallback(complete, rule.nullFallback);
      fallbackSource = fallback.source;
      fallbackValue = fallback.value;
      if (fallbackValue) {
        resolvedValue = fallbackValue;
        origin = 'fallback';
        complete[rule.name] = fallbackValue;
      }
    }

    traces.push({
      name: rule.name,
      providedValue,
      registryDefault: registryDefaultForKind,
      fallbackPath: fallbackPath(rule.nullFallback),
      fallbackSource,
      fallbackValue,
      resolvedValue,
      origin,
    });
  }

  return { themeKind, vars: complete, traces };
}

export function completeThemeVars(
  vars: Record<string, string>,
  themeKind: VscodeThemeKind | 'dark' | 'light',
): Record<string, string> {
  return resolveInRegistryOrder(vars, coerceThemeKind(themeKind)).vars;
}

export function traceThemeVars(
  vars: Record<string, string>,
  themeKind: VscodeThemeKind | 'dark' | 'light',
): VscodeThemeResolverTrace {
  return resolveInRegistryOrder(vars, coerceThemeKind(themeKind));
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

  const desired = resolveMissingVscodeThemeVars(readHostVars(), inferVscodeThemeKind());
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

export function getMaterializedVscodeThemeVars(): ReadonlyMap<string, string> {
  return materializedVars;
}
