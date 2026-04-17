import { describe, it, expect } from 'vitest';
import { convertVscodeThemeColors, uiThemeToType, CONSUMED_VSCODE_KEYS } from './convert';

describe('convertVscodeThemeColors', () => {
  it('converts consumed keys to --vscode-* CSS variables', () => {
    const result = convertVscodeThemeColors({
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'terminal.ansiRed': '#ff5555',
    });
    expect(result).toEqual({
      '--vscode-editor-background': '#282a36',
      '--vscode-editor-foreground': '#f8f8f2',
      '--vscode-terminal-ansiRed': '#ff5555',
    });
  });

  it('drops keys not in CONSUMED_VSCODE_KEYS', () => {
    const result = convertVscodeThemeColors({
      'editor.background': '#282a36',
      'activityBar.background': '#21222c', // not consumed
      'statusBar.background': '#191a21', // not consumed
    });
    expect(result).toEqual({
      '--vscode-editor-background': '#282a36',
    });
  });

  it('returns empty object for empty input', () => {
    expect(convertVscodeThemeColors({})).toEqual({});
  });

  it('handles all consumed keys without error', () => {
    const colors: Record<string, string> = {};
    for (const key of CONSUMED_VSCODE_KEYS) {
      colors[key] = '#000000';
    }
    const result = convertVscodeThemeColors(colors);
    expect(Object.keys(result)).toHaveLength(CONSUMED_VSCODE_KEYS.length);
  });

  it('preserves camelCase in key conversion', () => {
    const result = convertVscodeThemeColors({
      'editorGroupHeader.tabsBackground': '#252526',
      'terminal.ansiBrightMagenta': '#d670d6',
    });
    expect(result).toEqual({
      '--vscode-editorGroupHeader-tabsBackground': '#252526',
      '--vscode-terminal-ansiBrightMagenta': '#d670d6',
    });
  });
});

describe('uiThemeToType', () => {
  it('maps vs to light', () => {
    expect(uiThemeToType('vs')).toBe('light');
  });

  it('maps hc-light to light', () => {
    expect(uiThemeToType('hc-light')).toBe('light');
  });

  it('maps vs-dark to dark', () => {
    expect(uiThemeToType('vs-dark')).toBe('dark');
  });

  it('maps hc-black to dark', () => {
    expect(uiThemeToType('hc-black')).toBe('dark');
  });

  it('defaults unknown values to dark', () => {
    expect(uiThemeToType('something-else')).toBe('dark');
  });
});
