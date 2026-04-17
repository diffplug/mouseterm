import { fork, ChildProcess, execFileSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log } from './log';

export interface PtyCallbacks {
  onData(id: string, data: string): void;
  onExit(id: string, exitCode: number): void;
}

interface PtyBufferEntry {
  replayChunks: string[];
  replayChars: number;
  scrollbackChunks: string[];
  scrollbackChars: number;
  alive: boolean;
  exitCode?: number;
}

const MAX_BUFFER_CHARS = 1_000_000;
const ptyBuffers = new Map<string, PtyBufferEntry>();

function trimChunks(chunks: string[], totalChars: number): number {
  while (totalChars > MAX_BUFFER_CHARS && chunks.length > 1) {
    const removed = chunks.shift()!;
    totalChars -= removed.length;
  }
  return totalChars;
}

function createBufferEntry(alive: boolean, exitCode?: number): PtyBufferEntry {
  return {
    replayChunks: [],
    replayChars: 0,
    scrollbackChunks: [],
    scrollbackChars: 0,
    alive,
    exitCode,
  };
}

function bufferData(id: string, data: string): void {
  let entry = ptyBuffers.get(id);
  if (!entry) {
    entry = createBufferEntry(true);
    ptyBuffers.set(id, entry);
  }
  entry.replayChunks.push(data);
  entry.replayChars += data.length;
  entry.replayChars = trimChunks(entry.replayChunks, entry.replayChars);

  entry.scrollbackChunks.push(data);
  entry.scrollbackChars += data.length;
  entry.scrollbackChars = trimChunks(entry.scrollbackChunks, entry.scrollbackChars);
}

function bufferExit(id: string, exitCode: number): void {
  let entry = ptyBuffers.get(id);
  if (!entry) {
    entry = createBufferEntry(false, exitCode);
    ptyBuffers.set(id, entry);
    return;
  }
  entry.alive = false;
  entry.exitCode = exitCode;
}

export function getBufferedPtys(): Map<string, { alive: boolean; exitCode?: number }> {
  const result = new Map<string, { alive: boolean; exitCode?: number }>();
  for (const [id, entry] of ptyBuffers) {
    result.set(id, { alive: entry.alive, exitCode: entry.exitCode });
  }
  return result;
}

export function getReplayData(id: string): string | null {
  const entry = ptyBuffers.get(id);
  if (!entry || entry.replayChunks.length === 0) return null;
  const data = entry.replayChunks.join('');
  entry.replayChunks = [];
  entry.replayChars = 0;
  return data;
}

export function getScrollback(id: string): string | null {
  const entry = ptyBuffers.get(id);
  if (!entry || entry.scrollbackChunks.length === 0) return null;
  return entry.scrollbackChunks.join('');
}

let child: ChildProcess | null = null;
let childReady = false;
let pendingMessages: any[] = [];
const callbackSet = new Set<PtyCallbacks>();
let cachedNodePath: string | null = null;

function findSystemNode(): string {
  if (cachedNodePath) return cachedNodePath;

  // Try common locations first (avoids shell invocation)
  const candidates = [
    process.env.NVM_BIN && path.join(process.env.NVM_BIN, 'node'),
    '/usr/local/bin/node',
    '/usr/bin/node',
    '/opt/homebrew/bin/node',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) {
        cachedNodePath = p;
        return p;
      }
    } catch { /* not found, try next */ }
  }

  // Fall back to PATH lookup via env (portable, no 'which' dependency)
  try {
    cachedNodePath = execFileSync('/usr/bin/env', ['node', '-e', 'process.stdout.write(process.execPath)'], {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    return cachedNodePath;
  } catch {
    // Last resort
    cachedNodePath = '/usr/local/bin/node';
    return cachedNodePath;
  }
}

function ensureChild(extensionPath: string): ChildProcess {
  if (child && child.connected) return child;

  const hostScript = path.join(extensionPath, 'dist', 'pty-host.js');
  const nodePath = findSystemNode();

  child = fork(hostScript, [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    execPath: nodePath,
    execArgv: [], // clear --inspect flags inherited from VSCode debug
    env: process.env,
  });

  childReady = false;

  child.on('message', (msg: any) => {
    if (msg.type === 'ready') {
      log.info('pty-host ready');
      childReady = true;
      for (const queued of pendingMessages) {
        child?.send(queued);
      }
      pendingMessages = [];
    } else if (msg.type === 'data') {
      bufferData(msg.id, msg.data);
      for (const cb of callbackSet) cb.onData(msg.id, msg.data);
    } else if (msg.type === 'exit') {
      bufferExit(msg.id, msg.exitCode);
      for (const cb of callbackSet) cb.onExit(msg.id, msg.exitCode);
    } else if (msg.type === 'error') {
      log.error(`PTY error for ${msg.id}:`, msg.message);
    }
  });

  child.on('exit', (code) => {
    log.error(`pty-host exited unexpectedly (code ${code})`);
    child = null;
    childReady = false;
    pendingMessages = [];
  });

  child.stderr?.on('data', (data: Buffer) => {
    log.error(`pty-host stderr: ${data.toString().trim()}`);
  });

  return child;
}

let extensionPath_ = '';

export function setExtensionPath(p: string): void {
  extensionPath_ = p;
}

export function addCallbacks(cb: PtyCallbacks): () => void {
  callbackSet.add(cb);
  return () => { callbackSet.delete(cb); };
}

function sendToChild(msg: any): void {
  ensureChild(extensionPath_);
  if (childReady) {
    child?.send(msg);
  } else {
    pendingMessages.push(msg);
  }
}

export function spawn(id: string, options?: { cols?: number; rows?: number; cwd?: string; shell?: string; args?: string[] }): void {
  ptyBuffers.set(id, createBufferEntry(true));
  sendToChild({ type: 'spawn', id, cols: options?.cols || 80, rows: options?.rows || 30, cwd: options?.cwd, shell: options?.shell, args: options?.args });
}

export interface ShellEntry {
  name: string;
  path: string;
  args: string[];
}

export function getAvailableShells(): Promise<ShellEntry[]> {
  return new Promise((resolve) => {
    const requestId = `shells-${Date.now()}`;
    // Ensure the child process is forked before attaching the listener —
    // otherwise `child` is null on the cold path and the handler is never
    // registered, causing the timeout to fire with an empty list.
    sendToChild({ type: 'getShells', requestId });
    const timeout = setTimeout(() => {
      child?.off('message', handler);
      resolve([]);
    }, 5000);
    const handler = (msg: any) => {
      if (msg.type === 'shells' && msg.requestId === requestId) {
        clearTimeout(timeout);
        child?.off('message', handler);
        resolve(msg.shells || []);
      }
    };
    child?.on('message', handler);
  });
}

export function getCwd(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    sendToChild({ type: 'getCwd', id });
    const timeout = setTimeout(() => {
      child?.off('message', handler);
      resolve(null);
    }, 1000);
    const handler = (msg: any) => {
      if (msg.type === 'cwd' && msg.id === id) {
        clearTimeout(timeout);
        child?.off('message', handler);
        resolve(msg.cwd);
      }
    };
    child?.on('message', handler);
  });
}

export function write(id: string, data: string): void {
  sendToChild({ type: 'input', id, data });
}

export function resize(id: string, cols: number, rows: number): void {
  sendToChild({ type: 'resize', id, cols, rows });
}

export function kill(id: string): void {
  ptyBuffers.delete(id);
  sendToChild({ type: 'kill', id });
}

export function gracefulKillAll(timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (!child?.connected) { resolve(); return; }
    const timeout = setTimeout(() => {
      child?.off('message', handler);
      resolve();
    }, timeoutMs + 500); // extra margin beyond the pty-host timeout
    const handler = (msg: any) => {
      if (msg.type === 'gracefulKillDone') {
        clearTimeout(timeout);
        child?.off('message', handler);
        resolve();
      }
    };
    child.on('message', handler);
    child.send({ type: 'gracefulKillAll', timeout: timeoutMs });
  });
}

export function killAll(): void {
  ptyBuffers.clear();
  if (child?.connected) {
    child.send({ type: 'killAll' });
    child.kill();
    child = null;
  }
}
