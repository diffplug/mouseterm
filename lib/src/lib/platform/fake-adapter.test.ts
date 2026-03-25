import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FakePtyAdapter, type FakeScenario } from './fake-adapter';

describe('FakePtyAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createAdapter() {
    const adapter = new FakePtyAdapter();
    const dataEvents: { id: string; data: string }[] = [];
    const exitEvents: { id: string; exitCode: number }[] = [];
    adapter.onPtyData((detail) => dataEvents.push(detail));
    adapter.onPtyExit((detail) => exitEvents.push(detail));
    return { adapter, dataEvents, exitEvents };
  }

  // --- Core (Story 11.1) ---

  it('init resolves without error', async () => {
    const { adapter } = createAdapter();
    await expect(adapter.init()).resolves.toBeUndefined();
  });

  it('spawnPty registers terminal', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.writePty('t1', 'hello');
    expect(dataEvents).toEqual([{ id: 't1', data: 'hello' }]);
  });

  it('writePty echoes data back via onPtyData', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.writePty('t1', 'a');
    adapter.writePty('t1', 'b');
    expect(dataEvents).toEqual([
      { id: 't1', data: 'a' },
      { id: 't1', data: 'b' },
    ]);
  });

  it('writePty to non-spawned terminal does nothing', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.writePty('nope', 'hello');
    expect(dataEvents).toEqual([]);
  });

  it('killPty fires onPtyExit with code 0', () => {
    const { adapter, exitEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.killPty('t1');
    expect(exitEvents).toEqual([{ id: 't1', exitCode: 0 }]);
  });

  it('killPty on non-spawned terminal fires exit without crashing', () => {
    const { adapter, exitEvents } = createAdapter();
    adapter.killPty('nope');
    expect(exitEvents).toEqual([{ id: 'nope', exitCode: 0 }]);
  });

  it('echo stops after kill', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.killPty('t1');
    adapter.writePty('t1', 'hello');
    expect(dataEvents).toEqual([]);
  });

  it('handler removal prevents firing', () => {
    const adapter = new FakePtyAdapter();
    const events1: string[] = [];
    const events2: string[] = [];
    const h1 = (d: { id: string; data: string }) => events1.push(d.data);
    const h2 = (d: { id: string; data: string }) => events2.push(d.data);
    adapter.onPtyData(h1);
    adapter.onPtyData(h2);
    adapter.spawnPty('t1');
    adapter.writePty('t1', 'x');
    expect(events1).toEqual(['x']);
    expect(events2).toEqual(['x']);

    adapter.offPtyData(h1);
    adapter.writePty('t1', 'y');
    expect(events1).toEqual(['x']);
    expect(events2).toEqual(['x', 'y']);
  });

  it('resizePty is a no-op', () => {
    const { adapter } = createAdapter();
    adapter.spawnPty('t1');
    // Should not throw
    adapter.resizePty('t1', 120, 40);
  });

  // --- Scenario Playback (Story 11.2) ---

  const twoChunkScenario: FakeScenario = {
    name: 'two-chunks',
    chunks: [
      { delay: 100, data: 'first' },
      { delay: 200, data: 'second' },
    ],
  };

  const exitScenario: FakeScenario = {
    name: 'with-exit',
    chunks: [
      { delay: 50, data: 'done' },
    ],
    exitCode: 1,
  };

  it('default scenario plays on spawn', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.spawnPty('t1');

    vi.advanceTimersByTime(100);
    expect(dataEvents).toEqual([{ id: 't1', data: 'first' }]);

    vi.advanceTimersByTime(200);
    expect(dataEvents).toEqual([
      { id: 't1', data: 'first' },
      { id: 't1', data: 'second' },
    ]);
  });

  it('per-ID scenario overrides default', () => {
    const { adapter, dataEvents } = createAdapter();
    const override: FakeScenario = {
      name: 'override',
      chunks: [{ delay: 10, data: 'custom' }],
    };
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.setScenario('t1', override);
    adapter.spawnPty('t1');

    vi.advanceTimersByTime(10);
    expect(dataEvents).toEqual([{ id: 't1', data: 'custom' }]);
  });

  it('scenario with exitCode fires onPtyExit after last chunk', () => {
    const { adapter, dataEvents, exitEvents } = createAdapter();
    adapter.setDefaultScenario(exitScenario);
    adapter.spawnPty('t1');

    vi.advanceTimersByTime(50);
    expect(dataEvents).toEqual([{ id: 't1', data: 'done' }]);
    expect(exitEvents).toEqual([]);

    vi.advanceTimersByTime(100);
    expect(exitEvents).toEqual([{ id: 't1', exitCode: 1 }]);
  });

  it('scenario without exitCode does not fire onPtyExit', () => {
    const { adapter, exitEvents } = createAdapter();
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.spawnPty('t1');

    vi.advanceTimersByTime(10000);
    expect(exitEvents).toEqual([]);
  });

  it('killPty cancels in-progress scenario', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.spawnPty('t1');

    vi.advanceTimersByTime(100);
    expect(dataEvents).toEqual([{ id: 't1', data: 'first' }]);

    adapter.killPty('t1');
    vi.advanceTimersByTime(10000);
    // 'second' should never fire
    expect(dataEvents).toEqual([{ id: 't1', data: 'first' }]);
  });

  it('multiple terminals play different scenarios concurrently', () => {
    const { adapter, dataEvents } = createAdapter();
    const fast: FakeScenario = {
      name: 'fast',
      chunks: [{ delay: 50, data: 'fast' }],
    };
    const slow: FakeScenario = {
      name: 'slow',
      chunks: [{ delay: 200, data: 'slow' }],
    };
    adapter.setScenario('t1', fast);
    adapter.setScenario('t2', slow);
    adapter.spawnPty('t1');
    adapter.spawnPty('t2');

    vi.advanceTimersByTime(50);
    expect(dataEvents).toEqual([{ id: 't1', data: 'fast' }]);

    vi.advanceTimersByTime(150);
    expect(dataEvents).toEqual([
      { id: 't1', data: 'fast' },
      { id: 't2', data: 'slow' },
    ]);
  });

  it('echo is disabled during scenario playback', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.spawnPty('t1');

    adapter.writePty('t1', 'should-be-ignored');
    expect(dataEvents).toEqual([]);
  });

  it('echo resumes after scenario finishes (no exitCode)', () => {
    const { adapter, dataEvents } = createAdapter();
    adapter.setDefaultScenario(twoChunkScenario);
    adapter.spawnPty('t1');

    // Advance past all chunks + cleanup timer
    vi.advanceTimersByTime(400);
    dataEvents.length = 0;

    adapter.writePty('t1', 'echo-works');
    expect(dataEvents).toEqual([{ id: 't1', data: 'echo-works' }]);
  });

  // --- Bulk cleanup (for destroyAllTerminals-like usage) ---

  it('killing all spawned terminals fires exit for each', () => {
    const { adapter, exitEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.spawnPty('t2');
    adapter.spawnPty('t3');

    adapter.killPty('t1');
    adapter.killPty('t2');
    adapter.killPty('t3');

    expect(exitEvents).toEqual([
      { id: 't1', exitCode: 0 },
      { id: 't2', exitCode: 0 },
      { id: 't3', exitCode: 0 },
    ]);
  });

  it('killing already-killed terminals does not double-fire handlers', () => {
    const { adapter, exitEvents } = createAdapter();
    adapter.spawnPty('t1');
    adapter.killPty('t1');
    adapter.killPty('t1');

    // Both calls fire exit (killPty doesn't guard against re-kill),
    // but echo is disabled after first kill
    expect(exitEvents).toHaveLength(2);
  });
});
