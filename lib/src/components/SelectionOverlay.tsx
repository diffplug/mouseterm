import { useSyncExternalStore, type CSSProperties } from 'react';
import {
  DEFAULT_MOUSE_SELECTION_STATE,
  getMouseSelectionSnapshot,
  getRenderTick,
  subscribeToMouseSelection,
  subscribeToRenderTick,
  type Selection,
} from '../lib/mouse-selection';
import { getTerminalOverlayDims } from '../lib/terminal-registry';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Normalize a selection so start comes before end in reading order.
 * For block shape we normalize min/max on both axes.
 */
function normalize(sel: Selection): { r0: number; c0: number; r1: number; c1: number; shape: Selection['shape'] } {
  if (sel.shape === 'block') {
    return {
      r0: Math.min(sel.startRow, sel.endRow),
      c0: Math.min(sel.startCol, sel.endCol),
      r1: Math.max(sel.startRow, sel.endRow),
      c1: Math.max(sel.startCol, sel.endCol),
      shape: 'block',
    };
  }
  // Linewise: compare in reading order.
  const before =
    sel.startRow < sel.endRow || (sel.startRow === sel.endRow && sel.startCol <= sel.endCol);
  return {
    r0: before ? sel.startRow : sel.endRow,
    c0: before ? sel.startCol : sel.endCol,
    r1: before ? sel.endRow : sel.startRow,
    c1: before ? sel.endCol : sel.startCol,
    shape: 'linewise',
  };
}

function computeRects(
  sel: Selection,
  cols: number,
  viewportY: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
): Rect[] {
  const n = normalize(sel);

  const viewportStart = viewportY;
  const viewportEnd = viewportY + rows;

  if (n.shape === 'block') {
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
    if (r === n.r1) c1 = n.c1;
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

interface Props {
  terminalId: string;
}

/**
 * Compositor-layer selection highlight rendered above xterm's cell grid.
 * Re-measures on every render tick (scroll, resize, output).
 */
export function SelectionOverlay({ terminalId }: Props) {
  const states = useSyncExternalStore(subscribeToMouseSelection, getMouseSelectionSnapshot);
  // Subscribe to render tick so we re-render whenever xterm scrolls or resizes.
  useSyncExternalStore(subscribeToRenderTick, getRenderTick);

  const state = states.get(terminalId) ?? DEFAULT_MOUSE_SELECTION_STATE;
  const selection = state.selection;
  if (!selection) return null;

  const dims = getTerminalOverlayDims(terminalId);
  if (!dims || dims.cols === 0 || dims.rows === 0) return null;

  const cellWidth = dims.elementWidth / dims.cols;
  const cellHeight = dims.elementHeight / dims.rows;
  const rects = computeRects(selection, dims.cols, dims.viewportY, dims.rows, cellWidth, cellHeight);

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 10,
  };

  // Use the xterm-terminal's selection color from CSS vars set on <body>.
  const bg = getComputedStyle(document.body).getPropertyValue('--vscode-terminal-selectionBackground').trim()
    || 'rgba(100, 149, 237, 0.4)';

  return (
    <div style={style} aria-hidden="true">
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            background: bg,
          }}
        />
      ))}
    </div>
  );
}

// Exported for unit tests.
export const __testing = { normalize, computeRects };
