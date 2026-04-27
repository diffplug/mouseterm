// Pure (DOM-free) selection algorithms behind useDynamicPalette.
// The hook collects candidate colors from getComputedStyle, then defers the
// actual ranking to these functions so they can be unit-tested with synthetic
// palettes — Solarized-style mildly-saturated app-bg, fully greyscale themes,
// HC themes with no focusBorder, etc.

import { chromaOklab, deltaEOklab, rgbOf, rgbToOklab } from './color-contrast';

type Lab = [number, number, number];

export interface FocusRingCandidate {
  varName: string;
  lab: Lab;
  /** True for the always-first-choice candidate (header-active-bg), so a
   *  clearly chromatic accent wins even when other candidates score higher
   *  by chroma or ΔE. */
  preferred?: boolean;
}

/** Below this OKLab chroma value a color reads as essentially grey. Picked
 *  empirically: vivid sRGB primaries land at ~0.20+, subtle accents at ~0.10,
 *  near-greys below ~0.03. 0.05 lets clear accents win without false positives
 *  on warm-but-flat backgrounds. */
export const FOCUS_RING_SATURATION_FLOOR = 0.05;

/** Pick the focus-ring candidate. Order:
 *   1. preferred (header-active-bg) if it clears the saturation floor —
 *      keeps brand color even when app-bg itself is mildly chromatic
 *      (Solarized).
 *   2. else most-saturated non-preferred candidate clearing the floor.
 *   3. else max-ΔE candidate against app-bg (greyscale fallback).
 *   4. null when no candidates supplied.
 */
export function pickFocusRing(candidates: readonly FocusRingCandidate[], appLab: Lab): FocusRingCandidate | null {
  if (candidates.length === 0) return null;

  const preferred = candidates.find((c) => c.preferred);
  if (preferred && chromaOklab(preferred.lab) >= FOCUS_RING_SATURATION_FLOOR) return preferred;

  let bestSaturated: FocusRingCandidate | null = null;
  let bestChroma = -Infinity;
  for (const c of candidates) {
    if (c.preferred) continue;
    const cc = chromaOklab(c.lab);
    if (cc >= FOCUS_RING_SATURATION_FLOOR && cc > bestChroma) {
      bestSaturated = c;
      bestChroma = cc;
    }
  }
  if (bestSaturated) return bestSaturated;

  let bestDist: FocusRingCandidate | null = null;
  let maxDist = -Infinity;
  for (const c of candidates) {
    const d = deltaEOklab(c.lab, appLab);
    if (d > maxDist) {
      bestDist = c;
      maxDist = d;
    }
  }
  return bestDist;
}

export interface DoorChoice {
  bg: '--color-header-inactive-bg' | '--color-terminal-bg';
  fg: '--color-header-inactive-fg' | '--color-terminal-fg';
}

/** Pick door bg/fg by max ΔE OKLab against app-bg. Tie goes to the panel
 *  (header-inactive) so doors visually anchor to the chrome rather than the
 *  terminal body. */
export function pickDoorPair(panelLab: Lab, terminalLab: Lab, appLab: Lab): DoorChoice {
  const panelDist = deltaEOklab(panelLab, appLab);
  const termDist = deltaEOklab(terminalLab, appLab);
  return panelDist >= termDist
    ? { bg: '--color-header-inactive-bg', fg: '--color-header-inactive-fg' }
    : { bg: '--color-terminal-bg', fg: '--color-terminal-fg' };
}

export interface DynamicPaletteVars {
  '--color-door-bg'?: string;
  '--color-door-fg'?: string;
  '--color-focus-ring'?: string;
}

export function computeDynamicPalette(
  styles: Pick<CSSStyleDeclaration, 'getPropertyValue'>,
  ctx: CanvasRenderingContext2D,
): DynamicPaletteVars {
  const labOf = (varName: string): Lab | null => {
    const rgb = rgbOf(styles.getPropertyValue(varName).trim(), ctx);
    return rgb ? rgbToOklab(rgb) : null;
  };

  const result: DynamicPaletteVars = {};
  const oApp = labOf('--color-app-bg');
  if (!oApp) return result;

  const panelLab = labOf('--color-header-inactive-bg');
  const termLab = labOf('--color-terminal-bg');
  if (panelLab && termLab) {
    const choice = pickDoorPair(panelLab, termLab, oApp);
    result['--color-door-bg'] = `var(${choice.bg})`;
    result['--color-door-fg'] = `var(${choice.fg})`;
  }

  const candidates: FocusRingCandidate[] = [];
  const headerActiveBg = labOf('--color-header-active-bg');
  if (headerActiveBg) candidates.push({ varName: '--color-header-active-bg', lab: headerActiveBg, preferred: true });
  const headerActiveFg = labOf('--color-header-active-fg');
  if (headerActiveFg) candidates.push({ varName: '--color-header-active-fg', lab: headerActiveFg });
  const focusBorder = labOf('--vscode-focusBorder');
  if (focusBorder) candidates.push({ varName: '--vscode-focusBorder', lab: focusBorder });

  const pick = pickFocusRing(candidates, oApp);
  if (pick) result['--color-focus-ring'] = `var(${pick.varName})`;

  return result;
}
