import { RESOLVABLE_VSCODE_VAR_NAMES } from './vscode-color-registry';
import {
  inferVscodeThemeKind,
  normalized,
  reconcileMaterializedVars,
  resolveMissingVscodeThemeVars,
} from './vscode-color-resolver';

let materializedVars = new Map<string, string>();
let scheduled = false;

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
