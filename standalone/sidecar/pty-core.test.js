const test = require('node:test');
const assert = require('node:assert/strict');

const { create, getCwdForPid, parseCwdFromLsof, resolveSpawnConfig } = require('./pty-core');

test('resolveSpawnConfig uses POSIX shell and home defaults', () => {
  const config = resolveSpawnConfig(undefined, {
    platform: 'linux',
    env: {},
    osModule: {
      homedir: () => '/home/tester',
      tmpdir: () => '/tmp/fallback',
    },
  });

  assert.equal(config.shell, '/bin/sh');
  assert.equal(config.cwd, '/home/tester');
  assert.equal(config.cwdWarning, null);
  assert.equal(config.cols, 80);
  assert.equal(config.rows, 30);
  assert.equal(config.env.TERM_PROGRAM, 'MouseTerm');
  assert.deepEqual(config.loginArg, ['-sh']);
});

test('resolveSpawnConfig uses Windows shell and profile defaults', () => {
  const config = resolveSpawnConfig(undefined, {
    platform: 'win32',
    env: {},
    osModule: {
      homedir: () => 'C:\\Users\\tester',
      tmpdir: () => 'C:\\Temp',
    },
  });

  assert.equal(config.shell, 'C:\\Windows\\System32\\cmd.exe');
  assert.equal(config.cwd, 'C:\\Users\\tester');
  assert.equal(config.cwdWarning, null);
  assert.equal(config.env.TERM_PROGRAM, 'MouseTerm');
  assert.deepEqual(config.loginArg, []);
});

test('resolveSpawnConfig preserves explicit cwd', () => {
  const config = resolveSpawnConfig(
    { cwd: '/workspace', cols: 120, rows: 40 },
    {
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      fsModule: {
        statSync: () => ({ isDirectory: () => true }),
      },
      osModule: {
        homedir: () => '/home/tester',
        tmpdir: () => '/tmp/fallback',
      },
    },
  );

  assert.equal(config.shell, '/bin/bash');
  assert.equal(config.cwd, '/workspace');
  assert.equal(config.cwdWarning, null);
  assert.equal(config.cols, 120);
  assert.equal(config.rows, 40);
  assert.deepEqual(config.loginArg, ['-bash']);
});

test('resolveSpawnConfig falls back to the default directory when explicit cwd is missing', () => {
  const config = resolveSpawnConfig(
    { cwd: '/gone', cols: 120, rows: 40 },
    {
      platform: 'linux',
      env: { SHELL: '/bin/bash' },
      fsModule: {
        statSync: () => { throw new Error('ENOENT'); },
      },
      osModule: {
        homedir: () => '/home/tester',
        tmpdir: () => '/tmp/fallback',
      },
    },
  );

  assert.equal(config.shell, '/bin/bash');
  assert.equal(config.cwd, '/home/tester');
  assert.equal(config.cwdWarning, 'unable to restore because directory /gone was removed');
  assert.equal(config.cols, 120);
  assert.equal(config.rows, 40);
});

test('create buffers scrollback for getScrollback requests', () => {
  const events = [];
  const listeners = {};
  const fakePty = {
    pid: 123,
    onData(handler) { listeners.data = handler; },
    onExit(handler) { listeners.exit = handler; },
    resize() {},
    write() {},
    kill() {},
  };

  const mgr = create((event, data) => {
    events.push({ event, data });
  }, {
    spawn() {
      return fakePty;
    },
  });

  mgr.spawn('pane-1');
  listeners.data?.('hello');
  listeners.data?.(' world');
  mgr.getScrollback('pane-1', 'req-1');

  assert.deepEqual(events.at(-1), {
    event: 'scrollback',
    data: { id: 'pane-1', data: 'hello world', requestId: 'req-1' },
  });
});

test('parseCwdFromLsof returns the cwd for the requested pid', () => {
  const output = [
    'p100',
    'fcwd',
    'n/',
    'p4242',
    'fcwd',
    'n/home/tester/project',
    '',
  ].join('\n');

  assert.equal(parseCwdFromLsof(output, 4242), '/home/tester/project');
});

test('getCwdForPid uses lsof with -a and parses the target pid cwd', () => {
  const calls = [];
  const cwd = getCwdForPid(4242, {
    fsModule: {
      readlinkSync: () => { throw new Error('ENOENT'); },
    },
    execFileSync(file, args, options) {
      calls.push({ file, args, options });
      return [
        'p100',
        'fcwd',
        'n/',
        'p4242',
        'fcwd',
        'n/home/tester/project',
        '',
      ].join('\n');
    },
  });

  assert.equal(cwd, '/home/tester/project');
  assert.deepEqual(calls, [{
    file: 'lsof',
    args: ['-a', '-d', 'cwd', '-p', '4242', '-Fn'],
    options: { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
  }]);
});
