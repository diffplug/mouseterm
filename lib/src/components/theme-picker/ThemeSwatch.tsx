import { useMemo } from 'react';
import { completeThemeVars, pickDynamicPalette, type DormouseTheme } from '../../lib/themes';
import { parseColor } from '../../lib/css-color';
import { flattenAlpha, flattenSelectionAlpha } from '../../lib/themes/flatten-alpha';

export function getThemeSwatchColors(theme: DormouseTheme) {
  const vars = completeThemeVars(theme.vars, theme.type);
  flattenSelectionAlpha(vars);
  const palette = pickDynamicPalette({
    appBg: vars['--vscode-sideBar-background'],
    headerInactiveBg: vars['--vscode-list-inactiveSelectionBackground'],
    headerInactiveFg: vars['--vscode-list-inactiveSelectionForeground'],
    terminalBg: vars['--vscode-terminal-background'],
    terminalFg: vars['--vscode-terminal-foreground'],
    headerActiveBg: vars['--vscode-list-activeSelectionBackground'],
    focusBorder: vars['--vscode-focusBorder'],
  }, (value) => {
    const color = parseColor(value);
    return color ? [color.r, color.g, color.b] : null;
  });
  return {
    active: vars['--vscode-list-activeSelectionBackground'],
    // The ring is painted over app chrome. Preserve that appearance even
    // when the swatch is placed over the candidate's terminal background.
    focus: flattenAlpha(palette.focusRing?.value ?? vars['--vscode-focusBorder'], vars['--vscode-sideBar-background']),
  };
}

export function ThemeSwatch({ theme }: { theme: DormouseTheme }) {
  const colors = useMemo(() => getThemeSwatchColors(theme), [theme]);
  return (
    <span aria-hidden="true" className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <span
        className="block h-4 w-4 rounded-full border border-current/25"
        style={{ backgroundColor: colors.active }}
      />
      <span
        className="absolute -right-0.5 -bottom-0.5 size-[7px] rounded-full"
        style={{ backgroundColor: colors.focus }}
      />
    </span>
  );
}
