import { describe, expect, it } from 'vitest';
import { getBundledThemes, resolveThemeVars, type DormouseTheme } from '../../lib/themes';
import { getThemeSwatchColors } from './ThemeSwatch';

/** The swatch reads a theme the way `applyTheme` paints it. */
const swatchColors = (theme: DormouseTheme) => getThemeSwatchColors(resolveThemeVars(theme));

describe('theme swatch palette', () => {
  it('shows Quiet Light’s green headers as well as its purple focus accent', () => {
    const theme = getBundledThemes().find((theme) => theme.label === 'Quiet Light')!;
    expect(swatchColors(theme)).toEqual({
      active: '#c4d9b1',
      focus: '#9769dc',
    });
  });

  it('matches flattened header fills and uses the runtime fallback when focusBorder is gray', () => {
    const theme: DormouseTheme = {
      ...getBundledThemes()[0],
      type: 'light',
      vars: {
        '--vscode-sideBar-background': '#ffffff',
        '--vscode-list-activeSelectionBackground': '#00ff0080',
        '--vscode-list-inactiveSelectionBackground': '#0000ff80',
        '--vscode-focusBorder': '#333333',
      },
    };
    const original = { ...theme.vars };
    expect(swatchColors(theme)).toEqual({
      active: '#7fff7f',
      focus: '#7fff7f',
    });
    expect(theme.vars).toEqual(original);
  });

  it('composites a translucent focus accent over app chrome, not the terminal row', () => {
    const theme: DormouseTheme = {
      ...getBundledThemes()[0],
      vars: {
        '--vscode-sideBar-background': '#ffffff',
        '--vscode-terminal-background': '#000000',
        '--vscode-focusBorder': '#ff000080',
      },
    };
    expect(swatchColors(theme).focus).toBe('#ff7f7f');
  });

  it('resolves missing tokens by candidate polarity without using legacy preview metadata', () => {
    const base = { ...getBundledThemes()[0], vars: {}, swatch: '#123456', accent: '#654321' };
    const dark = swatchColors({ ...base, type: 'dark' });
    const light = swatchColors({ ...base, type: 'light' });
    expect(dark.active).not.toBe(light.active);
    for (const color of [...Object.values(dark), ...Object.values(light)]) {
      expect(color).toMatch(/^#/);
      expect(color).not.toBe(base.swatch);
      expect(color).not.toBe(base.accent);
    }
  });
});
