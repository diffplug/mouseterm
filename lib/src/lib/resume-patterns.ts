interface ResumePattern {
  name: string;
  regex: RegExp;
  extract: (match: RegExpMatchArray) => string;
}

const BUILTIN_PATTERNS: ResumePattern[] = [
  {
    name: 'codex',
    regex: /codex resume (\S+)/,
    extract: (m) => `codex resume ${m[1]}`,
  },
  {
    name: 'claude',
    regex: /claude --resume (\S+)/,
    extract: (m) => `claude --resume ${m[1]}`,
  },
  {
    name: 'claude-continue',
    regex: /claude --continue/,
    extract: () => 'claude --continue',
  },
];

/**
 * Scan the last 50 lines of scrollback for known resume commands.
 * Returns the full resume command string, or null if none found.
 */
export function detectResumeCommand(scrollback: string): string | null {
  const lines = scrollback.split('\n').slice(-50);
  const text = lines.join('\n');
  for (const pattern of BUILTIN_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) return pattern.extract(match);
  }
  return null;
}
