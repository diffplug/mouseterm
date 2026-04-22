import { IS_MAC } from './platform';

function detectIsWindows(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = (nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '').toLowerCase();
  return p.includes('win');
}

export function shellEscapePosix(input: string): string {
  if (input === '') return "''";
  return `'${input.replace(/'/g, `'\\''`)}'`;
}

export function shellEscapeWindows(input: string): string {
  return `"${input.replace(/"/g, '""')}"`;
}

export function shellEscapePath(input: string): string {
  if (!IS_MAC && detectIsWindows()) return shellEscapeWindows(input);
  return shellEscapePosix(input);
}
