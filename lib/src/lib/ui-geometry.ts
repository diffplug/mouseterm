import type { CSSProperties } from 'react';

/** Even-odd cross-product test for a convex polygon. Vertices may run in either winding order. */
export function pointInConvexPolygon(
  x: number,
  y: number,
  vertices: Array<{ x: number; y: number }>,
): boolean {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = cross > 0 ? 1 : -1;
    else if ((cross > 0 ? 1 : -1) !== sign) return false;
  }
  return true;
}

/** True if the user has requested reduced motion (or we're in SSR). */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Clamp a fixed-position overlay so it stays inside the viewport with a margin. */
export function clampOverlayPosition({ left, top, width, height }: {
  left: number;
  top: number;
  width: number;
  height: number;
}): CSSProperties {
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);

  return {
    position: 'fixed',
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}
