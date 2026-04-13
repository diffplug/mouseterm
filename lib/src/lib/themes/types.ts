export interface MouseTermTheme {
  /** Stable unique ID, e.g. "GitHub.github-vscode-theme.dark-default" or "builtin.dark-plus" */
  id: string;
  /** Human-readable label from the VSCode theme */
  label: string;
  /** Theme base type */
  type: 'dark' | 'light';
  /** Background color for picker swatch (editor.background) */
  swatch: string;
  /** Accent color for picker dot (focusBorder) */
  accent: string;
  /** --vscode-* CSS variable overrides */
  vars: Record<string, string>;
  /** Where this theme came from */
  origin: BundledOrigin | InstalledOrigin;
}

export interface BundledOrigin {
  kind: 'bundled';
}

export interface InstalledOrigin {
  kind: 'installed';
  /** OpenVSX namespace/name, e.g. "dracula-theme/theme-dracula" */
  extensionId: string;
  /** ISO date string */
  installedAt: string;
}
