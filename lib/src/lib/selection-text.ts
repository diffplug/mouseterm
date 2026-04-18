import type { Terminal } from '@xterm/xterm';
import type { Selection } from './mouse-selection';

export interface NormalizedSelection {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

/**
 * Normalize a selection so start comes before end in reading order.
 * For block shape we normalize min/max on both axes independently.
 */
export function normalizeSelection(sel: Selection): NormalizedSelection {
  if (sel.shape === 'block') {
    return {
      r0: Math.min(sel.startRow, sel.endRow),
      c0: Math.min(sel.startCol, sel.endCol),
      r1: Math.max(sel.startRow, sel.endRow),
      c1: Math.max(sel.startCol, sel.endCol),
    };
  }
  const before = sel.startRow < sel.endRow || (sel.startRow === sel.endRow && sel.startCol <= sel.endCol);
  return {
    r0: before ? sel.startRow : sel.endRow,
    c0: before ? sel.startCol : sel.endCol,
    r1: before ? sel.endRow : sel.startRow,
    c1: before ? sel.endCol : sel.startCol,
  };
}

/**
 * Read the cells covered by `sel` from the terminal's active buffer and
 * return them as a single string. Rows are joined with `\n`. Block shapes
 * are rectangular slabs; linewise shapes follow reading order.
 */
export function extractSelectionText(terminal: Terminal, sel: Selection): string {
  const n = normalizeSelection(sel);
  const buf = terminal.buffer.active;
  const lines: string[] = [];

  if (sel.shape === 'block') {
    for (let r = n.r0; r <= n.r1; r++) {
      const line = buf.getLine(r);
      if (!line) continue;
      lines.push(line.translateToString(false, n.c0, n.c1 + 1).replace(/\s+$/, ''));
    }
    return lines.join('\n');
  }

  for (let r = n.r0; r <= n.r1; r++) {
    const line = buf.getLine(r);
    if (!line) continue;
    const c0 = r === n.r0 ? n.c0 : 0;
    const c1 = r === n.r1 ? n.c1 : terminal.cols;
    lines.push(line.translateToString(false, c0, c1).replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
