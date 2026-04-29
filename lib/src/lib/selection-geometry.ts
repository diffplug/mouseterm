import { normalizeSelection } from './selection-text';
import type { Selection } from './mouse-selection';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Trace the perimeter of a linewise/block selection's visible rects as a
 * single closed SVG path.
 *
 * Rects are row-adjacent and in top-to-bottom order (guaranteed by
 * `computeRects`). We walk the right edges going down, the bottom edge of
 * the last rect, the left edges going up, then the top edge of the first
 * rect. Horizontal connector segments between rows of different widths
 * naturally fall out of the vertex sequence.
 */
export function rectsToPath(rects: Rect[]): string {
  if (rects.length === 0) return '';
  const pts: Array<[number, number]> = [];
  // Right side going down — each rect contributes (top-right, bottom-right).
  for (const r of rects) {
    pts.push([r.left + r.width, r.top]);
    pts.push([r.left + r.width, r.top + r.height]);
  }
  // Left side going up — walk the rects in reverse, contributing
  // (bottom-left, top-left) each.
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    pts.push([r.left, r.top + r.height]);
    pts.push([r.left, r.top]);
  }
  return 'M ' + pts.map(([x, y]) => `${x} ${y}`).join(' L ') + ' Z';
}

export function computeRects(
  sel: Selection,
  cols: number,
  viewportY: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
): Rect[] {
  const n = normalizeSelection(sel);

  const viewportStart = viewportY;
  const viewportEnd = viewportY + rows;

  if (sel.shape === 'block') {
    const top = Math.max(viewportStart, n.r0);
    const bottom = Math.min(viewportEnd - 1, n.r1);
    if (top > bottom) return [];
    const left = n.c0;
    const right = n.c1;
    return [{
      top: (top - viewportStart) * cellHeight,
      left: left * cellWidth,
      width: (right - left + 1) * cellWidth,
      height: (bottom - top + 1) * cellHeight,
    }];
  }

  // Linewise — one rect per visible row in [r0..r1].
  const rects: Rect[] = [];
  const firstRow = Math.max(viewportStart, n.r0);
  const lastRow = Math.min(viewportEnd - 1, n.r1);
  for (let r = firstRow; r <= lastRow; r++) {
    let c0 = 0;
    let c1 = cols;
    if (r === n.r0) c0 = n.c0;
    if (r === n.r1) c1 = n.c1 + 1;
    if (c1 <= c0) continue;
    rects.push({
      top: (r - viewportStart) * cellHeight,
      left: c0 * cellWidth,
      width: (c1 - c0) * cellWidth,
      height: cellHeight,
    });
  }
  return rects;
}
