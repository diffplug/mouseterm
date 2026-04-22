const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  readClipboardFilePaths,
  readClipboardImageAsFilePath,
  parseUriList,
  splitNonEmptyLines,
} = require('./clipboard-ops');

function fakeOs(tmp = '/tmp/test') {
  return { tmpdir: () => tmp };
}

function fakeCrypto(uuid = 'uuid-0') {
  return { randomUUID: () => uuid };
}

function fakeFs() {
  const writes = [];
  const files = new Map();
  const unlinks = [];
  const chmods = [];
  const rmdirs = [];
  return {
    writes,
    files,
    unlinks,
    chmods,
    rmdirs,
    module: {
      promises: {
        async mkdtemp(prefix) { return `${prefix}dir-0`; },
        async chmod(p, mode) { chmods.push([p, mode]); },
        async writeFile(p, buf, opts) { writes.push([p, buf, opts]); files.set(p, buf); },
        async stat(p) {
          const b = files.get(p);
          if (!b) throw new Error('ENOENT');
          return { size: b.length };
        },
        async unlink(p) { unlinks.push(p); files.delete(p); },
        async rmdir(p) { rmdirs.push(p); },
      },
    },
  };
}

test('splitNonEmptyLines preserves leading and trailing path spaces', () => {
  assert.deepEqual(splitNonEmptyLines(' /tmp/leading.png\n/tmp/trailing.png \n'), [
    ' /tmp/leading.png',
    '/tmp/trailing.png ',
  ]);
});

test('parseUriList decodes file URIs and ignores comments/non-file', () => {
  const input = [
    '# comment',
    'file:///Users/me/a%20file.png',
    'file:///tmp/plain.txt',
    'https://example.com/nope',
    '',
  ].join('\n');
  assert.deepEqual(parseUriList(input), [
    '/Users/me/a file.png',
    '/tmp/plain.txt',
  ]);
});

test('readClipboardFilePaths on mac parses osascript linefeed-separated output', async () => {
  const paths = await readClipboardFilePaths({
    platform: 'darwin',
    exec: async (cmd, args) => {
      assert.equal(cmd, 'osascript');
      assert.equal(args[0], '-e');
      return { stdout: '/Users/me/a.png\n/Users/me/b.jpg\n' };
    },
  });
  assert.deepEqual(paths, ['/Users/me/a.png', '/Users/me/b.jpg']);
});

test('readClipboardFilePaths on mac returns [] when osascript fails', async () => {
  const paths = await readClipboardFilePaths({
    platform: 'darwin',
    exec: async () => { throw new Error('boom'); },
  });
  assert.deepEqual(paths, []);
});

test('readClipboardFilePaths on windows parses FileDropList lines', async () => {
  const paths = await readClipboardFilePaths({
    platform: 'win32',
    exec: async (cmd) => {
      assert.equal(cmd, 'powershell');
      return { stdout: 'C:\\a.png\r\nC:\\b.jpg\r\n' };
    },
  });
  assert.deepEqual(paths, ['C:\\a.png', 'C:\\b.jpg']);
});

test('readClipboardFilePaths on linux prefers xclip in X11 and parses file URIs', async () => {
  const calls = [];
  const paths = await readClipboardFilePaths({
    platform: 'linux',
    env: {},
    exec: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'xclip') return { stdout: 'file:///tmp/one.png\nfile:///tmp/two.png\n' };
      throw new Error('should not reach');
    },
  });
  assert.deepEqual(paths, ['/tmp/one.png', '/tmp/two.png']);
  assert.equal(calls[0][0], 'xclip');
});

test('readClipboardFilePaths on linux prefers wl-paste under Wayland', async () => {
  const calls = [];
  const paths = await readClipboardFilePaths({
    platform: 'linux',
    env: { WAYLAND_DISPLAY: 'wayland-0' },
    exec: async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'wl-paste') return { stdout: 'file:///tmp/w.png\n' };
      throw new Error('should not reach');
    },
  });
  assert.deepEqual(paths, ['/tmp/w.png']);
  assert.equal(calls[0][0], 'wl-paste');
});

test('readClipboardFilePaths on linux falls back when first tool fails', async () => {
  const paths = await readClipboardFilePaths({
    platform: 'linux',
    env: {},
    exec: async (cmd) => {
      if (cmd === 'xclip') throw new Error('no xclip');
      return { stdout: 'file:///tmp/fb.png\n' };
    },
  });
  assert.deepEqual(paths, ['/tmp/fb.png']);
});

test('readClipboardImageAsFilePath on mac returns temp path on success', async () => {
  const fs = fakeFs();
  const result = await readClipboardImageAsFilePath({
    platform: 'darwin',
    osModule: fakeOs('/t'),
    cryptoModule: fakeCrypto('uuid-I'),
    fsModule: fs.module,
    exec: async (cmd, args) => {
      assert.equal(cmd, 'osascript');
      const [, script] = args;
      const match = script.match(/POSIX file "([^"]+)"/);
      assert.ok(match, 'script should reference target path');
      fs.files.set(match[1], Buffer.from('fakepng'));
      return { stdout: 'ok\n' };
    },
  });
  assert.equal(result, path.join('/t', 'mouseterm-drops-dir-0', 'uuid-I-clipboard.png'));
  assert.deepEqual(fs.chmods, [
    [path.join('/t', 'mouseterm-drops-dir-0'), 0o700],
    [path.join('/t', 'mouseterm-drops-dir-0', 'uuid-I-clipboard.png'), 0o600],
  ]);
});

test('readClipboardImageAsFilePath returns null when osascript returns empty', async () => {
  const fs = fakeFs();
  const result = await readClipboardImageAsFilePath({
    platform: 'darwin',
    osModule: fakeOs('/t'),
    cryptoModule: fakeCrypto('uuid-I'),
    fsModule: fs.module,
    exec: async () => ({ stdout: '' }),
  });
  assert.equal(result, null);
  assert.deepEqual(fs.rmdirs, [path.join('/t', 'mouseterm-drops-dir-0')]);
});

test('readClipboardImageAsFilePath on linux writes buffer from exec stdout', async () => {
  const fs = fakeFs();
  const result = await readClipboardImageAsFilePath({
    platform: 'linux',
    env: {},
    osModule: fakeOs('/t'),
    cryptoModule: fakeCrypto('uuid-L'),
    fsModule: fs.module,
    exec: async (cmd) => {
      if (cmd === 'xclip') return { stdout: Buffer.from([0x89, 0x50, 0x4E, 0x47]) };
      throw new Error('no tool');
    },
  });
  assert.equal(result, path.join('/t', 'mouseterm-drops-dir-0', 'uuid-L-clipboard.png'));
  assert.equal(fs.writes.length, 1);
  assert.deepEqual(fs.writes[0][2], { mode: 0o600 });
});
