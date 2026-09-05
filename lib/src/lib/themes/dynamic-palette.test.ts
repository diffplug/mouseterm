import { describe, expect, it } from 'vitest';
import { computeDynamicPalette, pickAlarmColor, pickDynamicPalette, type Rgb } from './dynamic-palette';

function hexToRgb(color: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const baseValues = {
  appBg: '#ffffff',
  headerInactiveBg: '#eeeeee',
  headerInactiveFg: '#111111',
  terminalBg: '#000000',
  terminalFg: '#f5f5f5',
  headerActiveBg: '#0060c0',
  focusBorder: '#ff0000',
};

describe('computeDynamicPalette', () => {
  it.each([
    { app: '#ffffff', panel: '#eeeeee', terminal: '#000000', stale: '#ffffff', source: '--color-terminal-bg', tint: '#ffffff' },
    { app: '#000000', panel: '#ffffff', terminal: '#111111', stale: '#000000', source: '--color-header-inactive-bg', tint: '#000000' },
  ])('derives the Door alarm tint from its new $source in the first pass', ({ app, panel, terminal, stale, source, tint }) => {
    const vars: Record<string, string> = {
      '--color-app-bg': app,
      '--color-header-inactive-bg': panel,
      '--color-terminal-bg': terminal,
      '--color-door-bg': stale,
    };
    const canvas = {
      fillStyle: '#000000',
      fillRect() {},
      getImageData() { return { data: [...hexToRgb(this.fillStyle)!, 255] }; },
    };
    const palette = computeDynamicPalette(
      { getPropertyValue: (name) => vars[name] ?? '' },
      canvas as unknown as CanvasRenderingContext2D,
    );

    expect(palette['--color-door-bg']).toBe(`var(${source})`);
    expect(palette['--color-alarm-vs-door']).toBe(tint);
  });
});

describe('pickDynamicPalette', () => {
  it('chooses the door pair with the stronger OKLab distance from app background', () => {
    const picks = pickDynamicPalette(baseValues, hexToRgb);

    expect(picks.door?.bgVar).toBe('--color-terminal-bg');
    expect(picks.door?.fgVar).toBe('--color-terminal-fg');
  });

  it('prefers a chromatic focusBorder for the focus ring', () => {
    const picks = pickDynamicPalette(baseValues, hexToRgb);

    expect(picks.focusRing?.sourceVar).toBe('--vscode-focusBorder');
  });

  it('falls through to active header background when focusBorder is flat', () => {
    const picks = pickDynamicPalette({
      ...baseValues,
      headerActiveBg: '#0090f1',
      focusBorder: '#333333',
    }, hexToRgb);

    expect(picks.focusRing?.sourceVar).toBe('--color-header-active-bg');
  });
});

describe('pickAlarmColor', () => {
  it('returns white against a dark background', () => {
    expect(pickAlarmColor([4, 57, 94])).toBe('#ffffff');
    expect(pickAlarmColor([37, 37, 38])).toBe('#ffffff');
  });

  it('returns black against a light background', () => {
    expect(pickAlarmColor([228, 230, 241])).toBe('#000000');
    expect(pickAlarmColor([255, 255, 255])).toBe('#000000');
  });
});
