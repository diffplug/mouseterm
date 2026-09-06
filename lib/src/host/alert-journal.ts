import { mkdir, open, readdir, stat, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AlertDiagnostic, DiagnosticFields } from '../lib/alert-diagnostics';

const FILE_BYTES = 4 * 1024 * 1024;
const TOTAL_BYTES = 64 * 1024 * 1024;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_QUEUED = 512;
const FILE_PATTERN = /^alerts-[\d-]+-[0-9a-f-]+\.jsonl$/;

/** Bounded, best-effort private JSONL journal, shared by the two desktop hosts.
 * Each writer owns unique files. Never fall back to the public diagnostic log. */
export function createAlertJournal(stateDir: string, warn: (message: string) => void = console.warn) {
  const directory = join(stateDir, 'alert-logs');
  const queue: string[] = [];
  const source = `journal:${randomUUID()}`;
  let seq = 0;
  let draining: Promise<void> | undefined;
  let file: Awaited<ReturnType<typeof open>> | undefined;
  let bytes = 0;
  let openedAt = 0;
  let dropped = 0;
  let closed = false;
  let warned = false;

  function writerRecord(event: string, fields: DiagnosticFields = {}): AlertDiagnostic {
    return { version: 1, source, seq: ++seq, at: Date.now(), monotonicMs: performance.now(), event, fields };
  }

  async function prune(): Promise<void> {
    const names = (await readdir(directory)).filter((name) => FILE_PATTERN.test(name));
    const files = await Promise.all(names.map(async (name) => {
      const path = join(directory, name);
      return { path, ...await stat(path).catch(() => ({ size: 0, mtimeMs: 0 })) };
    }));
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    let total = 0;
    for (const entry of files) {
      total += entry.size;
      if (Date.now() - entry.mtimeMs > RETENTION_MS || total > TOTAL_BYTES - FILE_BYTES) {
        await unlink(entry.path).catch(() => {});
      }
    }
  }

  async function drain(): Promise<void> {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await chmod(directory, 0o700);
      while (queue.length || dropped) {
        const lost = dropped;
        const line = lost
          ? JSON.stringify(writerRecord('journal.dropped', { count: lost })) + '\n'
          : queue[0];
        const lineBytes = Buffer.byteLength(line);
        // Another window may prune an idle writer's file. Reopen instead of
        // continuing to append invisibly to an unlinked inode.
        if (file && (await file.stat()).nlink === 0) { await file.close(); file = undefined; }
        if (!file || bytes + lineBytes > FILE_BYTES || Date.now() - openedAt >= 86_400_000) {
          await file?.close();
          file = undefined;
          await prune();
          file = await open(join(directory, `alerts-${Date.now()}-${randomUUID()}.jsonl`), 'wx', 0o600);
          bytes = 0;
          openedAt = Date.now();
        }
        await file.writeFile(line);
        if (lost) dropped -= lost;
        else queue.shift();
        bytes += lineBytes;
      }
    } catch {
      dropped += queue.length;
      queue.length = 0;
      await file?.close().catch(() => {});
      file = undefined;
      if (!warned) {
        warned = true;
        try { warn('[alerts] Local alert journal unavailable; some diagnostics were lost.'); } catch {}
      }
    }
  }

  function pump(): void {
    if (draining) return;
    draining = drain().finally(() => {
      draining = undefined;
      if (queue.length) pump();
    });
  }

  function append(value: unknown): void {
    if (closed || !stateDir || !isAlertDiagnostic(value)) return;
    const { version, source, seq, at, monotonicMs, event, fields } = value;
    const line = JSON.stringify({ version, source, seq, at, monotonicMs, event, fields }) + '\n';
    if (Buffer.byteLength(line) > 8192 || queue.length >= MAX_QUEUED) { dropped++; return; }
    queue.push(line);
    pump();
  }

  return {
    directory,
    append,
    recordLifecycle(event: 'host.stopping' | 'host.stopped'): void { append(writerRecord(event)); },
    async flush(): Promise<void> { while (draining) await draining; },
    async close(): Promise<void> {
      closed = true;
      while (draining) await draining;
      await file?.close().catch(() => {});
      file = undefined;
    },
  };
}

/** Limit untrusted renderer payloads before retaining them in the host queue. */
export function isAlertDiagnostic(value: unknown): value is AlertDiagnostic {
  if (!value || typeof value !== 'object') return false;
  const r = value as AlertDiagnostic;
  if (r.version !== 1 || typeof r.source !== 'string' || r.source.length > 100
    || !Number.isSafeInteger(r.seq) || r.seq < 1 || !Number.isFinite(r.at) || !Number.isFinite(r.monotonicMs)
    || typeof r.event !== 'string' || !/^[a-zA-Z.]+$/.test(r.event) || r.event.length > 80
    || !r.fields || typeof r.fields !== 'object' || Array.isArray(r.fields)) return false;
  const fields = Object.entries(r.fields);
  return fields.length <= 64 && fields.every(([key, v]) => key.length <= 80
    && (v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))
      || (typeof v === 'string' && v.length <= 512)));
}
