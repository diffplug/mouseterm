import { alertDiagnosticsConfig } from '../lib/alert-diagnostics-config';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAlertJournal, isAlertDiagnostic } from './alert-journal';
import type { AlertDiagnostic } from '../lib/alert-diagnostics';

const dirs: string[] = [];
const journals: ReturnType<typeof createAlertJournal>[] = [];
beforeEach(() => { alertDiagnosticsConfig.enabled = true; });
afterEach(async () => {
  await Promise.all(journals.splice(0).map((j) => j.close()));
  alertDiagnosticsConfig.enabled = false;
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'alert-journal-'));
  dirs.push(dir);
  const journal = createAlertJournal(dir);
  journals.push(journal);
  return { dir, journal };
}
const record = (seq: number): AlertDiagnostic => ({ version: 1, source: 'test', seq, at: Date.now(), monotonicMs: seq, event: 'speech.request', fields: { text: 'hello', characters: 5, attempt: String(seq), reason: 'ring' } });
async function records(directory: string) {
  return (await Promise.all((await readdir(directory)).map((f) => readFile(join(directory, f), 'utf8'))))
    .join('').trim().split('\n').map((s) => JSON.parse(s));
}
it('writes private JSONL, strips extra envelope fields, and rejects oversized data', async () => {
  const { journal } = await setup();
  const first = record(1);
  journal.append({ ...first, unexpected: 'do not persist' });
  journal.append({ ...record(2), fields: { text: 'x'.repeat(513) } });
  await journal.flush();
  expect(await records(journal.directory)).toEqual([first]);
  if (process.platform !== 'win32') {
    expect((await stat(journal.directory)).mode & 0o777).toBe(0o700);
    const [name] = await readdir(journal.directory);
    expect((await stat(join(journal.directory, name))).mode & 0o777).toBe(0o600);
  }
});
it('bounds an overloaded queue and writes a loss marker', async () => {
  const { journal } = await setup();
  for (let seq = 1; seq <= 1000; seq++) journal.append(record(seq));
  await journal.flush();
  const all = await records(journal.directory);
  expect(all.filter((r) => r.event === 'speech.request')).toHaveLength(512);
  expect(all.find((r) => r.event === 'journal.dropped')?.fields.count).toBe(488);
  expect(all.every(isAlertDiagnostic)).toBe(true);
});
it('prunes only its own expired files', async () => {
  const { journal } = await setup();
  await mkdir(journal.directory);
  const old = join(journal.directory, 'alerts-1-00000000-0000-0000-0000-000000000000.jsonl');
  await writeFile(old, 'old');
  await utimes(old, new Date(0), new Date(0));
  await writeFile(join(journal.directory, 'unrelated.txt'), 'keep');
  journal.append(record(1));
  await journal.flush();
  expect(await readdir(journal.directory)).toContain('unrelated.txt');
  await expect(stat(old)).rejects.toThrow();
});
it('absorbs filesystem failure without leaking record contents in warnings', async () => {
  const { dir } = await setup();
  const warn = vi.fn();
  const file = join(dir, 'not-a-directory');
  await writeFile(file, 'x');
  const journal = createAlertJournal(file, warn);
  journals.push(journal);
  journal.append(record(1));
  await expect(journal.flush()).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls.flat().join('')).not.toContain('hello');
});

it('rotates before exceeding the file size budget', async () => {
  const { journal } = await setup();
  const fields = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`value${i}`, 'x'.repeat(500)]));
  for (let batch = 0; batch < 2; batch++) {
    for (let i = 0; i < 350; i++) journal.append({ ...record(batch * 350 + i + 1), fields });
    await journal.flush();
  }
  const files = await readdir(journal.directory);
  expect(files).toHaveLength(2);
  for (const name of files) expect((await stat(join(journal.directory, name))).size).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(await records(journal.directory)).toHaveLength(700);
});

it('reopens a file pruned by another host writer', async () => {
  const { journal } = await setup();
  journal.append(record(1));
  await journal.flush();
  const [file] = await readdir(journal.directory);
  await rm(join(journal.directory, file));
  journal.append(record(2));
  await journal.flush();
  expect((await records(journal.directory)).map((r) => r.seq)).toEqual([2]);
});

it('keeps accepting teardown records between shutdown lifecycle markers', async () => {
  const { journal } = await setup();
  journal.recordLifecycle('host.stopping');
  journal.append({ ...record(1), event: 'manager.onExit', fields: { sessionId: 's' } });
  journal.recordLifecycle('host.stopped');
  await journal.close();
  const all = await records(journal.directory);
  expect(all.map((r) => r.event)).toEqual(['host.stopping', 'manager.onExit', 'host.stopped']);
  expect(all.every(isAlertDiagnostic)).toBe(true);
});
