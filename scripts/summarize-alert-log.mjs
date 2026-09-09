#!/usr/bin/env node
// Usage: node scripts/summarize-alert-log.mjs <alert-logs directory>
import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

export async function summarizeAlertLogs(directory) {
  const attempts = new Map();
  const sources = new Set();
  let firstAt = Infinity;
  let lastAt = -Infinity;
  let droppedRecords = 0;
  let malformedLines = 0;
  const files = (await readdir(directory)).filter((name) => /^alerts-.*\.jsonl$/.test(name)).sort();
  for (const name of files) {
    const lines = createInterface({ input: createReadStream(join(directory, name)), crlfDelay: Infinity });
    for await (const line of lines) {
      let record;
      try { record = JSON.parse(line); } catch { malformedLines++; continue; }
      if (!record || record.version !== 1 || !Number.isFinite(record.at) || typeof record.event !== 'string'
        || !record.fields || typeof record.fields !== 'object') { malformedLines++; continue; }
      firstAt = Math.min(firstAt, record.at);
      lastAt = Math.max(lastAt, record.at);
      if (typeof record.source === 'string' && !record.source.startsWith('journal:')) sources.add(record.source);
      if (record.event.endsWith('.dropped')) droppedRecords += record.fields.count || 0;
      if (!record.event.startsWith('speech.') || !record.fields.attempt || !record.source) continue;
      const key = `${record.source}/${record.fields.attempt}`;
      const attempt = attempts.get(key) ?? { events: new Set() };
      attempt.events.add(record.event);
      if (record.event === 'speech.request') attempt.request = record;
      attempts.set(key, attempt);
    }
  }
  const days = new Map();
  for (const { request, events } of attempts.values()) {
    if (!request) continue; // Request may have aged out of retention.
    const date = new Date(request.at).toISOString().slice(0, 10);
    const day = days.get(date) ?? {
      date, ringRequests: 0, ringCharacters: 0, requeues: 0, requeueCharacters: 0,
      tests: 0, testCharacters: 0, started: 0, ended: 0, failed: 0, withoutOutcome: 0,
    };
    const { reason, characters } = request.fields;
    if (!Number.isSafeInteger(characters) || characters < 0) { malformedLines++; continue; }
    if (reason === 'ring') { day.ringRequests++; day.ringCharacters += characters; }
    if (reason === 'requeue') { day.requeues++; day.requeueCharacters += characters; }
    if (reason === 'test') { day.tests++; day.testCharacters += characters; }
    if (events.has('speech.start')) day.started++;
    if (events.has('speech.end')) day.ended++;
    const failed = ['speech.error', 'speech.refused', 'speech.unavailable'].some((event) => events.has(event));
    if (failed) day.failed++;
    if (!failed && !events.has('speech.end')) day.withoutOutcome++;
    days.set(date, day);
  }
  return {
    note: 'Observed local requests, not billable ElevenLabs usage. Missing callbacks do not prove silence. Retention, shutdown, and dropped records can make totals incomplete.',
    files: files.length, sources: sources.size, droppedRecords, malformedLines,
    firstRecordAt: Number.isFinite(firstAt) ? new Date(firstAt).toISOString() : null,
    lastRecordAt: Number.isFinite(lastAt) ? new Date(lastAt).toISOString() : null,
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) {
    console.error('Usage: node scripts/summarize-alert-log.mjs <alert-logs directory>');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await summarizeAlertLogs(process.argv[2]), null, 2));
  }
}
