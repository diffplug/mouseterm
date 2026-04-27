import { describe, expect, it } from 'vitest';
import { pickDynamicPalette, type Rgb } from './dynamic-palette';

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
  headerActiveFg: '#ffffff',
  focusBorder: '#ff0000',
};

describe('pickDynamicPalette', () => {
  it('chooses the door pair with the stronger OKLab distance from app background', () => {
    const picks = pickDynamicPalette(baseValues, hexToRgb);

    expect(picks.door?.bgVar).toBe('--color-terminal-bg');
    expect(picks.door?.fgVar).toBe('--color-terminal-fg');
  });

  it('prefers a chromatic active header background for the focus ring', () => {
    const picks = pickDynamicPalette(baseValues, hexToRgb);

    expect(picks.focusRing?.sourceVar).toBe('--color-header-active-bg');
  });

  it('falls through to the most saturated chromatic non-background focus candidate', () => {
    const picks = pickDynamicPalette({
      ...baseValues,
      headerActiveBg: '#333333',
      headerActiveFg: '#777777',
      focusBorder: '#0090f1',
    }, hexToRgb);

    expect(picks.focusRing?.sourceVar).toBe('--vscode-focusBorder');
  });
});
