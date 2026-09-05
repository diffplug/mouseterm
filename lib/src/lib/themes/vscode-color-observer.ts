import { RESOLVABLE_VSCODE_VAR_NAMES } from './vscode-color-registry';
import {
  inferVscodeThemeKind,
  normalized,
  reconcileMaterializedVars,
  resolveMissingVscodeThemeVars,
} from './vscode-color-resolver';

let materializedVars = new Map<string, string>();

function readHostVars(): Record<string, string> {
  // Inline fallbacks otherwise hide newly supplied stylesheet/inherited values.
  // Remove only values we still own before reading the host's current cascade.
  for (const [name, value] of materializedVars) {
    if (normalized(document.body.style.getPropertyValue(name)) === value) {
      document.body.style.removeProperty(name);
    }
  }
  const vars: Record<string, string> = {};
  const styles = getComputedStyle(document.body);

  for (const name of RESOLVABLE_VSCODE_VAR_NAMES) {
    const value = normalized(styles.getPropertyValue(name));
    if (!value) continue;
    vars[name] = value;
  }

  return vars;
}

function recomputeDocumentVars(): void {
  if (typeof document === 'undefined') return;

  const desired = resolveMissingVscodeThemeVars(readHostVars(), inferVscodeThemeKind());
  materializedVars = reconcileMaterializedVars(document.body.style, materializedVars, desired);
}

export function installVscodeThemeVarResolver(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }

  recomputeDocumentVars();

  let scheduled = false;
  let disposed = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (disposed) return;
      recomputeDocumentVars();
      // Removing and restoring our inline fallbacks is synchronous. Discard
      // those writes so they cannot schedule an endless self-refresh loop.
      observer.takeRecords();
    });
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });

  return () => {
    disposed = true;
    observer.disconnect();
    for (const [name, value] of materializedVars) {
      if (normalized(document.body.style.getPropertyValue(name)) === value) {
        document.body.style.removeProperty(name);
      }
    }
    materializedVars = new Map();
  };
}

export function getMaterializedVscodeThemeVars(): ReadonlyMap<string, string> {
  return materializedVars;
}
