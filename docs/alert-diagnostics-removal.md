# Removing temporary alert diagnostics

The feature gate and current logging contract are owned by `docs/specs/alert.md` → Local alert diagnostics.

Use this checklist when the usage sample and alert investigation are finished:

1. Remove `lib/src/lib/alert-diagnostics-config.ts`, `lib/src/lib/alert-diagnostics.ts`, and `lib/src/host/alert-journal.ts`, their dedicated tests, and `vscode-ext/src/alert-journal.ts`.
2. Remove diagnostic imports and calls from the alert manager, detector, ring watcher, speech, settings, activity store, and platform initialization. Remove diagnostic-only snapshots, counters, timer wrappers, and attempt metadata. Keep the existing ring/attention decisions, speech callbacks, and high-entropy redaction.
3. Remove `recordAlertDiagnostic` from the platform port and desktop adapters; remove `alert:diagnostic` / `alert_diagnostic` from the VS Code message types/router, Tauri command registration, and sidecar dispatch. Remove journal initialization/shutdown hooks, the sidecar bundle entry, and its `.gitignore` entry.
4. Remove `scripts/summarize-alert-log.mjs`, its test and root test-script entry. Remove diagnostic-only assertions from mixed test files, the owning spec section/rationale, this checklist, and pointers in the transport, desktop-host, and local-security specs. Ratchet changed spec budgets.
5. Search for leftovers with `rg -n 'alert-diagnostic|alert-journal|alertDiagnostic|AlertDiagnostic|recordLifecycle|diagnosticSnapshot|summarize-alert-log' lib standalone vscode-ext scripts docs .gitignore package.json`. Run `pnpm test` and build both desktop hosts.

Disabling or removing the feature leaves existing `alert-logs` directories intact. Delete those saved samples separately if they are no longer needed.
