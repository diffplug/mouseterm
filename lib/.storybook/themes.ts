/** VSCode theme color maps for Storybook theme switcher.
 * Derived from bundled themes. When applied, these override
 * the @theme --color-* fallbacks in theme.css.
 */
import _bundled from '../src/lib/themes/bundled.json';
import type { MouseTermTheme } from '../src/lib/themes/types';

const bundled = _bundled as unknown as MouseTermTheme[];

export const VSCODE_THEMES: Record<string, Record<string, string>> = {};
for (const theme of bundled) {
  VSCODE_THEMES[theme.label] = theme.vars;
}
