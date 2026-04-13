#!/usr/bin/env node
/**
 * Download VSCode theme extensions from OpenVSX, extract theme JSONs,
 * and write lib/src/lib/themes/bundled.json.
 *
 * Usage: node scripts/bundle-themes.mjs
 *
 * Output is checked into git so builds don't require network access.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { parse as parseJsonc } from 'jsonc-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../src/lib/themes/bundled.json');

/** Extensions to download from OpenVSX. */
const EXTENSIONS = [
  { namespace: 'GitHub', name: 'github-vscode-theme' },
  { namespace: 'dracula-theme', name: 'theme-dracula' },
];

/**
 * VSCode theme color keys consumed by MouseTerm.
 * Keep in sync with lib/src/lib/themes/convert.ts.
 */
const CONSUMED_KEYS = new Set([
  'editor.background', 'editorGroupHeader.tabsBackground', 'sideBar.background',
  'editorWidget.background', 'editor.foreground', 'descriptionForeground',
  'focusBorder', 'panel.border',
  'tab.activeBackground', 'tab.inactiveBackground', 'tab.activeForeground',
  'tab.inactiveForeground', 'list.activeSelectionBackground', 'list.activeSelectionForeground',
  'terminal.background', 'terminal.foreground', 'badge.background', 'badge.foreground',
  'errorForeground', 'editorWarning.foreground',
  'input.background', 'input.border',
  'button.background', 'button.foreground', 'button.hoverBackground',
  'textLink.foreground',
  'terminalCursor.foreground', 'terminal.selectionBackground',
  'terminal.ansiBlack', 'terminal.ansiRed', 'terminal.ansiGreen', 'terminal.ansiYellow',
  'terminal.ansiBlue', 'terminal.ansiMagenta', 'terminal.ansiCyan', 'terminal.ansiWhite',
  'terminal.ansiBrightBlack', 'terminal.ansiBrightRed', 'terminal.ansiBrightGreen',
  'terminal.ansiBrightYellow', 'terminal.ansiBrightBlue', 'terminal.ansiBrightMagenta',
  'terminal.ansiBrightCyan', 'terminal.ansiBrightWhite',
]);

function convertColors(colors) {
  const vars = {};
  for (const [key, value] of Object.entries(colors)) {
    if (CONSUMED_KEYS.has(key)) {
      vars[`--vscode-${key.replace(/\./g, '-')}`] = value;
    }
  }
  return vars;
}

function uiThemeToType(uiTheme) {
  return uiTheme === 'vs' || uiTheme === 'hc-light' ? 'light' : 'dark';
}

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Read a UTF-8 file from the unzipped VSIX entries. */
function readEntry(entries, path) {
  // VSIX entries are prefixed with "extension/"
  const key = `extension/${path}`;
  const data = entries[key];
  if (!data) throw new Error(`Missing ${key} in VSIX`);
  return new TextDecoder().decode(data);
}

async function fetchExtensionThemes(namespace, name) {
  console.log(`Fetching ${namespace}/${name} from OpenVSX...`);

  // Get latest version metadata
  const metaRes = await fetch(`https://open-vsx.org/api/${namespace}/${name}/latest`);
  if (!metaRes.ok) throw new Error(`OpenVSX metadata failed: ${metaRes.status}`);
  const meta = await metaRes.json();

  const downloadUrl = meta.files?.download;
  if (!downloadUrl) throw new Error(`No download URL for ${namespace}/${name}`);

  console.log(`  Downloading VSIX (v${meta.version})...`);
  const vsixRes = await fetch(downloadUrl);
  if (!vsixRes.ok) throw new Error(`VSIX download failed: ${vsixRes.status}`);
  const vsixBuf = new Uint8Array(await vsixRes.arrayBuffer());

  console.log(`  Extracting...`);
  const entries = unzipSync(vsixBuf);

  // Read package.json to find theme contributions
  const pkgJson = JSON.parse(readEntry(entries, 'package.json'));
  const themeContribs = pkgJson.contributes?.themes ?? [];

  const themes = [];
  for (const contrib of themeContribs) {
    const themePath = contrib.path.replace(/^\.\//, '');
    console.log(`  Converting ${contrib.label} (${themePath})...`);

    const themeJson = parseJsonc(readEntry(entries, themePath));
    const colors = themeJson.colors ?? {};
    const vars = convertColors(colors);
    const type = uiThemeToType(contrib.uiTheme ?? themeJson.type ?? 'vs-dark');

    themes.push({
      id: `${namespace}.${name}.${slugify(contrib.label)}`,
      label: contrib.label,
      type,
      swatch: colors['editor.background'] ?? (type === 'light' ? '#ffffff' : '#1e1e1e'),
      accent: colors['focusBorder'] ?? (type === 'light' ? '#0090f1' : '#007fd4'),
      vars,
      origin: { kind: 'bundled' },
    });
  }

  console.log(`  Found ${themes.length} theme(s).`);
  return themes;
}

/** VSCode built-in Dark+ and Light+ (not on OpenVSX). */
function builtinThemes() {
  return [
    {
      id: 'builtin.dark-plus',
      label: 'Dark+ (default)',
      type: 'dark',
      swatch: '#1e1e1e',
      accent: '#007fd4',
      vars: {
        '--vscode-editor-background': '#1e1e1e',
        '--vscode-editor-foreground': '#cccccc',
        '--vscode-sideBar-background': '#252526',
        '--vscode-editorWidget-background': '#252526',
        '--vscode-descriptionForeground': '#858585',
        '--vscode-focusBorder': '#007fd4',
        '--vscode-panel-border': '#2b2b2b',
        '--vscode-tab-activeBackground': '#1e1e1e',
        '--vscode-tab-inactiveBackground': '#2d2d2d',
        '--vscode-tab-activeForeground': '#ffffff',
        '--vscode-tab-inactiveForeground': '#969696',
        '--vscode-list-activeSelectionBackground': '#094771',
        '--vscode-list-activeSelectionForeground': '#ffffff',
        '--vscode-terminal-background': '#1e1e1e',
        '--vscode-terminal-foreground': '#cccccc',
        '--vscode-badge-background': '#007acc',
        '--vscode-badge-foreground': '#ffffff',
        '--vscode-errorForeground': '#f48771',
        '--vscode-input-background': '#3c3c3c',
        '--vscode-input-border': '#3c3c3c',
        '--vscode-button-background': '#0e639c',
        '--vscode-button-foreground': '#ffffff',
        '--vscode-button-hoverBackground': '#1177bb',
        '--vscode-textLink-foreground': '#3794ff',
        '--vscode-terminal-ansiBlack': '#000000',
        '--vscode-terminal-ansiRed': '#cd3131',
        '--vscode-terminal-ansiGreen': '#0dbc79',
        '--vscode-terminal-ansiYellow': '#e5e510',
        '--vscode-terminal-ansiBlue': '#2472c8',
        '--vscode-terminal-ansiMagenta': '#bc3fbc',
        '--vscode-terminal-ansiCyan': '#11a8cd',
        '--vscode-terminal-ansiWhite': '#e5e5e5',
        '--vscode-terminal-ansiBrightBlack': '#666666',
        '--vscode-terminal-ansiBrightRed': '#f14c4c',
        '--vscode-terminal-ansiBrightGreen': '#23d18b',
        '--vscode-terminal-ansiBrightYellow': '#f5f543',
        '--vscode-terminal-ansiBrightBlue': '#3b8eea',
        '--vscode-terminal-ansiBrightMagenta': '#d670d6',
        '--vscode-terminal-ansiBrightCyan': '#29b8db',
        '--vscode-terminal-ansiBrightWhite': '#e5e5e5',
        '--vscode-terminalCursor-foreground': '#aeafad',
        '--vscode-terminal-selectionBackground': '#264f7840',
      },
      origin: { kind: 'bundled' },
    },
    {
      id: 'builtin.light-plus',
      label: 'Light+ (default)',
      type: 'light',
      swatch: '#ffffff',
      accent: '#0090f1',
      vars: {
        '--vscode-editor-background': '#ffffff',
        '--vscode-editor-foreground': '#333333',
        '--vscode-sideBar-background': '#f3f3f3',
        '--vscode-editorWidget-background': '#f3f3f3',
        '--vscode-descriptionForeground': '#717171',
        '--vscode-focusBorder': '#0090f1',
        '--vscode-panel-border': '#e5e5e5',
        '--vscode-tab-activeBackground': '#ffffff',
        '--vscode-tab-inactiveBackground': '#ececec',
        '--vscode-tab-activeForeground': '#333333',
        '--vscode-tab-inactiveForeground': '#8e8e8e',
        '--vscode-list-activeSelectionBackground': '#cce6ff',
        '--vscode-list-activeSelectionForeground': '#000000',
        '--vscode-terminal-background': '#ffffff',
        '--vscode-terminal-foreground': '#333333',
        '--vscode-badge-background': '#007acc',
        '--vscode-badge-foreground': '#ffffff',
        '--vscode-errorForeground': '#a1260d',
        '--vscode-input-background': '#ffffff',
        '--vscode-input-border': '#cecece',
        '--vscode-button-background': '#007acc',
        '--vscode-button-foreground': '#ffffff',
        '--vscode-button-hoverBackground': '#0062a3',
        '--vscode-textLink-foreground': '#006ab1',
        '--vscode-terminal-ansiBlack': '#000000',
        '--vscode-terminal-ansiRed': '#cd3131',
        '--vscode-terminal-ansiGreen': '#00bc00',
        '--vscode-terminal-ansiYellow': '#949800',
        '--vscode-terminal-ansiBlue': '#0451a5',
        '--vscode-terminal-ansiMagenta': '#bc05bc',
        '--vscode-terminal-ansiCyan': '#0598bc',
        '--vscode-terminal-ansiWhite': '#555555',
        '--vscode-terminal-ansiBrightBlack': '#666666',
        '--vscode-terminal-ansiBrightRed': '#cd3131',
        '--vscode-terminal-ansiBrightGreen': '#14ce14',
        '--vscode-terminal-ansiBrightYellow': '#b5ba00',
        '--vscode-terminal-ansiBrightBlue': '#0451a5',
        '--vscode-terminal-ansiBrightMagenta': '#bc05bc',
        '--vscode-terminal-ansiBrightCyan': '#0598bc',
        '--vscode-terminal-ansiBrightWhite': '#a5a5a5',
        '--vscode-terminalCursor-foreground': '#000000',
        '--vscode-terminal-selectionBackground': '#add6ff80',
      },
      origin: { kind: 'bundled' },
    },
  ];
}

async function main() {
  const allThemes = [...builtinThemes()];

  for (const ext of EXTENSIONS) {
    const themes = await fetchExtensionThemes(ext.namespace, ext.name);
    allThemes.push(...themes);
  }

  console.log(`\nWriting ${allThemes.length} themes to ${OUTPUT}`);
  writeFileSync(OUTPUT, JSON.stringify(allThemes, null, 2) + '\n');
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
