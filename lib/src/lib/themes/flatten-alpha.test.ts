import { describe, expect, it } from 'vitest';
import { flattenAlpha, flattenSelectionAlpha } from './flatten-alpha';

describe('flattenAlpha', () => {
  it('returns the value unchanged when fully opaque', () => {
    expect(flattenAlpha('#0096f5', '#0e4956')).toBe('#0096f5');
    expect(flattenAlpha('#0096f5ff', '#0e4956')).toBe('#0096f5ff');
  });

  it('composites Selenized Dark selection (#0096f588) over its sidebar (#0e4956)', () => {
    // 0x88 / 255 = 0.5333…
    // r: 0x00*0.5333 + 0x0e*0.4667 ≈ 6.5  → 0x07
    // g: 0x96*0.5333 + 0x49*0.4667 ≈ 114.0 → 0x72
    // b: 0xf5*0.5333 + 0x56*0.4667 ≈ 170.7 → 0xab
    expect(flattenAlpha('#0096f588', '#0e4956')).toBe('#0772ab');
  });

  it('handles 4-digit hex with alpha (short-hand expands per channel)', () => {
    // #08f8 → rgba(0, 0x88=136, 255, 0x88/255=0.533); over white → #77c0ff
    expect(flattenAlpha('#08f8', '#ffffff')).toBe('#77c0ff');
  });

  it('handles rgba() function syntax', () => {
    expect(flattenAlpha('rgba(0, 0, 0, 0.5)', '#ffffff')).toBe('#808080');
  });

  it('falls back to the input when the base is unparseable', () => {
    expect(flattenAlpha('#0096f588', 'oklab(0.5 0 0)')).toBe('#0096f588');
  });
});

describe('flattenSelectionAlpha', () => {
  it('flattens active and inactive selection backgrounds in place', () => {
    const vars: Record<string, string> = {
      '--vscode-sideBar-background': '#0e4956',
      '--vscode-list-activeSelectionBackground': '#0096f588',
      '--vscode-list-inactiveSelectionBackground': '#275b69',
      '--vscode-editor-background': '#053d48',
    };
    flattenSelectionAlpha(vars);
    expect(vars['--vscode-list-activeSelectionBackground']).toBe('#0772ab');
    expect(vars['--vscode-list-inactiveSelectionBackground']).toBe('#275b69');
    expect(vars['--vscode-editor-background']).toBe('#053d48');
  });

  it('is a no-op when sideBar background is missing', () => {
    const vars: Record<string, string> = {
      '--vscode-list-activeSelectionBackground': '#0096f588',
    };
    flattenSelectionAlpha(vars);
    expect(vars['--vscode-list-activeSelectionBackground']).toBe('#0096f588');
  });
});
