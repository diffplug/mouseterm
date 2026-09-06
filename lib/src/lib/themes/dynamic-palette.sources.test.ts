import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DYNAMIC_PALETTE_SOURCES } from './dynamic-palette';

// The running app feeds the palette from `--color-*` tokens read off the
// document; a caller resolving a theme it has not applied (the picker
// previewing a candidate) has only the `--vscode-*` vars those tokens alias.
// This pins the second column to theme-colors.css, so repointing an alias there
// fails here instead of leaving the preview silently disagreeing with the app.
describe('DYNAMIC_PALETTE_SOURCES / theme-colors.css parity', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(here, '../../theme-colors.css'), 'utf8');

  const aliases = new Map<string, string>();
  for (const [, token, vscodeVar] of css.matchAll(/(--color-[\w-]+):\s*var\((--vscode-[\w-]+)\)/g)) {
    aliases.set(token, vscodeVar);
  }

  it('reads the alias table off the stylesheet', () => {
    expect(aliases.size).toBeGreaterThan(0);
  });

  it.each(Object.entries(DYNAMIC_PALETTE_SOURCES))(
    '%s reads the var its token aliases',
    (_field, { token, vscodeVar }) => {
      // `focusBorder` is the one input the app reads as a raw --vscode-* var.
      expect(aliases.get(token) ?? token).toBe(vscodeVar);
    },
  );
});
