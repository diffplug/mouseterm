import { chromaOklab, deltaEOklab, rgbToOklab } from '../color-contrast';
import {
  FOCUS_RING_SATURATION_FLOOR,
  pickDoorPair,
  pickFocusRing,
  type FocusRingCandidate,
} from '../dynamic-palette';

export type Rgb = [number, number, number];
export type ColorToRgb = (color: string) => Rgb | null;

export interface DynamicPaletteValues {
  appBg: string;
  headerInactiveBg: string;
  headerInactiveFg: string;
  terminalBg: string;
  terminalFg: string;
  headerActiveBg: string;
  focusBorder: string;
}

export interface DynamicPaletteCandidate {
  sourceVar: string;
  value: string;
  deltaE: number | null;
  chroma: number | null;
  preferred?: boolean;
}

export interface DynamicDoorPick {
  bgVar: '--color-header-inactive-bg' | '--color-terminal-bg';
  fgVar: '--color-header-inactive-fg' | '--color-terminal-fg';
  bgValue: string;
  fgValue: string;
  reason: string;
  candidates: DynamicPaletteCandidate[];
}

export interface DynamicFocusRingPick {
  sourceVar: '--vscode-focusBorder' | '--color-header-active-bg';
  value: string;
  reason: string;
  candidates: DynamicPaletteCandidate[];
}

export interface DynamicPaletteSnapshot {
  door: DynamicDoorPick | null;
  focusRing: DynamicFocusRingPick | null;
}

type RgbLab = [number, number, number];
type DetailedCandidate = DynamicPaletteCandidate & FocusRingCandidate & { lab: RgbLab };

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function candidate(
  sourceVar: string,
  value: string,
  colorToRgb: ColorToRgb,
  appLab: RgbLab,
  preferred = false,
): DetailedCandidate | null {
  const rgb = colorToRgb(value);
  if (!rgb) return null;
  const lab = rgbToOklab(rgb);
  return {
    sourceVar,
    varName: sourceVar,
    value,
    lab,
    preferred,
    chroma: roundMetric(chromaOklab(lab)),
    deltaE: roundMetric(deltaEOklab(lab, appLab)),
  };
}

function publicCandidates(candidates: DetailedCandidate[]): DynamicPaletteCandidate[] {
  return candidates.map((item) => ({
    sourceVar: item.sourceVar,
    value: item.value,
    deltaE: item.deltaE,
    chroma: item.chroma,
    preferred: item.preferred,
  }));
}

export function pickDynamicPalette(
  values: DynamicPaletteValues,
  colorToRgb: ColorToRgb,
): DynamicPaletteSnapshot {
  const appRgb = colorToRgb(values.appBg);
  if (!appRgb) return { door: null, focusRing: null };

  const appLab = rgbToOklab(appRgb);
  const doorCandidates = [
    candidate('--color-header-inactive-bg', values.headerInactiveBg, colorToRgb, appLab),
    candidate('--color-terminal-bg', values.terminalBg, colorToRgb, appLab),
  ].filter((item): item is DetailedCandidate => item !== null);

  let door: DynamicDoorPick | null = null;
  const inactive = doorCandidates.find((item) => item.sourceVar === '--color-header-inactive-bg');
  const terminal = doorCandidates.find((item) => item.sourceVar === '--color-terminal-bg');
  if (inactive && terminal) {
    const choice = pickDoorPair(inactive.lab, terminal.lab, appLab);
    const useInactive = choice.bg === '--color-header-inactive-bg';
    door = {
      bgVar: choice.bg,
      fgVar: choice.fg,
      bgValue: useInactive ? values.headerInactiveBg : values.terminalBg,
      fgValue: useInactive ? values.headerInactiveFg : values.terminalFg,
      reason: useInactive
        ? 'inactive header background has the larger OKLab distance from app background'
        : 'terminal background has the larger OKLab distance from app background',
      candidates: publicCandidates(doorCandidates),
    };
  }

  const focusCandidates: DetailedCandidate[] = [
    candidate('--vscode-focusBorder', values.focusBorder, colorToRgb, appLab, true),
    candidate('--color-header-active-bg', values.headerActiveBg, colorToRgb, appLab),
  ].filter((item): item is DetailedCandidate => item !== null);

  const focusPick = pickFocusRing(focusCandidates, appLab) as DetailedCandidate | null;
  const focusChroma = focusPick ? chromaOklab(focusPick.lab) : 0;
  const focusReason = !focusPick
    ? ''
    : focusPick.preferred && focusChroma >= FOCUS_RING_SATURATION_FLOOR
      ? 'focusBorder is chromatic, so the ring uses the VS Code focus color'
      : !focusPick.preferred && focusChroma >= FOCUS_RING_SATURATION_FLOOR
        ? 'active header background is the next chromatic focus-ring candidate'
        : 'highest OKLab distance from app background among available candidates';

  const focusRing = focusPick
    ? {
        sourceVar: focusPick.sourceVar as DynamicFocusRingPick['sourceVar'],
        value: focusPick.value,
        reason: focusReason,
        candidates: publicCandidates(focusCandidates),
      }
    : null;

  return { door, focusRing };
}
