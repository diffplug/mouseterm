import type { CSSProperties } from 'react';
import { completeThemeVars, type DormouseTheme } from '../../lib/themes';
import { ThemeSwatch } from './ThemeSwatch';

/** Shared by the closed trigger and list rows, independent of the host palette. */
export function getThemePreviewStyle(theme: DormouseTheme): CSSProperties {
  const vars = completeThemeVars(theme.vars, theme.type);
  return {
    backgroundColor: vars['--vscode-terminal-background'],
    color: vars['--vscode-terminal-foreground'],
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 25%, transparent)',
  };
}

export function ThemePreview({ theme, label = theme.label }: { theme: DormouseTheme; label?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <ThemeSwatch theme={theme} />
      {/* Keep the underline inside the truncation clip: a 4px offset falls
          below the 16px line box at the library's 12px text size. */}
      <span className="min-w-0 truncate decoration-1 underline-offset-2 group-hover/theme-preview:underline">{label}</span>
    </span>
  );
}
