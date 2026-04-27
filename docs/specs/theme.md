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

### Why the `--color-*` declarations live on `body`, not `:root`

CSS resolves `var()` references inside a custom property's value at the cascade of the **element where the property is declared**, not where it's used. `applyTheme()` sets `--vscode-*` on `body`, so any `--color-foo: var(--vscode-bar, fallback)` declared on `:root` (e.g. via `@theme`) sees an empty cascade for `--vscode-bar` and collapses to its static fallback. Body and descendants then inherit that already-resolved fallback, never picking up the actual theme value.

To make theme switching actually drive the chrome, `theme.css` re-declares all theme-dependent `--color-*` tokens inside a `body { ... }` block (with parallel `body.vscode-light` and `prefers-color-scheme: light` blocks for the light variants). On `body`, `--vscode-*` are in scope, so `var()` resolves correctly. The `@theme` block above keeps the same declarations for Tailwind's utility-class generation, but its values aren't load-bearing for runtime theming — the body-level declarations win in the cascade for the elements that consume them.

In addition, `Pond.useDynamicPalette` runs a second body-level MutationObserver to publish a few **runtime-chosen** `--color-*` vars (door bg/fg, focus ring) by perceptual contrast (ΔE in OKLab) against `--color-app-bg`. See **Surface hierarchy** below.

## Surface hierarchy

The chrome is anchored on VSCode's **file-tree** styling: `list.activeSelectionBackground` for the focused panel header, `list.inactiveSelectionBackground` for unfocused headers and parked doors, `sideBar.background` for the host area, and `editor.background` for the pane content. Four bg surfaces, hue-shifted active panel for prominence:

| Token | VSCode key | Where used |
|---|---|---|
| `--color-surface` (terminal-bg) | `editor.background` | xterm canvas, pane body |
| `--color-app-bg` | `sideBar.background` → `editorGroupHeader.tabsBackground` | baseboard, dockview gutters, gaps around panes |
| `--color-header-inactive-bg` / `-fg` | `list.inactiveSelectionBackground` / `…Foreground` | unfocused panel headers |
| `--color-header-active-bg` / `-fg` | `list.activeSelectionBackground` / `…Foreground` | focused panel header |
| **`--color-door-bg` / `-fg`** *(runtime)* | larger ΔE pick: (header-inactive bg/fg) vs (terminal / foreground) | baseboard doors |
| **`--color-focus-ring`** *(runtime)* | 3-tier pick (see below) among `--color-header-active-bg`, `--color-header-active-fg`, `--vscode-focusBorder` | marching-ants ring + terminal text-selection border |

The two runtime pickers live in `Pond.useDynamicPalette` and write CSS vars onto `body.style`. The math (sRGB→OKLab, ΔE, chroma) is in `lib/src/lib/color-contrast.ts`.

- **Door bg/fg** uses plain max ΔE OKLab. Both candidates (panel-inactive bg vs terminal bg) are typically near-greyscale, so perceptual distance correctly picks whichever has the larger lightness gap from app-bg.
- **Focus ring** uses a 3-tier rule:
  1. **Match panel-active-bg** (`list.activeSelectionBackground`) if its *absolute* OKLab chroma is ≥ 0.05 — i.e., it's a meaningful color, not a translucent grey overlay. Visually unifying the ring with the focused header is the ideal outcome.
  2. Else the most-saturated of (`list.activeSelectionForeground`, `focusBorder`) that clears the same absolute chroma floor.
  3. Else max ΔE OKLab vs app-bg among all three candidates (greyscale-theme fallback).

  Absolute chroma is used (rather than chroma-vs-app-bg) because some themes have a mildly-saturated app-bg of their own (e.g. Solarized's teal `#003641`); a delta-based gate would underweight an obviously-chromatic panel-active-bg in those themes. Selection reads more cleanly when the ring stands out in saturation than in lightness alone — most app-bg values are near-grey, and a chromatic ring colors the eye decisively even when luminance contrast is modest.

`list.inactiveSelectionForeground` is often left undefined by themes; the cascade falls through `list.activeSelectionForeground` → `--vscode-foreground` → hex.

**Header-internal text and buttons inherit the header's fg.** No `text-muted` for buttons inside a header — let inherited color do the work and use `hover:bg-current/10` (currentColor at 10%) for hover. Semantic exceptions: `text-warning` for the ringing bell; `hover:bg-error/10 hover:text-error` for the kill button.

**Bg-only chrome** is the rule. In high-contrast VSCode themes (where structure is conveyed via borders, not fills), the chrome renders flat — accepted trade-off; terminal content keeps its HC ANSI palette regardless.

The full strategy and "things to avoid" list lives in [`lib/src/components/design.tsx`](../../lib/src/components/design.tsx) at the top of the file. Any change to chrome colors should update that comment first.

### Cleanup from previous `--mt-*` layer

The old three-layer system (`--vscode-*` → `--mt-*` → `--color-*`) had a redundant middle layer. The `--mt-*` variables were a pure passthrough — every one was immediately re-exported as `--color-*` with no transformation. The cleanup:

- **Collapsed `--mt-*` into `@theme`**: `--color-surface: var(--vscode-editor-background, #1e1e1e)` directly, no intermediate variable.
- **Deleted 38 dead variables** (114 lines of CSS): `--mt-ansi-*` (32 colors), `--mt-terminal-cursor`, `--mt-terminal-selection`, `--mt-gutter`, `--mt-gutter-active`, `--mt-editor-font-size`, `--mt-editor-font-family`, `--mt-selection-workspace` were defined 3x each (dark/light/prefers-color-scheme) but never consumed. The ANSI colors are read directly as `--vscode-*` by `getTerminalTheme()`.
- **Eliminated duplicate mappings**: `--vscode-focusBorder` was aliased as `--mt-accent`, `--mt-gutter-active`, and `--mt-selection-terminal` — three names for one token. Now just `--color-accent`.
- **Dropped `testing.iconPassed` mapping**: `--mt-success-fg` stole `testing.iconPassed` as a generic success color. Most themes don't define this key, and it's the wrong semantic. `--color-success` now uses a hardcoded green.
- **Kept defensible cross-domain mappings**: `--color-tab-selected-bg/fg` ← `list.activeSelectionBackground/Foreground` (closest VSCode approximation of our command-mode tab selection). `--color-accent` ← `focusBorder` (most themes treat this as their brand/accent color).

### Chrome simplification (later)

A second pass collapsed the chrome to four anchored tokens (described above) and removed the rest:

- **Removed tokens**: `--color-tab-active-bg/fg`, `--color-tab-inactive-bg/fg`, `--color-tab-selected-bg/fg`, `--color-accent`, `--color-surface-alt`, `--color-badge-bg/fg`, `--color-button-hover-bg`. The previous "kept" cross-domain mappings turned out not to pull their weight once panel headers and doors all shared `list.*` tokens.
- **Anchored on file-tree** (`list.*` + `sideBar.background`) instead of editor tabs (`tab.*`). Editor-tab bgs typically equal `editor.background` in many themes (so an "active tab" disappears against the editor in a bg-only design), while `list.activeSelectionBackground` is built to stand out against `sideBar.background` — exactly the contrast we want.
- **Introduced runtime `--color-door-bg/-fg` and `--color-focus-ring`** picked by ΔE OKLab (see Surface hierarchy). Static fallback chains can't always guarantee enough contrast across the open universe of imported themes; a perceptual picker handles the long tail.
- **Bg-only**: removed door borders entirely, headers and doors no longer use `--color-border`. The 1-2px border + transparent-bottom-edge pattern (which produced visible 45° miters where the visible border met the transparent edge) is gone.

### Light theme body class

`applyTheme()` adds `vscode-light` to `document.body.classList` for light themes and removes it for dark themes. `theme.css` has a `body.vscode-light` selector that switches all `--color-*` fallback values to the light fallback palette. Without this class, a light theme that doesn't explicitly define every key would get dark fallbacks for missing keys.

## Theme data model

```typescript
interface MouseTermTheme {
  id: string;           // "GitHub.github-vscode-theme.github-dark-default"
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
  extensionId: string;  // "publisher/theme-extension"
  installedAt: string;  // ISO date
}
```

This replaced the old `PlaygroundTheme` interface (previously in `website/src/lib/playground-themes.ts`, now deleted).

## Conversion pipeline

### `CONSUMED_VSCODE_KEYS`

Not all VSCode theme color keys matter to MouseTerm — only the ~40 keys that are actually read. The conversion function filters to this set and drops the rest. The keys come from four consumers:

**Read by `@theme` fallbacks in `theme.css`** (chrome surfaces and text, ~17 keys):
- **Surfaces**: `editor.background`, `editorGroupHeader.tabsBackground`, `sideBar.background`, `editorWidget.background`
- **Text**: `editor.foreground`, `descriptionForeground`, `foreground` (used in the inactive-header foreground fallback chain)
- **Borders**: `panel.border`
- **File-tree palette** (chrome anchor): `list.activeSelectionBackground`, `list.activeSelectionForeground`, `list.inactiveSelectionBackground`, `list.inactiveSelectionForeground`
- **Terminal**: `terminal.background`, `terminal.foreground`
- **Status**: `errorForeground`, `editorWarning.foreground`
- **Inputs**: `input.background`, `input.border`

**Read by `Pond.useDynamicPalette` directly** (focus ring picker):
- `focusBorder`

**Read by `ThemePicker.tsx` inline styles** (dialog chrome only):
- `button.background`, `button.foreground`, `textLink.foreground` *(theme-installer dialog)*
- All other `--vscode-*` references in `ThemePicker.tsx` are already covered by the `@theme` set above.

**Read by `getTerminalTheme()` and `SelectionOverlay.tsx`** (terminal content, ~19 keys):
- `terminal.background`, `terminal.foreground` (also in `@theme`)
- `terminalCursor.foreground`, `terminal.selectionBackground`
- `terminal.ansiBlack` through `terminal.ansiBrightWhite` (16 ANSI colors)

### Conversion rule

For each key in the VSCode theme's `colors` object: if it's in `CONSUMED_VSCODE_KEYS`, emit `--vscode-${key.replace(/\./g, '-')}` → value. Keys not consumed by MouseTerm are silently dropped. Missing keys fall through to the `@theme` fallbacks in `theme.css`, which is the same behavior as VSCode itself.

## Bundled themes

Bundled themes are extracted at build time by a Node.js script (`lib/scripts/bundle-themes.mjs`) and written to `lib/src/lib/themes/bundled.json`. This file is checked into git so builds don't require network access.

### Source extensions

| Extension | OpenVSX ID | Variants |
|-----------|-----------|----------|
| GitHub VSCode Theme | `GitHub/github-vscode-theme` | Dark Default, Light Default, Dark Dimmed, Dark High Contrast, Light High Contrast, Dark Colorblind, Light Colorblind, etc. |

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
| [`lib/src/components/design.tsx`](../../lib/src/components/design.tsx) | Authoritative chrome-color strategy comment (surfaces, fg rules, focus ring, things to avoid) |
| [`lib/src/lib/color-contrast.ts`](../../lib/src/lib/color-contrast.ts) | sRGB → OKLab + ΔE math for the runtime palette pickers |
| [`lib/src/components/Pond.tsx`](../../lib/src/components/Pond.tsx) | `useDynamicPalette` runtime picker — publishes `--color-door-bg/-fg` and `--color-focus-ring` via body inline style |
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

**Why keep semantic names (`surface`, `header-active-bg`) instead of VSCode names (`editor-background`, `list-activeSelectionBackground`)?** `bg-surface` reads better in JSX than `bg-editor-background`, and some mappings are genuinely semantic (`header-active-bg` communicates intent better than `list-activeSelectionBackground`). The mapping is documented in one place (`theme.css`).

**Why anchor the chrome on `list.*` (file-tree) tokens instead of `tab.*`?** In many VSCode themes, `tab.activeBackground` equals `editor.background` so an "active tab" would disappear against editor bg in a bg-only design. `list.activeSelectionBackground` is engineered to be visible against `sideBar.background`, which gives us exactly the contrast we want for "this panel is focused" vs "this panel is parked". Anchoring on the same family also means the four chrome surfaces have a coherent design lineage (file-tree row + sidebar host + selected row + editor content).

**Why dynamic ΔE OKLab pickers for `--color-door-bg` and `--color-focus-ring`?** Static fallback chains pick a single key per surface, but across the open universe of imported themes some themes will have low contrast between any two specific keys. A perceptual picker that chooses between a small set of candidates (e.g. door-bg = whichever of `header-inactive-bg` or `terminal-bg` has higher ΔE vs `app-bg`) handles the long tail without per-theme tweaks. ΔE OKLab (Euclidean distance in OKLab) is used rather than WCAG luminance because saturated themes can have similar L between two colors with very different hue, and the eye still perceives contrast — luminance alone misses that.

**Why bg-only chrome (no borders) in the panel/door surfaces?** Bg-only is simpler and reads cleanly in modern themes. The trade-off is that high-contrast VSCode themes (which convey structure via borders, not fills) render the chrome flat. We accept this; their terminal content still uses HC ANSI colors.

**Why hardcode `success` instead of mapping to `testing.iconPassed`?** Most VSCode themes don't define `testing.iconPassed` — it's an optional, domain-specific key. Using it as generic "success green" means imported themes either get our fallback (fine) or get a color chosen for test runner icons (wrong semantic). A hardcoded green is more reliable.

**Why extract from real VSIX files instead of manually copying colors?** Manual copying is error-prone — colors drift, coverage is incomplete, and adding new themes requires hunting through source repos. Extracting from the actual published extension guarantees accuracy and makes adding themes trivial (add one line to the extensions list, re-run the script).

**Why bundle pre-converted themes instead of fetching at runtime?** Bundled themes work offline, load instantly, and don't depend on OpenVSX availability. The bundled JSON is small (~1 KB per theme). Runtime fetching is an opt-in addition for users who want more themes.

**Why `fflate` over `JSZip`?** JSZip is ~45 KB gzipped. `fflate` is ~8 KB, tree-shakeable, and faster. We only need to read ZIPs, not create them.

**Why `localStorage` over IndexedDB?** Theme data is small (~1-2 KB per theme). Even with 50 installed themes, that's well under the 5 MB localStorage limit. The project already uses localStorage for state persistence in both standalone and website. IndexedDB would add complexity with no benefit at this scale.

**Why filter to `CONSUMED_VSCODE_KEYS` instead of passing all colors through?** VSCode themes can define 500+ color keys. Setting all of them as CSS variables would be wasteful (most are never read) and could cause unexpected interactions if VSCode adds new keys that happen to match future `--color-*` variables.

**Why set the `vscode-light` body class?** `theme.css` uses `body.vscode-light` to switch all `--color-*` fallback values to the light fallback palette. Without this class, a light theme that doesn't explicitly define every key would get dark fallbacks for the missing ones, creating a broken mixed appearance.

**Why not use OpenVSX's direct file access instead of downloading the full VSIX?** OpenVSX doesn't expose individual theme files via API — you have to download the full VSIX. However, theme-only extensions are typically small (50-200 KB), so this is fine. The build script and runtime installer share the same extraction logic.
