import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONSUMED_VSCODE_KEYS } from './convert';

// The bundle script is a .mjs build-time tool that can't import TS, so it
// duplicates CONSUMED_VSCODE_KEYS as a local set. This test pins the two
// lists together — adding a key to one without the other will fail loudly
// instead of producing a bundled.json that's missing colors used by the app
// at runtime.
describe('CONSUMED_VSCODE_KEYS / bundle-themes.mjs parity', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const scriptPath = resolve(here, '../../../scripts/bundle-themes.mjs');
  const scriptSource = readFileSync(scriptPath, 'utf8');

  const consumedBlock = scriptSource.match(/const CONSUMED_KEYS = new Set\(\[([\s\S]*?)\]\);/);
  if (!consumedBlock) throw new Error('Could not locate CONSUMED_KEYS in bundle-themes.mjs');
  const scriptKeys = new Set(
    Array.from(consumedBlock[1].matchAll(/'([^']+)'/g), (m) => m[1]),
  );

  it('every key in convert.ts CONSUMED_VSCODE_KEYS is in bundle-themes.mjs CONSUMED_KEYS', () => {
    const missing = CONSUMED_VSCODE_KEYS.filter((k) => !scriptKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('every key in bundle-themes.mjs CONSUMED_KEYS is in convert.ts CONSUMED_VSCODE_KEYS', () => {
    const consumedSet = new Set<string>(CONSUMED_VSCODE_KEYS);
    const extra = [...scriptKeys].filter((k) => !consumedSet.has(k));
    expect(extra).toEqual([]);
  });
});
