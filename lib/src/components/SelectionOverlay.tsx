import { useSyncExternalStore, type CSSProperties } from 'react';
import {
  DEFAULT_MOUSE_SELECTION_STATE,
  getMouseSelectionSnapshot,
  getRenderTick,
  subscribeToMouseSelection,
  subscribeToRenderTick,
  type Selection,
} from '../lib/mouse-selection';
import { normalizeSelection } from '../lib/selection-text';
import { getTerminalOverlayDims } from '../lib/terminal-registry';
import { IS_MAC } from '../lib/platform';

interface Rect {
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
function rectsToPath(rects: Rect[]): string {
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

function computeRects(
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

  // cellWidth / cellHeight come from measuring xterm's `.xterm-screen`, and
  // gridLeft / gridTop are its offset within the element. Using these
  // instead of elementWidth/cols keeps the highlight aligned even when xterm
  // adds a few pixels of padding around the cell grid.
  const { cellWidth, cellHeight, gridLeft, gridTop } = dims;
  const rects = computeRects(selection, dims.cols, dims.viewportY, dims.rows, cellWidth, cellHeight);

  const style: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 10,
  };

  // Border-only highlight. Pick a color with reliable contrast across themes:
  // prefer focusBorder (typically fully opaque accent), fall back to the
  // terminal foreground, then selectionBackground, then a hard-coded cornflower.
  const styles = getComputedStyle(document.body);
  const borderColor =
    styles.getPropertyValue('--vscode-focusBorder').trim()
    || styles.getPropertyValue('--vscode-terminal-foreground').trim()
    || styles.getPropertyValue('--vscode-terminal-selectionBackground').trim()
    || 'rgb(100, 149, 237)';
  const pathD = rectsToPath(rects);

  // Mid-drag hint. Placed outside the selection on the side opposite the
  // drag direction: below when the user drags down, above when they drag up.
  // When the preferred side would clip the viewport, clamp to the viewport
  // edge on the SAME side — never flip sides, because that puts the hint
  // inside the selection and causes it to bounce as the mouse jitters near
  // the edge. Shown only while the user is dragging (spec §3.3).
  const HINT_EST_HEIGHT = 44;
  let hint: { left: number; top: number } | null = null;
  if (selection.dragging) {
    const endViewportRow = selection.endRow - dims.viewportY;
    if (endViewportRow >= 0 && endViewportRow < dims.rows) {
      const draggedDown = selection.endRow >= selection.startRow;
      // Leave one full cell of gap between the selection and the hint so
      // the next-to-be-selected line stays visible on both sides. The
      // drag-up side already feels like "2 lines above" because the
      // hint's own height (~44px) extends it away from the selection;
      // matching that on the drag-down side means skipping one extra row.
      const top = draggedDown
        ? Math.min(
            gridTop + (endViewportRow + 2) * cellHeight + 4,
            dims.elementHeight - HINT_EST_HEIGHT - 4,
          )
        : Math.max(
            gridTop + endViewportRow * cellHeight - HINT_EST_HEIGHT - 4,
            4,
          );
      hint = {
        left: Math.min(dims.elementWidth - 180, Math.max(4, gridLeft + selection.endCol * cellWidth)),
        top,
      };
    }
  }

  return (
    <div style={style} aria-hidden="true">
      {pathD && (
        <svg
          width={dims.elementWidth}
          height={dims.elementHeight}
          style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
        >
          <g transform={`translate(${gridLeft} ${gridTop})`}>
            <path
              d={pathD}
              fill="none"
              stroke={borderColor}
              strokeWidth={1.5}
              strokeLinejoin="miter"
            />
          </g>
        </svg>
      )}
      {hint && (
        <div
          className="pointer-events-none absolute rounded border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-muted shadow-sm"
          style={{ left: hint.left, top: hint.top }}
        >
          <div>Hold {IS_MAC ? 'Opt' : 'Alt'} for block selection</div>
          {state.hintToken && (
            <div>
              Press <span className="text-foreground">e</span> to select the full{' '}
              {state.hintToken.kind === 'url' ? 'URL' : 'path'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Exported for unit tests.
export const __testing = { computeRects, rectsToPath };
