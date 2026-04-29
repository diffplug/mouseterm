import type { MouseTermTheme } from './types';
import { getAllThemes, getStoredActiveThemeId, setActiveThemeId } from './store';
import { completeThemeVars } from './vscode-color-resolver';

let appliedThemeSnapshot: AppliedThemeSnapshot | null = null;

export interface AppliedThemeSnapshot {
  theme: MouseTermTheme;
  providedVars: Record<string, string>;
  resolvedVars: Record<string, string>;
}

const HOST_TYPOGRAPHY_VARS: Record<string, string> = {
  '--vscode-font-size': '13px',
  '--vscode-editor-font-size': '13px',
  '--vscode-font-family': "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  '--vscode-editor-font-family':
    "'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
};

export function applyTheme(theme: MouseTermTheme): void {
  if (typeof document === 'undefined') return;
  if (theme === appliedThemeSnapshot?.theme) return;

  if (appliedThemeSnapshot) {
    for (const name of Object.keys(appliedThemeSnapshot.resolvedVars)) {
      document.body.style.removeProperty(name);
    }
  }

  // Imported theme JSON usually omits VSCode registry defaults; materialize
  // them here so theme.css can read --vscode-* directly without fallbacks.
  const providedVars = { ...HOST_TYPOGRAPHY_VARS, ...theme.vars };
  const vars = completeThemeVars(providedVars, theme.type);
  appliedThemeSnapshot = { theme, providedVars, resolvedVars: vars };
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
}

/** Apply the persisted active theme. When nothing is persisted yet, fall
 *  back to `defaultThemeId` if it resolves to a known theme, otherwise to the
 *  first bundled theme. Idempotent and safe to call before render so the
 *  first paint already has --vscode-* set on body. Returns the theme that was
 *  applied, or null when no themes are available (e.g. SSR). */
export function restoreActiveTheme(defaultThemeId?: string): MouseTermTheme | null {
  const all = getAllThemes();
  const find = (id: string | null | undefined) => (id ? all.find((t) => t.id === id) : undefined);
  const theme = find(getStoredActiveThemeId()) ?? find(defaultThemeId) ?? all[0];
  if (!theme) return null;
  setActiveThemeId(theme.id);
  applyTheme(theme);
  return theme;
}

export function getAppliedThemeSnapshot(): AppliedThemeSnapshot | null {
  return appliedThemeSnapshot;
}
