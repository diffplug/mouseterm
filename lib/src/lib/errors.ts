/** A rejection as something a user can read: an `Error`'s message when it has
 *  one, otherwise the value itself stringified (so an empty-message `Error`
 *  still reports as `Error` rather than as a blank line). */
export function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error);
}
