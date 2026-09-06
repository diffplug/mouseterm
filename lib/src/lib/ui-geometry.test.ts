/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { clampOverlayPosition, OVERLAY_VIEWPORT_MARGIN_PX } from './ui-geometry';

describe('clampOverlayPosition', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');

  function setViewport(width: number, height: number): void {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
  }

  function setVisualViewport(
    width: number,
    height: number,
    offsetLeft = 0,
    offsetTop = 0,
  ): void {
    Object.defineProperty(window, 'visualViewport', {
      value: { width, height, offsetLeft, offsetTop },
      configurable: true,
    });
  }

  afterEach(() => {
    setViewport(originalWidth, originalHeight);
    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewport);
    } else {
      delete (window as unknown as { visualViewport?: VisualViewport }).visualViewport;
    }
  });

  it('leaves a position that already fits', () => {
    setViewport(1000, 800);
    expect(clampOverlayPosition({ left: 100, top: 200, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 100, top: 200 });
  });

  it('pulls an overflowing overlay back inside the margin', () => {
    setViewport(1000, 800);
    const m = OVERLAY_VIEWPORT_MARGIN_PX;
    expect(clampOverlayPosition({ left: 900, top: 780, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 1000 - 300 - m, top: 800 - 150 - m });
  });

  it('clamps vertically to the visual viewport when the layout viewport stays tall', () => {
    setViewport(1000, 800);
    setVisualViewport(1000, 400);
    const m = OVERLAY_VIEWPORT_MARGIN_PX;
    expect(clampOverlayPosition({ left: 900, top: 780, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 1000 - 300 - m, top: 400 - 150 - m });
  });

  it('clamps inside an offset visual viewport on both axes', () => {
    setViewport(1000, 800);
    setVisualViewport(600, 400, 200, 400);
    const m = OVERLAY_VIEWPORT_MARGIN_PX;

    expect(clampOverlayPosition({ left: 250, top: 450, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 250, top: 450 });
    expect(clampOverlayPosition({ left: 0, top: 0, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 200 + m, top: 400 + m });
    expect(clampOverlayPosition({ left: 900, top: 780, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: 200 + 600 - 300 - m, top: 400 + 400 - 150 - m });
  });

  it('pushes a position above the margin back down to it', () => {
    setViewport(1000, 800);
    expect(clampOverlayPosition({ left: -50, top: 0, width: 300, height: 150 }))
      .toEqual({ position: 'fixed', left: OVERLAY_VIEWPORT_MARGIN_PX, top: OVERLAY_VIEWPORT_MARGIN_PX });
  });

  it('pins an overlay larger than the viewport to the top-left margin', () => {
    // `maxLeft`/`maxTop` floor at the margin, so an oversized overlay stays
    // anchored where its content starts rather than being pushed off-screen
    // by a negative bound.
    setViewport(200, 200);
    expect(clampOverlayPosition({ left: 100, top: 100, width: 400, height: 400 }))
      .toEqual({ position: 'fixed', left: OVERLAY_VIEWPORT_MARGIN_PX, top: OVERLAY_VIEWPORT_MARGIN_PX });
  });
});
