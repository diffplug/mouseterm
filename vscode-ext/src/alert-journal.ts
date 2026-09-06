import { createAlertJournal } from '../../lib/src/host/alert-journal';
import { configureAlertDiagnostics } from '../../lib/src/lib/alert-diagnostics';
import { log } from './log';

let journal: ReturnType<typeof createAlertJournal> | undefined;
export function initAlertJournal(stateDir: string): void {
  journal = createAlertJournal(stateDir, (message) => log.info(message));
  configureAlertDiagnostics('vscode-host', (record) => journal?.append(record));
  log.info(`[alerts] Local journal: ${journal.directory}`);
}
export function appendAlertDiagnostic(record: unknown): void { journal?.append(record); }
export async function closeAlertJournal(): Promise<void> { await journal?.close(); }
