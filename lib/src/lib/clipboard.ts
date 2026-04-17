import { getMouseSelectionState } from './mouse-selection';
import { rewrap } from './rewrap';
import { extractSelectionText } from './selection-text';
import { getPlatform } from './platform';
import { getTerminalInstance } from './terminal-registry';

async function writeText(text: string): Promise<void> {
  if (!text) return;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * Copy the terminal's current selection to the clipboard as-is.
 * No-op if no selection exists.
 */
export async function copyRaw(terminalId: string): Promise<void> {
  const terminal = getTerminalInstance(terminalId);
  const sel = getMouseSelectionState(terminalId).selection;
  if (!terminal || !sel) return;
  await writeText(extractSelectionText(terminal, sel));
}

/**
 * Copy the terminal's current selection with rewrap transformations applied.
 * Block selections are not rewrapped (they're intentionally rectangular slabs).
 * No-op if no selection exists.
 */
export async function copyRewrapped(terminalId: string): Promise<void> {
  const terminal = getTerminalInstance(terminalId);
  const sel = getMouseSelectionState(terminalId).selection;
  if (!terminal || !sel) return;
  const raw = extractSelectionText(terminal, sel);
  const out = sel.shape === 'block' ? raw : rewrap(raw);
  await writeText(out);
}

/**
 * Read text from the clipboard and write it to the PTY, honoring the
 * inside program's bracketed-paste mode when enabled (spec §8.5).
 */
export async function doPaste(terminalId: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
  const text = await navigator.clipboard.readText();
  if (!text) return;
  const bracketed = getMouseSelectionState(terminalId).bracketedPaste;
  const payload = bracketed ? `\x1b[200~${text}\x1b[201~` : text;
  getPlatform().writePty(terminalId, payload);
}
