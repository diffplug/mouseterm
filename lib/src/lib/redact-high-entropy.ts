/** Replace opaque ASCII tokens; this is a randomness heuristic, not a guarantee
 * that all secrets (or only secrets) are removed. Runs in linear time with a
 * fixed-size histogram, without dictionaries, network access, or platform APIs. */
export function redactHighEntropyTokens(text: string): string {
  return text.replace(/[A-Za-z0-9+/_-]+=*/g, (token) => {
    // Keep padding in the replacement span, but not in the entropy estimate.
    const value = token.replace(/=+$/, '');
    if (value.length < 16) return token;

    // Use the narrowest matching alphabet. Hex/base32 are case-insensitive;
    // base64/base64url are not. Minimum lengths and bits/character cutoffs:
    // hex 16 / 3.0, base32 16 / 3.5, base64 20 / 4.0. These are heuristic
    // thresholds: finite samples do not reach their alphabet's maximum entropy.
    const hex = /^[0-9a-f]+$/i.test(value);
    const base32 = !hex && /^[a-z2-7]+$/i.test(value);
    if (!hex && !base32 && value.length < 20) return token;
    const normalized = hex || base32 ? value.toLowerCase() : value;
    const counts = new Uint32Array(128);
    for (let i = 0; i < normalized.length; i++) counts[normalized.charCodeAt(i)]++;
    let entropy = 0;
    for (const count of counts) {
      if (count === 0) continue;
      const probability = count / normalized.length;
      entropy -= probability * Math.log2(probability);
    }
    return entropy >= (hex ? 3 : base32 ? 3.5 : 4) ? 'REDACTED' : token;
  });
}
