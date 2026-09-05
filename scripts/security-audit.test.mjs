import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(join(repo, '.github/workflows/security-audit.yaml'), 'utf8');
const fragments = workflow.match(/^\s+AUDIT_FRAGMENTS: (.+)$/m)[1].split(/\s+/);
const publishedSinks = workflow.match(/          path: \|\n((?:            .*\n)+)/)[1]
  .trim().split('\n').map((line) => line.trim().replace('${{ runner.temp }}/', ''));

// Execute the shipped block, so changes to its parser or guards reach these tests.
function runBlock(name) {
  const step = workflow.indexOf(`      - name: ${name}\n`);
  assert.ok(step >= 0, `missing workflow step ${name}`);
  const start = workflow.indexOf('        run: |\n', step);
  assert.ok(start >= 0, `missing run block for ${name}`);
  const lines = workflow.slice(start + '        run: |\n'.length).split('\n');
  const body = [];
  for (const line of lines) {
    if (line && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dormouse-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(join(repo, 'scripts/clamp-issue-body.mjs'), join(dir, 'scripts/clamp-issue-body.mjs'));
  const env = { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, RUNNER_TEMP: dir,
    AUDIT_FRAGMENTS: fragments.join(' '), GITHUB_REPOSITORY: 'fixture/repo', GITHUB_RUN_ID: '123',
    AUDIT_PAT: 'fixture-admin-token', CLAUDE_CODE_OAUTH_TOKEN: 'fixture-oauth-token' };
  return { dir, env };
}

function stub(dir, name, source) {
  writeFileSync(join(dir, 'bin', name), `#!${process.execPath}\n${source}\n`, { mode: 0o755 });
}

const reporting = runBlock('Surface result, file or close issue');
const cases = [
  { name: 'all checks pass', status: 'PASS\n', verdicts: ['PASS', 'PASS', 'PASS'], expected: 'PASS' },
  { name: 'missing merged verdict', verdicts: ['PASS', 'PASS', 'PASS'], expected: 'INCONCLUSIVE' },
  { name: 'embedded whitespace is not PASS', status: 'P A\nSS\n', verdicts: ['PASS', 'PASS', 'PASS'], expected: 'INCONCLUSIVE' },
  { name: 'PASS prefix with a suffix is unreadable', status: 'PASS', verdicts: ['PASS but unfinished', 'PASS', 'PASS'], expected: 'INCONCLUSIVE' },
  { name: 'missing fragment', status: 'PASS', verdicts: [null, 'PASS', 'PASS'], expected: 'INCONCLUSIVE' },
  { name: 'unverifiable checks override merged PASS', status: 'PASS', verdicts: ['INCONCLUSIVE', 'PASS', 'PASS'], expected: 'INCONCLUSIVE' },
  { name: 'dissent overrides missing merged verdict', verdicts: ['FAIL', 'PASS', 'PASS'], expected: 'FAIL' },
  { name: 'FAIL with explanation overrides merged PASS', status: 'PASS', verdicts: ['FAIL — credential leaked', 'PASS', 'PASS'], expected: 'FAIL' },
  { name: 'FAIL with explanation overrides missing merged verdict', verdicts: ['FAIL — credential leaked', 'PASS', 'PASS'], expected: 'FAIL' },
  { name: 'FAIL records every incomplete condition', status: 'FAIL', verdicts: [null, 'garbled', 'INCONCLUSIVE'], expected: 'FAIL', notes: ['left no report', 'could not be read', 'could not determine every check'] },
  { name: 'dissent and incomplete domains coexist', status: 'PASS', verdicts: ['FAIL', null, 'INCONCLUSIVE'], expected: 'FAIL', notes: ['returned `FAIL`', 'left no report', 'could not determine every check'] },
];
for (const scenario of cases) {
  test(`reporting: ${scenario.name}`, (t) => {
    const { dir, env } = fixture(t);
    stub(dir, 'gh', `
      const fs = require('node:fs');
      const args = process.argv.slice(2);
      fs.appendFileSync('gh-calls.jsonl', JSON.stringify(args) + '\\n');
      if (args[0] === 'issue' && args[1] === 'list') process.stdout.write('23\\n');
    `);
    if (scenario.status !== undefined) writeFileSync(join(dir, 'audit-status.txt'), scenario.status);
    writeFileSync(join(dir, 'audit-report.md'), '# Fixture report\n');
    scenario.verdicts.forEach((verdict, i) => {
      if (verdict !== null) writeFileSync(join(dir, fragments[i]), `VERDICT: ${verdict}\nEvidence\n`);
    });
    const result = spawnSync('bash', ['-c', reporting], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(result.status, scenario.expected === 'PASS' ? 0 : 1, result.stderr);
    const calls = readFileSync(join(dir, 'gh-calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(calls.some((args) => args[0] === 'issue' && args[1] === 'close'), scenario.expected === 'PASS');
    if (scenario.expected !== 'PASS') {
      const body = readFileSync(join(dir, 'audit-comment.md'), 'utf8');
      assert.match(body, scenario.expected === 'FAIL' ? /Audit failed/ : /Audit reached no usable verdict/);
      for (const note of scenario.notes ?? []) assert.ok(body.includes(note), `missing note: ${note}`);
    }
  });
}

test('redaction covers every published sink', (t) => {
  const { dir, env } = fixture(t);
  const sinks = publishedSinks;
  for (const sink of sinks) writeFileSync(join(dir, sink), `${env.AUDIT_PAT} ${env.CLAUDE_CODE_OAUTH_TOKEN}`);
  const result = spawnSync('bash', ['-c', runBlock('Redact secrets from agent output')], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  for (const sink of sinks) assert.equal(readFileSync(join(dir, sink), 'utf8'), '*** ***');
});

test('redactor failure removes every published sink', (t) => {
  const { dir, env } = fixture(t);
  const sinks = publishedSinks;
  for (const sink of sinks) writeFileSync(join(dir, sink), env.AUDIT_PAT);
  stub(dir, 'node', 'process.exit(1);');
  const result = spawnSync('bash', ['-c', runBlock('Redact secrets from agent output')], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  for (const sink of sinks) assert.equal(existsSync(join(dir, sink)), false, sink);
});

// 'FAIL \u2014 explained' pins the grammar against CI's: an appended explanation is
// still a finding, not an unreadable fragment. Status alone cannot tell the two
// apart (both exit 1), so that row also checks the message.
for (const [verdict, cliExit, expected] of [['PASS', 0, 0], ['FAIL', 0, 1], ['FAIL \u2014 explained', 0, 1], ['INCONCLUSIVE', 0, 1], ['PASS extra', 0, 1], ['PASS', 7, 1]]) {
  test(`local runner: ${verdict}, CLI exit ${cliExit}`, (t) => {
    const { dir, env } = fixture(t);
    copyFileSync(join(repo, 'scripts/security-audit-local.sh'), join(dir, 'scripts/security-audit-local.sh'));
    mkdirSync(join(dir, '.github/audit'), { recursive: true });
    for (const name of ['_preamble', 'orchestrator', 'supply-chain', 'ci-and-secrets', 'application-security']) {
      copyFileSync(join(repo, `.github/audit/${name}.md`), join(dir, `.github/audit/${name}.md`));
    }
    stub(dir, 'claude', `
      const fs = require('node:fs');
      const prompt = process.argv[3];
      const output = prompt.match(/\\*\\*Output file:\\*\\* \\x60([^\\x60]+)\\x60/)[1];
      fs.writeFileSync(output, ${JSON.stringify(`VERDICT: ${verdict}\nEvidence\n`)});
      process.exit(${cliExit});
    `);
    // The all-domains path calls run_domain in a conditional: Bash disables
    // errexit inside it, so a failed CLI needs an explicit return.
    const result = spawnSync('bash', ['scripts/security-audit-local.sh'], { cwd: dir, env, encoding: 'utf8' });
    assert.equal(result.status, expected, result.stderr);
    if (verdict.startsWith('FAIL')) {
      assert.ok(!result.stderr.includes('no readable verdict'), result.stderr);
    }
    for (const fragment of fragments) assert.ok(existsSync(join(dir, fragment)), fragment);
  });
}
