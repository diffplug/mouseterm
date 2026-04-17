import { describe, expect, it } from 'vitest';
import { __testing } from './SelectionOverlay';
import type { Selection } from '../lib/mouse-selection';

const { normalize, computeRects } = __testing;

function sel(overrides: Partial<Selection>): Selection {
  return {
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
    shape: 'linewise',
    dragging: false,
    startedInScrollback: false,
    ...overrides,
  };
}

describe('normalize', () => {
  it('forward linewise selection passes through', () => {
    const n = normalize(sel({ startRow: 2, startCol: 3, endRow: 5, endCol: 8 }));
    expect(n).toEqual({ r0: 2, c0: 3, r1: 5, c1: 8, shape: 'linewise' });
  });

  it('reversed linewise selection swaps start/end', () => {
    const n = normalize(sel({ startRow: 5, startCol: 8, endRow: 2, endCol: 3 }));
    expect(n).toEqual({ r0: 2, c0: 3, r1: 5, c1: 8, shape: 'linewise' });
  });

  it('block selection normalizes min/max independently', () => {
    const n = normalize(sel({
      startRow: 5, startCol: 8, endRow: 2, endCol: 3, shape: 'block',
    }));
    expect(n).toEqual({ r0: 2, c0: 3, r1: 5, c1: 8, shape: 'block' });
  });
});

describe('computeRects: linewise', () => {
  const cellWidth = 10;
  const cellHeight = 20;

  it('single-row selection → one rect', () => {
    const rects = computeRects(
      sel({ startRow: 0, startCol: 5, endRow: 0, endCol: 15 }),
      80, 0, 24, cellWidth, cellHeight,
    );
    expect(rects).toEqual([{ top: 0, left: 50, width: 100, height: 20 }]);
  });

  it('multi-row linewise: first row trimmed, middle rows full, last row trimmed', () => {
    const rects = computeRects(
      sel({ startRow: 0, startCol: 5, endRow: 2, endCol: 10 }),
      80, 0, 24, cellWidth, cellHeight,
    );
    expect(rects).toHaveLength(3);
    expect(rects[0]).toEqual({ top: 0, left: 50, width: (80 - 5) * 10, height: 20 });
    expect(rects[1]).toEqual({ top: 20, left: 0, width: 800, height: 20 });
    expect(rects[2]).toEqual({ top: 40, left: 0, width: 100, height: 20 });
  });

  it('scrollback-only selection above viewport → no rects', () => {
    // viewportY=50 means visible rows are 50..73. Selection in rows 10..20
    // is entirely above the viewport.
    const rects = computeRects(
      sel({ startRow: 10, startCol: 0, endRow: 20, endCol: 10 }),
      80, 50, 24, cellWidth, cellHeight,
    );
    expect(rects).toEqual([]);
  });

  it('selection clipped to viewport start', () => {
    // viewportY=10 (rows 10..33). Selection 5..15 → only rows 10..15 visible.
    const rects = computeRects(
      sel({ startRow: 5, startCol: 0, endRow: 15, endCol: 40 }),
      80, 10, 24, cellWidth, cellHeight,
    );
    // First visible row is row 10 — that's a "middle" row (not the original
    // startRow), so full-width.
    expect(rects[0]).toEqual({ top: 0, left: 0, width: 800, height: 20 });
    // Last rect is the original endRow (15) in reading order.
    expect(rects[rects.length - 1]).toEqual({ top: (15 - 10) * 20, left: 0, width: 400, height: 20 });
  });

  it('selection with equal start/end columns renders nothing on that row', () => {
    const rects = computeRects(
      sel({ startRow: 0, startCol: 10, endRow: 0, endCol: 10 }),
      80, 0, 24, cellWidth, cellHeight,
    );
    expect(rects).toEqual([]);
  });
});

describe('computeRects: block', () => {
  const cellWidth = 10;
  const cellHeight = 20;

  it('block selection is a single rect', () => {
    const rects = computeRects(
      sel({ startRow: 0, startCol: 3, endRow: 2, endCol: 8, shape: 'block' }),
      80, 0, 24, cellWidth, cellHeight,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ top: 0, left: 30, width: (8 - 3 + 1) * 10, height: (2 - 0 + 1) * 20 });
  });

  it('block selection clipped to viewport', () => {
    const rects = computeRects(
      sel({ startRow: 5, startCol: 3, endRow: 15, endCol: 8, shape: 'block' }),
      80, 10, 24, cellWidth, cellHeight,
    );
    expect(rects[0].top).toBe(0);
    expect(rects[0].height).toBe((15 - 10 + 1) * 20);
  });

  it('block selection entirely in scrollback → no rect', () => {
    const rects = computeRects(
      sel({ startRow: 0, startCol: 0, endRow: 5, endCol: 5, shape: 'block' }),
      80, 100, 24, cellWidth, cellHeight,
    );
    expect(rects).toEqual([]);
  });
});
