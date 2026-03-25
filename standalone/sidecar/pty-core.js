const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function safeResolve(resolver) {
  try {
    const value = resolver();
    return value || undefined;
  } catch {
    return undefined;
  }
}

function resolveDefaultShell(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return (
      env.ComSpec ||
      env.COMSPEC ||
      path.win32.join(env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows', 'System32', 'cmd.exe')
    );
  }
  return env.SHELL || '/bin/sh';
}

function resolveDefaultCwd(platform = process.platform, env = process.env, osModule = os) {
  const homedir = safeResolve(() => osModule.homedir());
  const tmpdir = safeResolve(() => osModule.tmpdir());

  if (platform === 'win32') {
    const homeFromDrive = env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined;
    return env.USERPROFILE || homeFromDrive || env.HOME || homedir || tmpdir || 'C:\\';
  }

  return env.HOME || homedir || tmpdir || '/tmp';
}

function directoryExists(cwd, fsModule = fs) {
  try {
    return fsModule.statSync(cwd).isDirectory();
  } catch {
    return false;
  }
}

function resolveSpawnConfig(options, runtime = {}) {
  const { cols = 80, rows = 30, cwd } = options || {};
  const env = runtime.env || process.env;
  const platform = runtime.platform || process.platform;
  const osModule = runtime.osModule || os;
  const fsModule = runtime.fsModule || fs;
  const defaultCwd = resolveDefaultCwd(platform, env, osModule);
  const missingExplicitCwd = Boolean(cwd) && !directoryExists(cwd, fsModule);

  return {
    cols,
    rows,
    cwd: missingExplicitCwd ? defaultCwd : (cwd || defaultCwd),
    cwdWarning: missingExplicitCwd ? `unable to restore because directory ${cwd} was removed` : null,
    env: { ...env, TERM_PROGRAM: 'MouseTerm' },
    shell: resolveDefaultShell(platform, env),
  };
}

module.exports.resolveSpawnConfig = resolveSpawnConfig;

function parseCwdFromLsof(output, pid) {
  const lines = output.split(/\r?\n/);
  let inTargetProcess = false;
  let sawCwdFd = false;

  for (const line of lines) {
    if (line.startsWith('p')) {
      inTargetProcess = line === `p${pid}`;
      sawCwdFd = false;
      continue;
    }

    if (!inTargetProcess) continue;

    if (line === 'fcwd') {
      sawCwdFd = true;
      continue;
    }

    if (sawCwdFd && line.startsWith('n')) {
      return line.slice(1) || null;
    }
  }

  return null;
}

module.exports.parseCwdFromLsof = parseCwdFromLsof;

function getCwdForPid(pid, runtime = {}) {
  const fsModule = runtime.fsModule || fs;
  const execFileSyncFn = runtime.execFileSync || execFileSync;

  // Linux: /proc/<pid>/cwd symlink
  try {
    return fsModule.readlinkSync(`/proc/${pid}/cwd`);
  } catch { /* not Linux or proc unavailable */ }

  // macOS: lsof. `-a` is required so `-p` and `-d cwd` are combined instead
  // of OR'ed, which otherwise returns unrelated processes and often `/`.
  try {
    const out = execFileSyncFn('lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseCwdFromLsof(out, pid);
  } catch { /* fallback */ }

  return null;
}

module.exports.getCwdForPid = getCwdForPid;

/**
 * Shared PTY manager — the single place where node-pty processes are managed.
 *
 * Usage: const mgr = require('./pty-core').create(send, nodePty)
 *   where send(event, data) is a transport callback.
 *
 * Events emitted via send():
 *   send('data',  { id, data })
 *   send('exit',  { id, exitCode, signal })
 *   send('error', { id, message })
 *   send('list',  { ptys: [{ id, alive }] })
 */

module.exports.create = function create(send, ptyModule) {
  if (!ptyModule || typeof ptyModule.spawn !== 'function') {
    throw new TypeError('create() requires a node-pty compatible module');
  }

  const MAX_SCROLLBACK_CHARS = 1_000_000;
  const pty = ptyModule;
  const ptys = new Map(); // id -> pty.IPty
  const scrollback = new Map(); // id -> { chunks: string[], totalChars: number }

  function bufferScrollback(id, data) {
    let entry = scrollback.get(id);
    if (!entry) {
      entry = { chunks: [], totalChars: 0 };
      scrollback.set(id, entry);
    }

    entry.chunks.push(data);
    entry.totalChars += data.length;
    while (entry.totalChars > MAX_SCROLLBACK_CHARS && entry.chunks.length > 1) {
      const removed = entry.chunks.shift();
      entry.totalChars -= removed ? removed.length : 0;
    }
  }

  function spawn(id, options) {
    const config = resolveSpawnConfig(options);

    let p;
    try {
      p = pty.spawn(config.shell, [], {
        name: 'xterm-256color',
        cols: config.cols,
        rows: config.rows,
        cwd: config.cwd,
        env: config.env,
      });
    } catch (err) {
      console.error(`[pty-core] spawn failed for ${id}:`, err.message);
      send('error', { id, message: err.message });
      return;
    }

    ptys.set(id, p);
    scrollback.set(id, { chunks: [], totalChars: 0 });

    p.onData((data) => {
      bufferScrollback(id, data);
      send('data', { id, data });
    });

    p.onExit(({ exitCode, signal }) => {
      send('exit', { id, exitCode, signal });
      if (ptys.get(id) === p) {
        ptys.delete(id);
      }
    });

    if (config.cwdWarning) {
      send('data', { id, data: `\r\n${config.cwdWarning}\r\n` });
    }

    console.error(`[pty-core] spawned: ${id} (${config.shell}, ${config.cols}x${config.rows})`);
  }

  function write(id, data) {
    const p = ptys.get(id);
    if (p) p.write(data);
  }

  function resize(id, cols, rows) {
    const p = ptys.get(id);
    if (p) p.resize(cols, rows);
  }

  function kill(id) {
    const p = ptys.get(id);
    if (p) {
      p.kill();
      ptys.delete(id);
    }
    scrollback.delete(id);
  }

  function killAll() {
    for (const [, p] of ptys) {
      p.kill();
    }
    ptys.clear();
    scrollback.clear();
  }

  function list() {
    const result = [];
    for (const [id] of ptys) {
      result.push({ id, alive: true });
    }
    send('list', { ptys: result });
  }

  function getCwd(id, requestId) {
    const p = ptys.get(id);
    if (!p) { send('cwd', { id, cwd: null, requestId }); return; }
    send('cwd', { id, cwd: getCwdForPid(p.pid), requestId });
  }

  function getScrollback(id, requestId) {
    const entry = scrollback.get(id);
    send('scrollback', {
      id,
      data: entry && entry.chunks.length > 0 ? entry.chunks.join('') : null,
      requestId,
    });
  }

  function gracefulKillAll(timeout = 2000) {
    for (const [, p] of ptys) {
      try { p.kill('SIGTERM'); } catch { /* already dead */ }
    }
    setTimeout(() => {
      send('gracefulKillDone', {});
    }, timeout);
  }

  return { spawn, write, resize, kill, killAll, list, getCwd, getScrollback, gracefulKillAll };
};
