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

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
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

  // Mid-drag hint. Positioned above the drag-end cell, clamped to the
  // overlay bounds. Shown only while the user is dragging (spec §3.3).
  let hint: { left: number; top: number } | null = null;
  if (selection.dragging) {
    const endViewportRow = selection.endRow - dims.viewportY;
    if (endViewportRow >= 0 && endViewportRow < dims.rows) {
      hint = {
        left: Math.min(dims.elementWidth - 180, Math.max(4, selection.endCol * cellWidth)),
        top: Math.max(4, endViewportRow * cellHeight - 24),
      };
    }
  }

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
      {hint && (
        <div
          className="pointer-events-none absolute rounded border border-border bg-surface-raised px-1.5 py-0.5 text-xs text-muted shadow-sm"
          style={{ left: hint.left, top: hint.top }}
        >
          <div>Hold Alt for block selection</div>
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
export const __testing = { computeRects };
