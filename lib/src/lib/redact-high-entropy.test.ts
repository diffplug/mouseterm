import { describe, expect, it } from 'vitest';
import { redactHighEntropyTokens } from './redact-high-entropy';

describe('redactHighEntropyTokens', () => {
  it.each([
    ['hex', '8b7d0c4e9f2a61035e8c9d1f04a76b23'],
    ['uppercase hex', '8B7D0C4E9F2A61035E8C9D1F04A76B23'],
    ['base32', 'K7QW2MXP5RZV3NAT6YHC4BSD'],
    ['lowercase base32', 'k7qw2mxp5rzv3nat6yhc4bsd'],
    ['padded base32', 'K7QW2MXP5RZV3NAT6YHC4BSD======'],
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
    'pnpm test: build finished',
    'internationalization configuration',
    'orchard velvet canoe lantern',
    '构建完成。終了コード：０',
    'deadbeef 01234567 aB3dE6gH9jK2',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'abababababababababababababababab',
    '12312312312312312312312312312312',
  ])('preserves ordinary, short, or low-entropy text: %s', (text) => {
    expect(redactHighEntropyTokens(text)).toBe(text);
  });

  it('handles long tokens without truncating the entropy calculation', () => {
    expect(redactHighEntropyTokens('8b7d0c4e9f2a6103'.repeat(10_000))).toBe('REDACTED');
    expect(redactHighEntropyTokens('x'.repeat(100_000))).toBe('x'.repeat(100_000));
  });
});
