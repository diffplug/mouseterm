import { afterEach, describe, expect, it, vi } from 'vitest';

describe('initPlatform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('falls back to the fake adapter outside VS Code', async () => {
    vi.stubGlobal('acquireVsCodeApi', undefined);

    const { initPlatform, FakePtyAdapter } = await import('./index');

    expect(initPlatform()).toBeInstanceOf(FakePtyAdapter);
  });
});
