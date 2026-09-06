import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { summarizeAlertLogs } from './summarize-alert-log.mjs';

test('separates initial speech, retries, tests, outcomes, and incomplete data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alert-summary-'));
  const event = (event, attempt, extra = {}) => ({ version: 1, at: Date.UTC(2026, 8, 6), source: 'a', event, fields: { attempt, ...extra } });
  try {
    await writeFile(join(dir, 'alerts-1.jsonl'), [
      event('speech.request', '1', { reason: 'ring', characters: 12 }),
      event('speech.start', '1'), event('speech.end', '1'),
      event('speech.request', '2', { reason: 'requeue', characters: 12 }),
      event('speech.request', '3', { reason: 'test', characters: 19 }),
      event('speech.unavailable', '3'),
      event('diagnostics.dropped', null, { count: 4 }),
    ].map(JSON.stringify).join('\n') + '\n{"truncated":');
    const summary = await summarizeAlertLogs(dir);
    assert.equal(summary.droppedRecords, 4);
    assert.equal(summary.malformedLines, 1);
    assert.deepEqual(summary.days, [{ date: '2026-09-06', ringRequests: 1, ringCharacters: 12,
      requeues: 1, requeueCharacters: 12, tests: 1, testCharacters: 19,
      started: 1, ended: 1, failed: 1, withoutOutcome: 1 }]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
