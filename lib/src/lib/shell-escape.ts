import { IS_MAC } from './platform';

const IS_WINDOWS: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '').toLowerCase();
  return p.includes('win');
})();

// Matches macOS Terminal's drag-and-drop format: backslash-escape each shell
// metacharacter instead of wrapping in quotes. TUIs like `claude` recognize
// backslash-escaped tokens as filesystem paths where a single-quoted whole
// path gets treated as opaque pasted text.
const POSIX_UNSAFE = /([ \t\n\r!"#$&'()*;<>?[\\\]`{|}~])/g;

export function shellEscapePosix(input: string): string {
  if (input === '') return "''";
  return input.replace(POSIX_UNSAFE, '\\$1');
}

export function shellEscapeWindows(input: string): string {
  return `"${input.replace(/"/g, '""')}"`;
}

export function shellEscapePath(input: string): string {
  return !IS_MAC && IS_WINDOWS ? shellEscapeWindows(input) : shellEscapePosix(input);
}
