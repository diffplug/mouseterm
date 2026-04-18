import { getMouseSelectionState } from './mouse-selection';
import { rewrap } from './rewrap';
import { extractSelectionText } from './selection-text';
import { getPlatform } from './platform';
import { getTerminalInstance } from './terminal-registry';

async function writeText(text: string): Promise<void> {
  if (!text) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Clipboard write can fail when the document lacks focus or the
    // Permissions API denied access. Silently ignore — the user will
    // notice the paste didn't work and can retry.
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
  let text: string;
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
    text = await navigator.clipboard.readText();
  } catch {
    // Clipboard read can fail when the document lacks focus or the
    // Permissions API denied access. Silently ignore.
    return;
  }
  if (!text) return;
  const bracketed = getMouseSelectionState(terminalId).bracketedPaste;
  const payload = bracketed ? `\x1b[200~${text}\x1b[201~` : text;
  getPlatform().writePty(terminalId, payload);
}
