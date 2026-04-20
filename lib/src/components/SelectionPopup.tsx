import { useLayoutEffect, useState, useEffect, useSyncExternalStore, type CSSProperties } from 'react';
import {
  DEFAULT_MOUSE_SELECTION_STATE,
  getMouseSelectionSnapshot,
  getRenderTick,
  setSelection,
  subscribeToMouseSelection,
  subscribeToRenderTick,
} from '../lib/mouse-selection';
import { copyRaw, copyRewrapped } from '../lib/clipboard';
import { IS_MAC } from '../lib/platform';
import { getTerminalOverlayDims } from '../lib/terminal-registry';

interface Props {
  terminalId: string;
}

/**
 * Popup shown after a selection is finalized (mouse-up). Offers Copy Raw
 * and Copy Rewrapped. Dismissed on Esc, click-outside, or a successful copy.
 */
export function SelectionPopup({ terminalId }: Props) {
  const states = useSyncExternalStore(subscribeToMouseSelection, getMouseSelectionSnapshot);
  useSyncExternalStore(subscribeToRenderTick, getRenderTick);

  const state = states.get(terminalId) ?? DEFAULT_MOUSE_SELECTION_STATE;
  const selection = state.selection;
  const shouldRender = !!selection && !selection.dragging;

  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!shouldRender || !selection) {
      setAnchor(null);
      return;
    }
    const dims = getTerminalOverlayDims(terminalId);
    if (!dims || dims.cols === 0 || dims.rows === 0) return;
    // Use the measured cell grid so the anchor aligns with the border
    // outline (the overlay pulls from the same dims).
    const { cellWidth, cellHeight, gridLeft, gridTop } = dims;
    const endViewportRow = selection.endRow - dims.viewportY;
    const endRow = Math.max(0, Math.min(dims.rows - 1, endViewportRow));
    // Place the popup outside the selection on the side opposite the drag
    // direction. When the preferred side would clip the viewport, clamp to
    // the viewport edge on the SAME side — never flip, because that puts
    // the popup inside the selection and causes it to bounce with mouse
    // jitter at the edge.
    const POPUP_EST_HEIGHT = 32;
    const draggedDown = selection.endRow >= selection.startRow;
    // Leave one full cell of gap between the selection and the popup so
    // the line adjacent to the selection stays visible. Matches the
    // visual weight of the above-side where the popup's own height
    // naturally extends it away from the selection.
    const top = draggedDown
      ? Math.min(
          gridTop + (endRow + 2) * cellHeight + 4,
          dims.elementHeight - POPUP_EST_HEIGHT - 4,
        )
      : Math.max(
          gridTop + endRow * cellHeight - POPUP_EST_HEIGHT - 4,
          4,
        );
    setAnchor({
      left: Math.min(dims.elementWidth - 300, Math.max(0, gridLeft + selection.endCol * cellWidth)),
      top,
    });
  }, [terminalId, shouldRender, selection]);

  useEffect(() => {
    if (!shouldRender) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        setSelection(terminalId, null);
      }
    };
    const onMouseDown = (ev: MouseEvent) => {
      // Click anywhere outside the popup → dismiss. The overlay itself and
      // the terminal body both qualify. A new mousedown inside the terminal
      // will also begin a new drag (handled in terminal-registry), which
      // also replaces the selection.
      const target = ev.target as HTMLElement | null;
      if (!target?.closest(`[data-selection-popup-for="${terminalId}"]`)) {
        setSelection(terminalId, null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onMouseDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [shouldRender, terminalId]);

  if (!shouldRender || !anchor) return null;

  const copyShortcut = IS_MAC ? 'Cmd+C' : 'Ctrl+C';
  const rewrapShortcut = IS_MAC ? 'Cmd+Shift+C' : 'Ctrl+Shift+C';

  const style: CSSProperties = {
    position: 'absolute',
    left: anchor.left,
    top: anchor.top,
    zIndex: 20,
  };

  const onCopy = async (rewrapped: boolean) => {
    if (rewrapped) {
      await copyRewrapped(terminalId);
    } else {
      await copyRaw(terminalId);
    }
    setSelection(terminalId, null);
  };

  return (
    <div
      data-selection-popup-for={terminalId}
      style={style}
      className="flex items-stretch overflow-hidden rounded border border-border bg-surface-raised text-xs text-foreground shadow-md"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="m-0 px-1.5 py-0.5 hover:bg-foreground/10"
        onClick={() => onCopy(false)}
      >
        <span className="text-muted">[{copyShortcut}]</span> Copy Raw
      </button>
      <button
        type="button"
        className="m-0 px-1.5 py-0.5 hover:bg-foreground/10"
        onClick={() => onCopy(true)}
      >
        <span className="text-muted">[{rewrapShortcut}]</span> Copy Rewrapped
      </button>
    </div>
  );
}
