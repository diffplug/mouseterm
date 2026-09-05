// "Add to notepad" for a finalized terminal selection (docs/specs/notepad.md →
// Capture). Reached from the selection popup's third button and from the
// Cmd/Ctrl+N chord, both of which flash and dismiss the selection themselves —
// a capture never opens the notepad.
import { registry } from '../terminal-store';
import { getMouseSelectionState } from '../mouse-selection';
import { getPlatformOrNull } from '../platform';
import { getTerminalInstance } from '../terminal-registry';
import { hasNotepadArchive } from './archive-service';
import { addTerminalNote } from './notepad-store';
import { captureRichSelection } from './rich-extract';
import { registerTerminalSource } from './source-link';

/** Whether Cmd/Ctrl+N is ours to bind. The website demo runs in a browser that
 *  reserves the chord for a new window, so it keeps the button and shows no
 *  shortcut. */
export function isNotepadChordBound(): boolean {
  return hasNotepadArchive() && getPlatformOrNull()?.browserReservesNotepadChord !== true;
}

/** Capture the terminal's finalized selection into its notepad as a rich note,
 *  with a source pin when the normal buffer is active. Returns `false` when
 *  there is no finalized selection, no live terminal to read, or the Surface is
 *  closing — the caller flashes "Added" only on a `true`. */
export function addSelectionToNotepad(terminalId: string): boolean {
  const sel = getMouseSelectionState(terminalId).selection;
  // Mid-drag there is nothing settled to capture; the popup is not up either.
  if (!sel || sel.dragging) return false;
  const terminal = getTerminalInstance(terminalId);
  if (!terminal) return false;

  const { runs, rawText } = captureRichSelection(terminal, sel);
  // Helpers capture into the parent's list without ever creating source markers.
  const parentId = registry.get(terminalId)?.helper?.parentId;
  const source = parentId ? null : registerTerminalSource(terminal, terminalId, sel, rawText);
  // The owner's closing freeze also refuses captures from its helper.
  return addTerminalNote(parentId ?? terminalId, runs, source ?? undefined) !== null;
}
