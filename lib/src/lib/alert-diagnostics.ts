import { alertDiagnosticsConfig } from './alert-diagnostics-config';

/** Local observability only: never use these records to drive alert state. */
export type DiagnosticFields = Record<string, string | number | boolean | null>;
export interface AlertDiagnostic {
  version: 1;
  source: string;
  seq: number;
  at: number;
  monotonicMs: number;
  event: string;
  fields: DiagnosticFields;
}

let sink: ((record: AlertDiagnostic) => void) | undefined;
let source = '';
let seq = 0;
let windowAt = 0;
let windowCount = 0;
let dropped = 0;

export function alertDiagnosticsEnabled(): boolean { return alertDiagnosticsConfig.enabled && sink !== undefined; }

export function diagnosticId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function configureAlertDiagnostics(label: string, write?: (record: AlertDiagnostic) => void): void {
  sink = alertDiagnosticsConfig.enabled ? write : undefined;
  source = `${label}:${diagnosticId()}`;
  seq = windowCount = dropped = 0;
  windowAt = performance.now();
  alertDiagnostic('source.start', { label });
}

/** Callers pass metadata only; speech.request alone carries sanitized spoken text.
 * Bound event storms before IPC and signal loss. Disk/IPC failure cannot affect alerts. */
export function alertDiagnostic(event: string, fields: DiagnosticFields = {}): void {
  if (!alertDiagnosticsEnabled() || !sink) return;
  try {
    const monotonicMs = performance.now();
    const record = (name: string, data: DiagnosticFields): AlertDiagnostic => ({
      version: 1, source, seq: ++seq, at: Date.now(), monotonicMs, event: name, fields: data,
    });
    if (monotonicMs - windowAt >= 1000) {
      windowAt = monotonicMs;
      windowCount = 0;
      if (dropped) {
        const count = dropped;
        dropped = 0;
        sink(record('diagnostics.dropped', { count }));
      }
    }
    // Speech requests/outcomes get priority over noisy state transitions.
    if (windowCount >= (event.startsWith('speech.') ? 200 : 100)) { dropped++; return; }
    windowCount++;
    sink(record(event, fields));
  } catch { dropped++; /* Observability must never interrupt delivery. */ }
}

export function observeAlertFocus(): () => void {
  if (!alertDiagnosticsEnabled() || typeof window === 'undefined') return () => {};
  const record = (event: Event): void => alertDiagnostic('renderer.focus', {
    trigger: event.type, focused: document.hasFocus(), visibility: document.visibilityState,
  });
  const events = ['focus', 'blur', 'pageshow', 'pagehide'] as const;
  for (const name of events) window.addEventListener(name, record);
  document.addEventListener('visibilitychange', record);
  record(new Event('initial'));
  return () => {
    for (const name of events) window.removeEventListener(name, record);
    document.removeEventListener('visibilitychange', record);
  };
}
