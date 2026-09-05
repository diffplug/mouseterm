// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { DirectoryEntry } from '../../remote/burrow/burrow-surface-provider';
import { createAskSurfaceProvider } from './ask-surface-provider';

const entry = (surfaceId: string, title: string): DirectoryEntry => ({
  paneRef: surfaceId,
  surfaceId,
  type: 'terminal',
  title,
  focused: false,
  alive: true,
  ringing: false,
  hasTODO: false,
});

const inertPty = {
  writePty: () => {},
  resizePty: () => {},
  streamPty: () => ({ stop: () => {}, ready: Promise.resolve() }),
};

describe('createAskSurfaceProvider directory', () => {
  it('keeps the first of two answerers claiming one surface id', async () => {
    // Duplicated cold-restored windows can both hold a pane id. The first
    // answer is the owner the attach path's resolve probe selects, so the row
    // the phone shows must be that one — not a duplicate lottery.
    const { provider } = createAskSurfaceProvider(
      async () => [
        entry('pane-1', 'local copy'),
        entry('pane-2', 'only one'),
        entry('pane-1', 'far copy'),
      ],
      inertPty,
    );

    const entries = await provider.collectDirectory();
    expect(entries.map((e) => e.title)).toEqual(['local copy', 'only one']);
  });
});

describe('createAskSurfaceProvider resize', () => {
  it('rejects when the resolved owner disappears instead of acknowledging the cached size', async () => {
    const { provider } = createAskSurfaceProvider(
      async (_op, params) => (params as { op: string }).op === 'attach'
        ? [{ ptyId: 'pty-1', cols: 80, rows: 24 }]
        : [],
      inertPty,
    );
    const handle = await provider.resolveSurface('pane-1', { cols: 80, rows: 24 });
    await expect(handle!.resize(120, 40)).rejects.toThrow('surface owner unavailable');
    expect({ cols: handle!.cols, rows: handle!.rows }).toEqual({ cols: 80, rows: 24 });
  });
});
