import { describe, expect, it } from 'vitest';
import { rewrap, __testing } from './rewrap';

const { isFrameOnlyLine, stripLeadingAndTrailingFrame } = __testing;

describe('isFrameOnlyLine', () => {
  it.each([
    ['┌──────┐', true],
    ['└──────┘', true],
    ['├──────┤', true],
    ['═══════', true],
    ['  │   │  ', true], // spaces + verticals is considered frame-like chrome
    ['│ foo │', false],
    ['foo', false],
    ['', false],
  ])('"%s" → %s', (input, expected) => {
    expect(isFrameOnlyLine(input)).toBe(expected);
  });

  it('a line of spaces-only is not considered a frame line', () => {
    expect(isFrameOnlyLine('   ')).toBe(false);
  });
});

describe('stripLeadingAndTrailingFrame', () => {
  it('strips left + right border chars along with one adjacent space', () => {
    expect(stripLeadingAndTrailingFrame('│ foo │')).toBe('foo');
  });
  it('strips heavy block chars along with one adjacent space', () => {
    expect(stripLeadingAndTrailingFrame('▌ hello ▐')).toBe('hello');
  });
  it('leaves normal text untouched', () => {
    expect(stripLeadingAndTrailingFrame('hello world')).toBe('hello world');
  });
  it('keeps inner whitespace after border strip', () => {
    expect(stripLeadingAndTrailingFrame('│  abc  │')).toBe(' abc ');
  });
});

describe('rewrap', () => {
  it('joins single-paragraph hard-wrapped text with spaces', () => {
    expect(rewrap('The quick brown\nfox jumps\nover the lazy dog.'))
      .toBe('The quick brown fox jumps over the lazy dog.');
  });

  it('preserves blank lines as paragraph separators', () => {
    expect(rewrap('Para one\nstill one.\n\nPara two\nalso two.'))
      .toBe('Para one still one.\n\nPara two also two.');
  });

  it('strips a simple box-drawing frame', () => {
    const boxed = [
      '┌─────────┐',
      '│ message │',
      '└─────────┘',
    ].join('\n');
    expect(rewrap(boxed)).toBe('message');
  });

  it('strips a double-line frame', () => {
    const boxed = [
      '╔═════════╗',
      '║  hello  ║',
      '║  world  ║',
      '╚═════════╝',
    ].join('\n');
    expect(rewrap(boxed)).toBe('hello world');
  });

  it('strips side borders on a table-like block', () => {
    const tbl = [
      '│ foo │',
      '│ bar │',
      '│ baz │',
    ].join('\n');
    // All three rows become non-blank lines and join into one paragraph.
    expect(rewrap(tbl)).toBe('foo bar baz');
  });

  it('leading/trailing whitespace on each line is trimmed', () => {
    expect(rewrap('  foo\n  bar  \n  baz  ')).toBe('foo bar baz');
  });

  it('empty string → empty', () => {
    expect(rewrap('')).toBe('');
  });

  it('only blank lines → empty', () => {
    expect(rewrap('\n\n\n')).toBe('');
  });

  it('single line unchanged', () => {
    expect(rewrap('Just one line.')).toBe('Just one line.');
  });

  it('multiple blank lines collapse to a single paragraph separator', () => {
    // Ambiguous case: the simple rule collapses any run of blanks to one
    // separator. That's acceptable for MVP.
    expect(rewrap('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });
});
