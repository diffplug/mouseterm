/** The shape guard every untrusted-blob reader starts from: a plain object, so
 *  arrays and `null` are rejected before any field is read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
