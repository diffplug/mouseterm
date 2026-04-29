import { describe, expect, it } from 'vitest';
import {
  completeThemeVars,
  reconcileMaterializedVars,
  resolveMissingVscodeThemeVars,
  traceThemeVars,
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
  it('resolves Light-style inactive selection foreground to workbench foreground, not active selection foreground', () => {
    const vars = completeThemeVars({
      '--vscode-foreground': '#616161',
      '--vscode-editor-foreground': '#333333',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'light');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#616161');
  });

  it('uses side bar foreground before base foreground when it is defined', () => {
    const vars = completeThemeVars({
      '--vscode-foreground': '#616161',
      '--vscode-sideBar-foreground': '#444444',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'light');

    expect(vars['--vscode-list-inactiveSelectionForeground']).toBe('#444444');
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

describe('traceThemeVars', () => {
  it('reports provided theme values without changing the resolved value', () => {
    const trace = traceThemeVars({
      '--vscode-list-inactiveSelectionForeground': '#123456',
    }, 'light').traces.find((item) => item.name === '--vscode-list-inactiveSelectionForeground');

    expect(trace).toMatchObject({
      providedValue: '#123456',
      resolvedValue: '#123456',
      origin: 'provided',
    });
  });

  it('reports registry defaults as the origin', () => {
    const trace = traceThemeVars({}, 'light').traces.find((item) => item.name === '--vscode-focusBorder');

    expect(trace).toMatchObject({
      registryDefault: '#0090F1',
      resolvedValue: '#0090F1',
      origin: 'registry-default',
    });
  });

  it('reports null-default fallback chains', () => {
    const trace = traceThemeVars({
      '--vscode-foreground': '#616161',
    }, 'light').traces.find((item) => item.name === '--vscode-sideBar-foreground');

    expect(trace).toMatchObject({
      registryDefault: null,
      fallbackPath: ['--vscode-foreground'],
      fallbackSource: '--vscode-foreground',
      fallbackValue: '#616161',
      resolvedValue: '#616161',
      origin: 'fallback',
    });
  });

  it('traces Light inactive selection foreground through normal foreground, not active selection foreground', () => {
    const trace = traceThemeVars({
      '--vscode-foreground': '#616161',
      '--vscode-editor-foreground': '#333333',
      '--vscode-list-activeSelectionForeground': '#ffffff',
    }, 'light').traces.find((item) => item.name === '--vscode-list-inactiveSelectionForeground');

    expect(trace).toMatchObject({
      resolvedValue: '#616161',
      origin: 'fallback',
    });
    expect(trace?.fallbackPath).toContain('--vscode-sideBar-foreground');
    expect(trace?.fallbackPath).not.toContain('--vscode-list-activeSelectionForeground');
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
