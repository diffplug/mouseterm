import { describe, expect, it } from 'vitest';
import {
  TERMINAL_BORDER_RADIUS_PX,
  TERMINAL_TOP_RADIUS_CLASS,
  TERMINAL_BOTTOM_RADIUS_CLASS,
  TERMINAL_SELECTION_BORDER_RADIUS,
  DOOR_SELECTION_BORDER_RADIUS,
} from './design';

// The terminal radius is consumed by SVG path math (px), Tailwind classes,
// and inline border-radius styles. They are all derived from one source —
// these checks fail loudly if a future edit decouples them.
describe('terminal radius constants', () => {
  it('px and rem agree (1rem = 16px)', () => {
    const remFromString = parseFloat(TERMINAL_SELECTION_BORDER_RADIUS);
    expect(TERMINAL_BORDER_RADIUS_PX).toBe(remFromString * 16);
  });

  it('top/bottom Tailwind classes use the same radius step', () => {
    const topStep = TERMINAL_TOP_RADIUS_CLASS.replace('rounded-t-', '');
    const bottomStep = TERMINAL_BOTTOM_RADIUS_CLASS.replace('rounded-b-', '');
    expect(topStep).toBe(bottomStep);
  });

  it('door selection radius rounds top corners only', () => {
    expect(DOOR_SELECTION_BORDER_RADIUS).toBe(`${TERMINAL_SELECTION_BORDER_RADIUS} ${TERMINAL_SELECTION_BORDER_RADIUS} 0 0`);
  });
});
