import {
  coerceThemeKind,
  RESOLUTION_RULES,
  RESOLVABLE_VSCODE_VAR_NAMES,
  registryDefaultValue,
  type NullFallbackRule,
  type VscodeThemeKind,
} from './vscode-color-registry';

export type { VscodeThemeKind } from './vscode-color-registry';
export { RESOLVABLE_VSCODE_VAR_NAMES } from './vscode-color-registry';

type StyleDeclaration = Pick<CSSStyleDeclaration, 'getPropertyValue' | 'setProperty' | 'removeProperty'>;

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

export function normalized(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function read(vars: Record<string, string>, name: string): string {
  return normalized(vars[name]);
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
