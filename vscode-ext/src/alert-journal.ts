import { createAlertJournal } from '../../lib/src/host/alert-journal';
import { configureAlertDiagnostics } from '../../lib/src/lib/alert-diagnostics';
import { alertDiagnosticsConfig } from '../../lib/src/lib/alert-diagnostics-config';
import { log } from './log';

let journal: ReturnType<typeof createAlertJournal> | undefined;
export function initAlertJournal(stateDir: string): void {
  if (!alertDiagnosticsConfig.enabled) return;
  journal = createAlertJournal(stateDir, (message) => log.info(message));
  configureAlertDiagnostics('vscode-host', (record) => journal?.append(record));
  log.info(`[alerts] Local journal: ${journal.directory}`);
}
export function appendAlertDiagnostic(record: unknown): void { journal?.append(record); }
export async function closeAlertJournal(): Promise<void> { await journal?.close(); }
