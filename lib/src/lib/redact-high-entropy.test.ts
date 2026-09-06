import { describe, expect, it } from 'vitest';
import { redactHighEntropyTokens } from './redact-high-entropy';

describe('redactHighEntropyTokens', () => {
  it.each([
    ['hex', '8b7d0c4e9f2a61035e8c9d1f04a76b23'],
    ['uppercase hex', '8B7D0C4E9F2A61035E8C9D1F04A76B23'],
    ['base32', 'K7QW2MXP5RZV3NAT6YHC4BSD'],
    ['lowercase base32', 'k7qw2mxp5rzv3nat6yhc4bsd'],
    ['base64', 'k8Xq+W2m/P5rZ9vN3aT6yHc4BsD0EfGj'],
    ['padded base64', 'k8Xq+W2m/P5rZ9vN3aT6yA=='],
    ['base64url', 'k8Xq-W2m_P5rZ9vN3aT6yHc4BsD0EfGj'],
    ['prefixed token', 'ghp_k8XqW2mP5rZ9vN3aT6yHc4BsD0EfGj'],
  ])('redacts an entire %s token', (_kind, token) => {
    expect(redactHighEntropyTokens(`key="${token}" done`)).toBe('key="REDACTED" done');
  });

  it('replaces every occurrence while preserving surrounding text', () => {
    const token = '8b7d0c4e9f2a61035e8c9d1f04a76b23';
    expect(redactHighEntropyTokens(`first=${token}; second=${token}!`))
      .toBe('first=REDACTED; second=REDACTED!');
  });

  it.each([
    ['ordinary text', 'pnpm test: build finished'],
    ['a long word under every entropy cutoff', 'internationalization configuration'],
    ['non-ASCII text', '构建完成。終了コード：０'],
    ['a uniform run', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  ])('preserves %s', (_kind, text) => {
    expect(redactHighEntropyTokens(text)).toBe(text);
  });

  // Each pair below moves one constant in `TIERS` across its boundary; without
  // them the narrower tiers are indistinguishable from the base64 tier alone.
  it.each([
    ['hex at the 3.0 cutoff', '8b7d0c4e8b7d0c4e', true],
    ['hex below it', '8b7d0c4e8b7d0c4d', false],
    ['16-char base32, too short for the base64 tier', 'K7QW2MXP5RZV3NAT', true],
    ['16-char base32 below the 3.5 cutoff', 'k7qw2mxpk7qw2mxp', false],
    ['16-char base64, too short for any tier', 'k8Xq+W2m/P5rZ9vN', false],
  ])('%s: redacted=%s', (_kind, token, redacted) => {
    expect(redactHighEntropyTokens(token)).toBe(redacted ? 'REDACTED' : token);
  });

  it('folds case on case-insensitive alphabets, so `A` and `a` are one symbol', () => {
    // 3.5 bits counted as 16 distinct symbols, 2.75 counted as the 8 hex digits
    // it actually carries — only the folded score is below the 3.0 hex cutoff.
    expect(redactHighEntropyTokens('aAbBcCdDeEfF0000')).toBe('aAbBcCdDeEfF0000');
  });

  it('scores the whole token, never a prefix', () => {
    const token = `8b7d0c4e9f2a6103${'a'.repeat(10_000)}`;
    expect(redactHighEntropyTokens(token)).toBe(token);
  });
});
