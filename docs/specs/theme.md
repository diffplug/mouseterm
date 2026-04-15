# Theme Spec

MouseTerm uses real VSCode themes in standalone and website mode. Bundled themes are extracted from actual VSCode theme extensions at build time. Users can also install additional themes from [OpenVSX](https://open-vsx.org/) at runtime.

## How it works

MouseTerm has a two-layer CSS variable theme system:

1. **`--vscode-*`** — the theme data. In VSCode extension mode, the editor injects these automatically. In standalone/website mode, `applyTheme()` sets them on `document.body`.
2. **`@theme --color-*`** — Tailwind tokens with fallbacks. Defined in `theme.css` as `--color-surface: var(--vscode-editor-background, #1e1e1e)`. Powers utility classes like `bg-surface`, `text-foreground`, `border-border`.

```
VSCode theme JSON              CSS variables                    Tailwind
─────────────────             ──────────────                   ────────
colors: {                     --vscode-editor-background       @theme --color-surface
  "editor.background": "#282a36" → set on body.style     →      → bg-surface
  "terminal.ansiRed": "#ff5555"  --vscode-terminal-ansiRed       (read by getTerminalTheme())
  ...                            ...
}
```

Two consumers read `--vscode-*` variables:
- **`@theme` fallbacks** in `theme.css` — for UI colors (surfaces, tabs, badges, buttons, text)
- **`getTerminalTheme()`** in `terminal-registry.ts` — reads ANSI colors, cursor, and selection directly as `--vscode-*` for xterm.js

A MutationObserver on `document.body` (in `terminal-registry.ts`) detects style changes and re-reads the theme for all xterm.js terminals. Dockview overrides and Tailwind classes update automatically because they reference `--color-*`.

### Cleanup from previous `--mt-*` layer

The old three-layer system (`--vscode-*` → `--mt-*` → `--color-*`) had a redundant middle layer. The `--mt-*` variables were a pure passthrough — every one was immediately re-exported as `--color-*` with no transformation. The cleanup:

- **Collapsed `--mt-*` into `@theme`**: `--color-surface: var(--vscode-editor-background, #1e1e1e)` directly, no intermediate variable.
- **Deleted 38 dead variables** (114 lines of CSS): `--mt-ansi-*` (32 colors), `--mt-terminal-cursor`, `--mt-terminal-selection`, `--mt-gutter`, `--mt-gutter-active`, `--mt-editor-font-size`, `--mt-editor-font-family`, `--mt-selection-workspace` were defined 3x each (dark/light/prefers-color-scheme) but never consumed. The ANSI colors are read directly as `--vscode-*` by `getTerminalTheme()`.
- **Eliminated duplicate mappings**: `--vscode-focusBorder` was aliased as `--mt-accent`, `--mt-gutter-active`, and `--mt-selection-terminal` — three names for one token. Now just `--color-accent`.
- **Dropped `testing.iconPassed` mapping**: `--mt-success-fg` stole `testing.iconPassed` as a generic success color. Most themes don't define this key, and it's the wrong semantic. `--color-success` now uses a hardcoded green.
- **Kept defensible cross-domain mappings**: `--color-tab-selected-bg/fg` ← `list.activeSelectionBackground/Foreground` (closest VSCode approximation of our command-mode tab selection). `--color-accent` ← `focusBorder` (most themes treat this as their brand/accent color).

### Light theme body class

`applyTheme()` adds `vscode-light` to `document.body.classList` for light themes and removes it for dark themes. `theme.css` has a `body.vscode-light` selector that switches all `--color-*` fallback values to the Light+ palette. Without this class, a light theme that doesn't explicitly define every key would get dark fallbacks for missing keys.

## Theme data model

```typescript
interface MouseTermTheme {
  id: string;           // "GitHub.github-vscode-theme.dark-default" or "builtin.dark-plus"
  label: string;        // "GitHub Dark Default"
  type: 'dark' | 'light';
  swatch: string;       // editor.background — used for picker preview
  accent: string;       // focusBorder — used for picker accent dot
  vars: Record<string, string>;  // --vscode-* CSS variable overrides
  origin: BundledOrigin | InstalledOrigin;
}

interface BundledOrigin { kind: 'bundled' }
interface InstalledOrigin {
  kind: 'installed';
  extensionId: string;  // "dracula-theme/theme-dracula"
  installedAt: string;  // ISO date
}
```

This replaced the old `PlaygroundTheme` interface (previously in `website/src/lib/playground-themes.ts`, now deleted).

## Conversion pipeline

### `CONSUMED_VSCODE_KEYS`

Not all VSCode theme color keys matter to MouseTerm — only the ~45 keys that are actually read. The conversion function filters to this set and drops the rest. The keys come from two consumers:

**Read by `@theme` fallbacks** (UI colors, ~25 keys):
- **Surfaces**: `editor.background`, `editorGroupHeader.tabsBackground`, `sideBar.background`, `editorWidget.background`
- **Text**: `editor.foreground`, `descriptionForeground`
- **Accent/borders**: `focusBorder`, `panel.border`
- **Tabs**: `tab.activeBackground`, `tab.inactiveBackground`, `tab.activeForeground`, `tab.inactiveForeground`, `list.activeSelectionBackground`, `list.activeSelectionForeground`
- **Terminal**: `terminal.background`, `terminal.foreground`
- **Status**: `badge.background`, `badge.foreground`, `errorForeground`, `editorWarning.foreground`
- **Inputs**: `input.background`, `input.border`
- **Buttons**: `button.background`, `button.foreground`, `button.hoverBackground`
- **Links**: `textLink.foreground`

**Read by `getTerminalTheme()` directly** (terminal colors, ~20 keys):
- `terminal.background`, `terminal.foreground` (also in `@theme`)
- `terminalCursor.foreground`, `terminal.selectionBackground`
- `terminal.ansiBlack` through `terminal.ansiBrightWhite` (16 ANSI colors)

### Conversion rule

For each key in the VSCode theme's `colors` object: if it's in `CONSUMED_VSCODE_KEYS`, emit `--vscode-${key.replace(/\./g, '-')}` → value. Keys not consumed by MouseTerm are silently dropped. Missing keys fall through to the `@theme` fallbacks in `theme.css` (Dark+ or Light+ defaults), which is the same behavior as VSCode itself.

## Bundled themes

Bundled themes are extracted at build time by a Node.js script (`lib/scripts/bundle-themes.mjs`) and written to `lib/src/lib/themes/bundled.json`. This file is checked into git so builds don't require network access.

### Source extensions

| Extension | OpenVSX ID | Variants |
|-----------|-----------|----------|
| GitHub VSCode Theme | `GitHub/github-vscode-theme` | Dark Default, Light Default, Dark Dimmed, Dark High Contrast, Light High Contrast, Dark Colorblind, Light Colorblind, etc. |
| Dracula | `dracula-theme/theme-dracula` | Dracula, Dracula Soft |
| VSCode builtins | (hardcoded) | Dark+, Light+ |

Dark+ and Light+ are VSCode built-in themes not published to OpenVSX. Their values are hardcoded (from the existing `lib/.storybook/themes.ts`).

### Build script flow

```
lib/scripts/bundle-themes.mjs
  |
  +- for each extension in EXTENSIONS list:
  |    +- fetch /api/{ns}/{name}/latest from OpenVSX
  |    +- download VSIX from files.download URL
  |    +- unzip (Node.js zlib + ZIP reader)
  |    +- read extension/package.json -> contributes.themes
  |    +- for each theme variant:
  |         +- read theme JSON from ZIP (parse with jsonc-parser for comments)
  |         +- convertVscodeThemeColors(colors) -> vars
  |         +- emit MouseTermTheme object
  |
  +- append hardcoded Dark+ and Light+ themes
  |
  +- write lib/src/lib/themes/bundled.json
```

Run manually: `pnpm bundle-themes`. Output is committed.

## Theme store (localStorage)

| Key | Value |
|-----|-------|
| `mouseterm:installed-themes` | JSON array of `MouseTermTheme` objects (user-installed only) |
| `mouseterm:active-theme` | Theme ID string |

The store module provides:
- `getAllThemes()` — bundled themes (from `bundled.json`) + installed themes (from localStorage)
- `getActiveThemeId()` / `setActiveThemeId(id)` — persists choice across sessions
- `addInstalledTheme(theme)` / `removeInstalledTheme(id)` — manages user-installed themes

## Shared theme picker

`lib/src/components/ThemePicker.tsx` exports a shared `ThemePicker` with two variants:

- `playground-header` — used only on `/playground`, passed through `SiteHeader`'s `controls` slot. It renders a visible `Theme:` label and uses a mobile fixed dropdown so the menu stays inside the viewport.
- `standalone-appbar` — used only by the Tauri standalone `AppBar`. It uses a compact trigger for the 30px AppBar and an anchored dropdown.

Both variants use the same state and behavior: restore the persisted active theme on mount, list bundled themes first, append installed themes, persist selected themes to `mouseterm:active-theme`, apply selections immediately, show an `X` for installed themes, confirm before deletion, and fall back to the first remaining theme when deleting the active installed theme. The dropdown footer is always `Install theme from OpenVSX`; it opens the shared runtime installer dialog.

The picker is mounted only by the website playground page and the standalone AppBar. It is not mounted on non-playground website routes, and it is not mounted from `mouseterm-lib/App`, `Pond`, or any VS Code extension entry point.

## Standalone AppBar picker

The standalone Tauri app renders the shared theme picker in `AppBar`, not in `mouseterm-lib/App` or `Pond`, so the VS Code extension entry point does not mount it. On macOS it sits in the right-side AppBar action group next to the shell dropdown; on Windows/Linux it sits before the native window controls. The AppBar already uses `bg-surface-alt`, `text-foreground`, and related theme tokens, so changing the active theme updates the AppBar chrome as well as Dockview and terminals.

`standalone/src/main.tsx` restores the persisted active theme before reconnecting/restoring Pond. This prevents the first terminal render from briefly using fallback colors. The picker itself also restores and refreshes theme state on mount.

## Runtime OpenVSX installer

Users can browse and install themes from OpenVSX directly in the app.

### OpenVSX API

OpenVSX has permissive CORS (`Access-Control-Allow-Origin: *`) — no proxy needed.

- **Search**: `GET https://open-vsx.org/api/-/search?category=Themes&query=...&size=...&offset=...`
- **Extension details**: `GET https://open-vsx.org/api/{namespace}/{name}/latest`
- **VSIX download**: URL in the response's `files.download` field

### In-browser extraction

VSIX files are ZIP archives. Extraction uses `fflate` (~8 KB gzipped) via dynamic import — only loaded when the user opens the theme store, so no impact on initial bundle.

```
user searches OpenVSX
  |
  +- fetch /api/-/search?category=Themes&query=...
  +- display results (name, icon, download count)
  |
  user clicks "Install" on an extension
  |
  +- fetch /api/{ns}/{name}/latest -> get VSIX download URL
  +- fetch VSIX as ArrayBuffer
  +- fflate.unzipSync() -> all files
  +- read extension/package.json -> contributes.themes
  +- for each theme variant:
  |    +- parse theme JSON (jsonc-parser)
  |    +- convertVscodeThemeColors(colors) -> MouseTermTheme
  |    +- addInstalledTheme(theme) -> persists to localStorage
  |
  +- theme immediately available in picker
```

## Files

| File | Role |
|------|------|
| [`lib/src/lib/themes/types.ts`](../../lib/src/lib/themes/types.ts) | `MouseTermTheme` interface and origin types |
| [`lib/src/lib/themes/convert.ts`](../../lib/src/lib/themes/convert.ts) | `CONSUMED_VSCODE_KEYS`, `convertVscodeThemeColors()`, `uiThemeToType()` |
| [`lib/src/lib/themes/apply.ts`](../../lib/src/lib/themes/apply.ts) | `applyTheme()` — sets CSS vars on body, manages body classes |
| [`lib/src/lib/themes/store.ts`](../../lib/src/lib/themes/store.ts) | Theme registry combining bundled + installed, localStorage persistence |
| [`lib/src/lib/themes/openvsx.ts`](../../lib/src/lib/themes/openvsx.ts) | OpenVSX search API, VSIX download + extraction |
| [`lib/src/lib/themes/bundled.json`](../../lib/src/lib/themes/bundled.json) | Pre-converted bundled themes (generated, checked in) |
| [`lib/src/lib/themes/index.ts`](../../lib/src/lib/themes/index.ts) | Barrel export |
| [`lib/scripts/bundle-themes.mjs`](../../lib/scripts/bundle-themes.mjs) | Build-time script to download and convert themes from OpenVSX |
| [`lib/src/theme.css`](../../lib/src/theme.css) | `@theme` tokens with `var(--vscode-*, fallback)` + light mode overrides |
| [`lib/src/lib/terminal-registry.ts`](../../lib/src/lib/terminal-registry.ts) | MutationObserver + `getTerminalTheme()` — no changes needed |
| [`lib/src/components/ThemePicker.tsx`](../../lib/src/components/ThemePicker.tsx) | Shared website/standalone dropdown and OpenVSX dialog for selecting, installing, and deleting themes |
| [`website/src/components/SiteHeader.tsx`](../../website/src/components/SiteHeader.tsx) | Shared site header; playground enables `themeAware` so header chrome follows the active theme |
| [`standalone/src/AppBar.tsx`](../../standalone/src/AppBar.tsx) | Mounts the standalone theme picker in the Tauri AppBar, outside the VS Code extension path |
| [`standalone/src/main.tsx`](../../standalone/src/main.tsx) | Restores the persisted standalone theme before Pond reconnects |

## Dependencies

- `jsonc-parser` — parses JSONC (JSON with comments/trailing commas), already a transitive dependency via Storybook
- `fflate` — ~8 KB gzipped ZIP library for in-browser VSIX extraction, dynamically imported

## Design decisions

**Why two layers, not three?** The old `--mt-*` middle layer was a pure passthrough — every variable was immediately re-exported as `--color-*`. Collapsing it into `@theme` eliminates 114 lines of dead CSS and removes a layer of indirection with no loss of functionality.

**Why keep semantic names (`surface`, `accent`) instead of VSCode names (`editor-background`, `focusBorder`)?** `bg-surface` reads better in JSX than `bg-editor-background`, and some mappings are genuinely semantic (`surface-alt` communicates intent better than `editorGroupHeader-tabsBackground`). The mapping is documented in one place (`theme.css`).

**Why hardcode `success` instead of mapping to `testing.iconPassed`?** Most VSCode themes don't define `testing.iconPassed` — it's an optional, domain-specific key. Using it as generic "success green" means imported themes either get our fallback (fine) or get a color chosen for test runner icons (wrong semantic). A hardcoded green is more reliable.

**Why extract from real VSIX files instead of manually copying colors?** Manual copying is error-prone — colors drift, coverage is incomplete, and adding new themes requires hunting through source repos. Extracting from the actual published extension guarantees accuracy and makes adding themes trivial (add one line to the extensions list, re-run the script).

**Why bundle pre-converted themes instead of fetching at runtime?** Bundled themes work offline, load instantly, and don't depend on OpenVSX availability. The bundled JSON is small (~1 KB per theme). Runtime fetching is an opt-in addition for users who want more themes.

**Why `fflate` over `JSZip`?** JSZip is ~45 KB gzipped. `fflate` is ~8 KB, tree-shakeable, and faster. We only need to read ZIPs, not create them.

**Why `localStorage` over IndexedDB?** Theme data is small (~1-2 KB per theme). Even with 50 installed themes, that's well under the 5 MB localStorage limit. The project already uses localStorage for state persistence in both standalone and website. IndexedDB would add complexity with no benefit at this scale.

**Why filter to `CONSUMED_VSCODE_KEYS` instead of passing all colors through?** VSCode themes can define 500+ color keys. Setting all of them as CSS variables would be wasteful (most are never read) and could cause unexpected interactions if VSCode adds new keys that happen to match future `--color-*` variables.

**Why set the `vscode-light` body class?** `theme.css` uses `body.vscode-light` to switch all `--color-*` fallback values to the Light+ palette. Without this class, a light theme that doesn't explicitly define every key would get dark fallbacks for the missing ones, creating a broken mixed appearance.

**Why not use OpenVSX's direct file access instead of downloading the full VSIX?** OpenVSX doesn't expose individual theme files via API — you have to download the full VSIX. However, theme-only extensions are typically small (50-200 KB), so this is fine. The build script and runtime installer share the same extraction logic.
