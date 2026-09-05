const test = require('node:test');
const assert = require('node:assert/strict');
const { create, getDescendantPids } = require('./pty-core');

test('process inspection fails closed while ordinary port discovery remains fail-soft', () => {
  const runtime = { platform: 'darwin', execFileSync() { throw new Error('ps failed'); } };
  assert.deepEqual(getDescendantPids(42, runtime), [42]);
  assert.throws(() => getDescendantPids(42, { ...runtime, strict: true }), /inspect/);
});

test('helper ownership survives a live listing and promotion preserves the PTY and replay', () => {
  const events = [];
  const spawned = [];
  const manager = create((event, data) => events.push({ event, data }), {
    spawn() {
      const terminal = { pid: 42, write() {}, resize() {}, kill() {}, onData(callback) { this.output = callback; }, onExit() {} };
      spawned.push(terminal); return terminal;
    },
  }, { replay: true });
  manager.spawn('parent');
  manager.spawn('helper', { helper: { parentId: 'parent', command: 'git status' } });
  spawned[1].output('unsaved editor text');
  manager.list();
  assert.deepEqual(events.findLast(e => e.event === 'list').data.ptys[1].helper, { parentId: 'parent', command: 'git status' });
  assert.equal(events.findLast(e => e.event === 'replay').data.data, 'unsaved editor text');
  manager.context({ op: 'promote', id: 'helper' }, 'promote-1');
  manager.list();
  assert.equal(events.findLast(e => e.event === 'list').data.ptys[1].helper, undefined);
  assert.equal(spawned.length, 2);
  assert.equal(events.findLast(e => e.event === 'replay').data.data, 'unsaved editor text');
  manager.context({ op: 'promote', id: 'helper', restore: { parentId: 'parent', command: 'git status' } }, 'restore-1');
  manager.list();
  assert.equal(events.findLast(e => e.event === 'list').data.ptys[1].helper.parentId, 'parent');
  manager.context({ op: 'promote', id: 'parent', restore: { parentId: 'parent', command: '' } }, 'invalid-self');
  assert.match(events.at(-1).data.error, /Invalid helper owner/);
  manager.spawn('other');
  manager.context({ op: 'promote', id: 'other', restore: { parentId: 'parent', command: '' } }, 'invalid-duplicate');
  assert.match(events.at(-1).data.error, /Invalid helper owner/);
  manager.killAll();
});

test('a helper cannot own another helper or reference an absent owner', () => {
  const events = []; let spawns = 0;
  const manager = create((event, data) => events.push({ event, data }), {
    spawn() { spawns++; return { pid: 42, write() {}, resize() {}, kill() {}, onData() {}, onExit() {} }; },
  });
  manager.spawn('parent');
  manager.spawn('helper', { helper: { parentId: 'parent', command: '' } });
  manager.spawn('nested', { helper: { parentId: 'helper', command: '' } });
  manager.spawn('orphan', { helper: { parentId: 'missing', command: '' } });
  assert.equal(spawns, 2);
  assert.deepEqual(events.filter(e => e.event === 'exit').map(e => e.data.id), ['nested', 'orphan']);
  manager.killAll();
});

test('directory opening rejects relative paths and malformed input', () => {
  const events = [];
  const manager = create((event, data) => events.push({ event, data }), { spawn() { throw new Error('unexpected spawn'); } });
  for (const path of ['../secret', '$(echo unsafe)', '/tmp\0ignored', null]) {
    manager.context({ op: 'openDirectory', id: 'parent', path }, 'directory');
    assert.match(events.at(-1).data.error, /unavailable/);
  }
});
