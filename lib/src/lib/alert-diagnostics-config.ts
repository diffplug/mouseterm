/** Temporary instrumentation. Flip to true, rebuild both desktop bundles, and
 * restart to collect a sample. Removal checklist: docs/alert-diagnostics-removal.md.
 * Shared by the renderer, VS Code extension host, and bundled Node sidecar. */
export const alertDiagnosticsConfig = { enabled: false };
