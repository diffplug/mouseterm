import { copyRaw, copyRewrapped } from './clipboard';
import { flashCopy, getMouseSelectionState } from './mouse-selection';

/**
 * Copy the current selection and confirm it with the "Copied!" flash. Lives
 * apart from `clipboard.ts` so it can reach `flashCopy` without that module
 * depending on the selection store's render side.
 *
 * The flash is withheld unless the clipboard write succeeded *and* the
 * selection is still the one that was copied — an await gives a new drag time
 * to land, and flashing then would clear the newer selection.
 */
export async function copySelection(terminalId: string, rewrapped: boolean): Promise<void> {
  const selection = getMouseSelectionState(terminalId).selection;
  const copied = await (rewrapped ? copyRewrapped(terminalId) : copyRaw(terminalId));
  if (copied && getMouseSelectionState(terminalId).selection === selection) {
    flashCopy(terminalId, rewrapped ? 'rewrapped' : 'raw');
  }
}
