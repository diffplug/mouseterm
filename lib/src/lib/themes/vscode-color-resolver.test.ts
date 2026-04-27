import { describe, expect, it } from 'vitest';
import {
  completeThemeVars,
  reconcileMaterializedVars,
  resolveMissingVscodeThemeVars,
} from './vscode-color-resolver';

class MockStyle {
  private values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(initial)) {
      this.values.set(name, value);
    }
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  removeProperty(name: string): string {
    const value = this.values.get(name) ?? '';
    this.values.delete(name);
    return value;
  }
}

describe('completeThemeVars', () => {
  it('resolves Light-style inactive selection foreground to normal foreground, not active selection foreground', () => {
    const vars = completeThemeVars({
      '--vscode-editor-foreground': '#333333',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'light');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#333333');
  });

  it('uses the resolved editor foreground when editor foreground is absent', () => {
    const vars = completeThemeVars({
      '--vscode-foreground': '#616161',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'light');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#333333');
  });

  it('uses base foreground when the VSCode editor foreground default is null', () => {
    const vars = completeThemeVars({
      '--vscode-foreground': '#292929',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'hcLight');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#292929');
  });

  it('does not overwrite a real theme value', () => {
    const vars = completeThemeVars({
      '--vscode-list-inactiveSelectionForeground': '#123456',
    }, 'light');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#123456');
  });

  it('resolves terminal selection background from editor selection background', () => {
    const vars = completeThemeVars({
      '--vscode-editor-selectionBackground': '#abcdef',
    }, 'dark');

    expect(vars['--vscode-terminal-selectionBackground']).toBe('#abcdef');
  });
});

describe('resolveMissingVscodeThemeVars', () => {
  it('only returns variables that were missing from the host map', () => {
    const missing = resolveMissingVscodeThemeVars({
      '--vscode-list-inactiveSelectionForeground': '#123456',
    }, 'light');

    expect(missing['--vscode-list-inactiveSelectionForeground']).toBeUndefined();
    expect(missing['--vscode-list-activeSelectionBackground']).toBe('#0060C0');
  });
});

describe('reconcileMaterializedVars', () => {
  it('removes stale materialized variables it still owns', () => {
    const style = new MockStyle({
      '--vscode-list-inactiveSelectionForeground': '#333333',
    });
    const previous = new Map([['--vscode-list-inactiveSelectionForeground', '#333333']]);

    const next = reconcileMaterializedVars(style, previous, {});

    expect(next.size).toBe(0);
    expect(style.getPropertyValue('--vscode-list-inactiveSelectionForeground')).toBe('');
  });

  it('does not remove a host value that replaced a materialized variable', () => {
    const style = new MockStyle({
      '--vscode-list-inactiveSelectionForeground': '#444444',
    });
    const previous = new Map([['--vscode-list-inactiveSelectionForeground', '#333333']]);

    const next = reconcileMaterializedVars(style, previous, {});

    expect(next.size).toBe(0);
    expect(style.getPropertyValue('--vscode-list-inactiveSelectionForeground')).toBe('#444444');
  });
});
