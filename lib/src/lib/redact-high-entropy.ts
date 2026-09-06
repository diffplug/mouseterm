/** One opaque-token shape: the alphabet, the length below which a sample is too
 * short to judge, and the bits/character above which it reads as random. Ordered
 * narrowest alphabet first, so a token is scored against the tightest one it fits.
 * Finite samples often fall below their alphabet's maximum entropy. */
interface TokenTier {
  readonly alphabet: RegExp;
  readonly minLength: number;
  readonly minEntropy: number;
  /** Remove encoding separators and fold case before measuring length or entropy. */
  readonly normalize: (value: string) => string;
}

const TIERS: readonly TokenTier[] = [
  {
    alphabet: /^[0-9a-f]+(?:[-_][0-9a-f]+)*$/i,
    minLength: 16,
    minEntropy: 3,
    normalize: (value) => value.replace(/[-_]/g, '').toLowerCase(),
  },
  { alphabet: /^[a-z2-7]+$/i, minLength: 16, minEntropy: 3.5, normalize: (value) => value.toLowerCase() },
  { alphabet: /^[A-Za-z0-9+/_-]+$/, minLength: 20, minEntropy: 4, normalize: (value) => value },
];

/** Shannon entropy in bits per character over an ASCII histogram. */
function entropyOf(value: string): number {
  const counts = new Uint32Array(128);
  for (let i = 0; i < value.length; i++) counts[value.charCodeAt(i)]++;
  let entropy = 0;
  for (let code = 0; code < counts.length; code++) {
    const count = counts[code];
    if (count === 0) continue;
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

/** Replace opaque ASCII tokens; this is a randomness heuristic, not a guarantee
 * that all secrets (or only secrets) are removed. Trailing padding joins the
 * replaced span but not the entropy estimate. */
export function redactHighEntropyTokens(text: string): string {
  return text.replace(/([A-Za-z0-9+/_-]{16,})(?:=+(?![A-Za-z0-9+/_=-]))?/g, (token, value: string) => {
    const tier = TIERS.find((t) => t.alphabet.test(value));
    if (!tier) return token;
    const counted = tier.normalize(value);
    if (counted.length < tier.minLength) return token;
    return entropyOf(counted) >= tier.minEntropy ? 'REDACTED' : token;
  });
}
