import type { CSSProperties } from 'react';
import { completeThemeVars, type DormouseTheme } from '../../lib/themes';
import { ThemeSwatch } from './ThemeSwatch';

/** Shared by the closed trigger and list rows, independent of the host palette. */
export function getThemePreviewStyle(theme: DormouseTheme): CSSProperties {
  const vars = completeThemeVars(theme.vars, theme.type);
  return {
    backgroundColor: vars['--vscode-terminal-background'],
    color: vars['--vscode-terminal-foreground'],
  };
}

export function ThemePreview({ theme, label = theme.label }: { theme: DormouseTheme; label?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ThemeSwatch theme={theme} />
      <span className="min-w-0 truncate underline-offset-4 group-hover/theme-preview:underline">{label}</span>
    </span>
  );
}
