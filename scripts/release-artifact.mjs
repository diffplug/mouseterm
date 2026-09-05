import { chmodSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function relativePath(path) {
  if (!path || path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\r\n:]/.test(path)) {
    throw new Error(`Invalid artifact path: ${JSON.stringify(path)}`);
  }
  return path;
}

function lines(file) {
  return readFileSync(file, 'utf8').trimEnd().split('\n');
}

/** Hash verification alone does not reject extra code injected into a cached app. */
export function verifyInventory(root, manifestName = 'artifact-manifest.sha256') {
  relativePath(manifestName);
  const actual = new Set();
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir)) {
      const path = prefix + name;
      relativePath(path);
      const stat = lstatSync(join(root, path));
      if (stat.isDirectory()) walk(join(root, path), `${path}/`);
      else if (stat.isFile()) actual.add(path);
      else throw new Error(`Artifact contains a symlink or special file: ${path}`);
    }
  }
  walk(root);
  if (!actual.delete(manifestName)) throw new Error('Artifact manifest is missing');
  const listed = new Set();
  for (const line of lines(join(root, manifestName))) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
    if (!match) throw new Error('Malformed SHA-256 manifest record');
    const path = relativePath(match[2]);
    if (listed.has(path)) throw new Error(`Duplicate manifest path: ${path}`);
    listed.add(path);
    if (!actual.delete(path)) throw new Error(`Manifest file is missing: ${path}`);
  }
  if (actual.size) throw new Error(`Unlisted artifact files: ${[...actual].join(', ')}`);

  const metadata = 'artifact-executables.txt';
  if (listed.has(metadata)) {
    const executables = readFileSync(join(root, metadata), 'utf8');
    const seen = new Set();
    for (const path of executables ? executables.replace(/\n$/, '').split('\n') : []) {
      relativePath(path);
      if (!listed.has(path) || path === metadata) throw new Error(`Unlisted executable: ${path}`);
      if (seen.has(path)) throw new Error(`Duplicate executable: ${path}`);
      seen.add(path);
    }
  }
}

/** Only call on a working copy whose manifest and hashes have been verified. */
export function restoreExecutables(root) {
  verifyInventory(root);
  const content = readFileSync(join(root, 'artifact-executables.txt'), 'utf8');
  for (const path of content ? content.replace(/\n$/, '').split('\n') : []) {
    chmodSync(join(root, path), 0o755);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [command, root] = process.argv.slice(2);
    if (!root || !['verify', 'restore'].includes(command)) throw new Error('Usage: release-artifact.mjs verify|restore ARTIFACT_DIR');
    if (command === 'verify') verifyInventory(root);
    else restoreExecutables(root);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
