import { describe, it, expect } from 'vitest';
import { shellEscapePosix, shellEscapeWindows } from './shell-escape';

describe('shellEscapePosix', () => {
  it('wraps simple paths in single quotes', () => {
    expect(shellEscapePosix('/tmp/a.png')).toBe(`'/tmp/a.png'`);
  });

  it('handles spaces', () => {
    expect(shellEscapePosix('/tmp/a file.png')).toBe(`'/tmp/a file.png'`);
  });

  it('escapes embedded single quotes', () => {
    expect(shellEscapePosix(`it's.png`)).toBe(`'it'\\''s.png'`);
  });

  it('leaves double quotes untouched inside single quotes', () => {
    expect(shellEscapePosix('a"b.png')).toBe(`'a"b.png'`);
  });

  it('preserves backslashes as literal', () => {
    expect(shellEscapePosix('a\\b.png')).toBe(`'a\\b.png'`);
  });

  it('handles empty string', () => {
    expect(shellEscapePosix('')).toBe(`''`);
  });

  it('preserves unicode', () => {
    expect(shellEscapePosix('/tmp/café.png')).toBe(`'/tmp/café.png'`);
  });
});

describe('shellEscapeWindows', () => {
  it('wraps in double quotes', () => {
    expect(shellEscapeWindows('C:\\Users\\a.png')).toBe(`"C:\\Users\\a.png"`);
  });

  it('doubles embedded double quotes', () => {
    expect(shellEscapeWindows('a"b.png')).toBe(`"a""b.png"`);
  });

  it('handles spaces', () => {
    expect(shellEscapeWindows('C:\\a file.png')).toBe(`"C:\\a file.png"`);
  });

  it('handles empty string', () => {
    expect(shellEscapeWindows('')).toBe(`""`);
  });
});
