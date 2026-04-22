const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileP = promisify(execFile);

const MAX_BUFFER = 16 * 1024 * 1024;
const DEBUG = process.env.MOUSETERM_DEBUG_CLIPBOARD === '1';

function debugLog(...parts) {
  if (!DEBUG) return;
  try { process.stderr.write(`[clipboard] ${parts.join(' ')}\n`); } catch {}
}

function tempDropsDir(osModule = os) {
  return path.join(osModule.tmpdir(), 'mouseterm-drops');
}

function sanitizeFilename(name) {
  const base = path.basename(String(name || '') || 'file');
  const clean = base.replace(/[^A-Za-z0-9._-]/g, '_');
  const trimmed = clean.length > 120 ? clean.slice(-120) : clean;
  return trimmed || 'file';
}

async function ensureDir(dir, fsp) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileNonEmpty(p, fsp) {
  try {
    const st = await fsp.stat(p);
    return st.size > 0;
  } catch {
    return false;
  }
}

async function silentUnlink(p, fsp) {
  try { await fsp.unlink(p); } catch {}
}

function collectSpawnStdout(spawnFn, cmd, args) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(cmd, args);
    } catch {
      resolve(null);
      return;
    }
    const chunks = [];
    child.stdout.on('data', (c) => chunks.push(c));
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code === 0 && chunks.length > 0) resolve(Buffer.concat(chunks));
      else resolve(null);
    });
  });
}

const MAC_FILE_PATHS_SCRIPT = [
  'use framework "AppKit"',
  'use framework "Foundation"',
  'use scripting additions',
  'try',
  '  set pb to current application\'s NSPasteboard\'s generalPasteboard()',
  '  set urls to pb\'s readObjectsForClasses:{current application\'s NSURL} options:(missing value)',
  '  if urls is missing value then return ""',
  '  set AppleScript\'s text item delimiters to linefeed',
  '  set path_list to {}',
  '  repeat with u in urls',
  '    if (u\'s isFileURL()) as boolean then',
  '      set end of path_list to (u\'s |path|() as text)',
  '    end if',
  '  end repeat',
  '  if (count of path_list) > 0 then return path_list as text',
  'end try',
  'return ""',
].join('\n');

async function readFilePathsMac(runtime) {
  const exec = runtime.exec || execFileP;
  if (DEBUG) {
    try {
      const { stdout } = await exec('osascript', ['-e', 'clipboard info'], { maxBuffer: MAX_BUFFER });
      debugLog('clipboard info:', JSON.stringify(stdout.trim()));
    } catch (err) {
      debugLog('clipboard info failed:', err && err.message || err);
    }
  }
  try {
    const { stdout } = await exec('osascript', ['-e', MAC_FILE_PATHS_SCRIPT], { maxBuffer: MAX_BUFFER });
    debugLog('files script stdout:', JSON.stringify(stdout));
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    debugLog('files script error:', err && err.message || err);
    return [];
  }
}

async function readFilePathsWindows(runtime) {
  const exec = runtime.exec || execFileP;
  const cmd = '$out = Get-Clipboard -Format FileDropList; if ($out) { $out | ForEach-Object { $_.FullName } }';
  try {
    const { stdout } = await exec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { maxBuffer: MAX_BUFFER },
    );
    return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function parseUriList(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))
    .filter((s) => s.startsWith('file://'))
    .map((uri) => {
      try { return decodeURIComponent(uri.slice('file://'.length)); }
      catch { return null; }
    })
    .filter(Boolean);
}

async function readFilePathsLinux(runtime) {
  const env = runtime.env || process.env;
  const exec = runtime.exec || execFileP;
  const wayland = Boolean(env.WAYLAND_DISPLAY);
  const attempts = wayland
    ? [['wl-paste', ['--type', 'text/uri-list', '--no-newline']], ['xclip', ['-selection', 'clipboard', '-o', '-t', 'text/uri-list']]]
    : [['xclip', ['-selection', 'clipboard', '-o', '-t', 'text/uri-list']], ['wl-paste', ['--type', 'text/uri-list', '--no-newline']]];

  for (const [cmd, args] of attempts) {
    try {
      const { stdout } = await exec(cmd, args, { maxBuffer: MAX_BUFFER });
      const paths = parseUriList(stdout);
      if (paths.length > 0) return paths;
    } catch {}
  }
  return [];
}

async function readClipboardFilePaths(runtime = {}) {
  const platform = runtime.platform || process.platform;
  if (platform === 'darwin') return readFilePathsMac(runtime);
  if (platform === 'win32') return readFilePathsWindows(runtime);
  return readFilePathsLinux(runtime);
}

function dropsFilePath(osModule, cryptoModule, name) {
  return path.join(osModule.tmpdir(), 'mouseterm-drops', `${cryptoModule.randomUUID()}-${name}`);
}

async function readImageMac(out, runtime) {
  const exec = runtime.exec || execFileP;
  const script = [
    'try',
    '  set info to clipboard info',
    '  repeat with entry in info',
    '    if (item 1 of entry) is «class furl» then return ""',
    '  end repeat',
    'end try',
    'try',
    `  set f to open for access POSIX file "${out.replace(/"/g, '\\"')}" with write permission`,
    '  write (the clipboard as «class PNGf») to f',
    '  close access f',
    '  return "ok"',
    'on error',
    '  try',
    '    close access f',
    '  end try',
    '  return ""',
    'end try',
  ].join('\n');
  try {
    const { stdout } = await exec('osascript', ['-e', script], { maxBuffer: MAX_BUFFER });
    debugLog('image script stdout:', JSON.stringify(stdout));
    return stdout.trim() === 'ok';
  } catch (err) {
    debugLog('image script error:', err && err.message || err);
    return false;
  }
}

async function readImageWindows(out, runtime) {
  const exec = runtime.exec || execFileP;
  const cmd = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    'Add-Type -AssemblyName System.Drawing;',
    '$img = [System.Windows.Forms.Clipboard]::GetImage();',
    `if ($img) { $img.Save('${out.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png); 'ok' } else { '' }`,
  ].join(' ');
  try {
    const { stdout } = await exec(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', cmd],
      { maxBuffer: MAX_BUFFER },
    );
    return stdout.trim() === 'ok';
  } catch {
    return false;
  }
}

async function readImageLinux(out, runtime, fsp) {
  const env = runtime.env || process.env;
  const spawnFn = runtime.spawn || spawn;
  const wayland = Boolean(env.WAYLAND_DISPLAY);
  const attempts = wayland
    ? [['wl-paste', ['--type', 'image/png']], ['xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o']]]
    : [['xclip', ['-selection', 'clipboard', '-t', 'image/png', '-o']], ['wl-paste', ['--type', 'image/png']]];

  for (const [cmd, args] of attempts) {
    const buf = await collectSpawnStdout(spawnFn, cmd, args);
    if (buf && buf.length > 0) {
      await fsp.writeFile(out, buf);
      return true;
    }
  }
  return false;
}

async function readClipboardImageAsFilePath(runtime = {}) {
  const platform = runtime.platform || process.platform;
  const osModule = runtime.osModule || os;
  const cryptoModule = runtime.cryptoModule || crypto;
  const fsp = (runtime.fsModule && runtime.fsModule.promises) || fs.promises;

  const out = dropsFilePath(osModule, cryptoModule, 'clipboard.png');
  try {
    await ensureDir(path.dirname(out), fsp);
  } catch {
    return null;
  }

  let ok = false;
  if (platform === 'darwin') ok = await readImageMac(out, runtime);
  else if (platform === 'win32') ok = await readImageWindows(out, runtime);
  else ok = await readImageLinux(out, runtime, fsp);

  if (ok && await fileNonEmpty(out, fsp)) return out;
  await silentUnlink(out, fsp);
  return null;
}

async function saveDroppedBytesToTempFile(bytes, filename, runtime = {}) {
  const osModule = runtime.osModule || os;
  const cryptoModule = runtime.cryptoModule || crypto;
  const fsp = (runtime.fsModule && runtime.fsModule.promises) || fs.promises;
  const dir = tempDropsDir(osModule);
  await ensureDir(dir, fsp);
  const name = sanitizeFilename(filename);
  const out = path.join(dir, `${cryptoModule.randomUUID()}-${name}`);
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  await fsp.writeFile(out, buf);
  return out;
}

module.exports = {
  readClipboardFilePaths,
  readClipboardImageAsFilePath,
  saveDroppedBytesToTempFile,
  sanitizeFilename,
  tempDropsDir,
  parseUriList,
};
