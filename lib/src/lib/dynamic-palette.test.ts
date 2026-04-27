import { describe, expect, it } from 'vitest';
import { rgbToOklab } from './color-contrast';
import {
  FOCUS_RING_SATURATION_FLOOR,
  pickDoorPair,
  pickFocusRing,
  type FocusRingCandidate,
} from './dynamic-palette';

const lab = (r: number, g: number, b: number) => rgbToOklab([r, g, b]);

const APP_DARK = lab(30, 30, 30);
const APP_LIGHT = lab(240, 240, 240);
// #fdf6e3 — Solarized Light app-bg, intentionally warm but not saturated.
const APP_SOLARIZED = lab(0xfd, 0xf6, 0xe3);

describe('pickDoorPair', () => {
  it('picks the panel when panel has more contrast against app-bg than terminal', () => {
    const panel = lab(200, 200, 200); // far from dark app-bg
    const terminal = lab(40, 40, 40); // close to dark app-bg
    const choice = pickDoorPair(panel, terminal, APP_DARK);
    expect(choice.bg).toBe('--color-header-inactive-bg');
    expect(choice.fg).toBe('--color-header-inactive-fg');
  });

  it('picks the terminal when terminal has more contrast', () => {
    const panel = lab(40, 40, 40);
    const terminal = lab(200, 200, 200);
    const choice = pickDoorPair(panel, terminal, APP_DARK);
    expect(choice.bg).toBe('--color-terminal-bg');
    expect(choice.fg).toBe('--color-terminal-fg');
  });

  it('breaks ties by preferring the panel — doors anchor to chrome', () => {
    const same = lab(120, 120, 120);
    const choice = pickDoorPair(same, same, APP_DARK);
    expect(choice.bg).toBe('--color-header-inactive-bg');
  });
});

describe('pickFocusRing', () => {
  it('returns null with an empty candidate list', () => {
    expect(pickFocusRing([], APP_DARK)).toBeNull();
  });

  it('picks preferred when it clears the saturation floor', () => {
    const preferred: FocusRingCandidate = {
      varName: '--color-header-active-bg',
      lab: lab(0x09, 0x47, 0x71), // VSCode dark list.activeSelectionBackground
      preferred: true,
    };
    const grey: FocusRingCandidate = { varName: '--color-header-active-fg', lab: lab(255, 255, 255) };
    const pick = pickFocusRing([preferred, grey], APP_DARK);
    expect(pick?.varName).toBe('--color-header-active-bg');
  });

  it('falls through preferred when it is below the saturation floor', () => {
    const flatPreferred: FocusRingCandidate = {
      varName: '--color-header-active-bg',
      lab: lab(60, 60, 60), // grey
      preferred: true,
    };
    const accent: FocusRingCandidate = { varName: '--vscode-focusBorder', lab: lab(0, 127, 212) }; // saturated blue
    const pick = pickFocusRing([flatPreferred, accent], APP_DARK);
    expect(pick?.varName).toBe('--vscode-focusBorder');
  });

  it('Solarized: preferred (chromatic) wins even though app-bg itself is warm', () => {
    // Solarized Light's list.activeSelectionBackground is a saturated blue;
    // app-bg is warm cream. Without the absolute-chroma rule, max-ΔE math
    // would pull the focus ring toward whatever else is on the candidate list.
    const preferred: FocusRingCandidate = {
      varName: '--color-header-active-bg',
      lab: lab(0x26, 0x8b, 0xd2), // solarized blue
      preferred: true,
    };
    const muted: FocusRingCandidate = { varName: '--color-header-active-fg', lab: lab(0x58, 0x6e, 0x75) };
    const focusBorder: FocusRingCandidate = { varName: '--vscode-focusBorder', lab: lab(0, 0x90, 0xf1) };
    const pick = pickFocusRing([preferred, muted, focusBorder], APP_SOLARIZED);
    expect(pick?.varName).toBe('--color-header-active-bg');
  });

  it('greyscale theme: falls through chroma rules to max-ΔE candidate', () => {
    // All candidates and app-bg are flat grey — neither preferred nor any
    // alternative clears the floor. The third rule must pick whichever
    // candidate is farthest from app-bg in OKLab.
    const candidates: FocusRingCandidate[] = [
      { varName: '--color-header-active-bg', lab: lab(220, 220, 220), preferred: true },
      { varName: '--color-header-active-fg', lab: lab(40, 40, 40) },
      { varName: '--vscode-focusBorder', lab: lab(120, 120, 120) },
    ];
    const pick = pickFocusRing(candidates, APP_LIGHT);
    expect(pick?.varName).toBe('--color-header-active-fg');
  });

  it('picks the most-saturated alternative when preferred is below floor', () => {
    const flatPreferred: FocusRingCandidate = {
      varName: '--color-header-active-bg',
      lab: lab(80, 80, 80),
      preferred: true,
    };
    const subtle: FocusRingCandidate = { varName: '--color-header-active-fg', lab: lab(0xa0, 0x80, 0x40) }; // mildly chromatic
    const vivid: FocusRingCandidate = { varName: '--vscode-focusBorder', lab: lab(0xff, 0x40, 0x40) }; // strongly chromatic
    const pick = pickFocusRing([flatPreferred, subtle, vivid], APP_DARK);
    expect(pick?.varName).toBe('--vscode-focusBorder');
  });

  it('exposes the saturation floor as a constant for visibility', () => {
    // Explicit assertion so a future tweak doesn't silently change palette
    // behavior — pair this with a deliberate test update if the floor moves.
    expect(FOCUS_RING_SATURATION_FLOOR).toBe(0.05);
  });
});
