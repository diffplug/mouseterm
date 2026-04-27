# Theme Spec

MouseTerm's theme contract is intentionally small: render the terminal chrome
with VSCode-appropriate surfaces, and render terminal content with
theme-appropriate xterm.js colors.

VSCode extension mode gets `--vscode-*` variables from VSCode. Standalone and
website mode apply the same shape of variables to `document.body` with
`applyTheme()` from a bundled or installed MouseTerm theme.

## Surface hierarchy

The chrome is anchored on VSCode's file-tree styling because those colors are
designed to read clearly inside the sidebar host area. Use bg-only chrome for
panes and doors; do not add borders to make the hierarchy work.

| Token | VSCode key | Where used |
| --- | --- | --- |
| `--color-surface` | `editor.background` | generic editor surface; door candidate |
| `--color-terminal-bg` / `-fg` | `terminal.background` / `terminal.foreground` | terminal container and xterm defaults |
| `--color-app-bg` | `sideBar.background` | baseboard, dockview gutters, gaps around panes |
| `--color-header-inactive-bg` / `-fg` | `list.inactiveSelectionBackground` / `list.inactiveSelectionForeground` | unfocused pane headers |
| `--color-header-active-bg` / `-fg` | `list.activeSelectionBackground` / `list.activeSelectionForeground` | focused pane header |
| `--color-door-bg` / `-fg` | runtime pick from inactive header vs editor surface/foreground | baseboard doors |
| `--color-focus-ring` | runtime pick from active header colors and `focusBorder` | marching-ants ring and terminal text-selection border |

Door colors and the focus ring are chosen at runtime in
`Pond.useDynamicPalette` using OKLab distance/chroma helpers from
`lib/src/lib/color-contrast.ts`.

- Door bg/fg chooses whichever pair, inactive-header or editor
  surface/foreground, has stronger perceptual separation from
  `--color-app-bg`.
- Focus ring prefers a chromatic active-header background, then a chromatic
  active-header foreground or `focusBorder`, then the highest contrast fallback.
- Header-internal text and buttons inherit the header foreground. Do not add
  `text-muted` inside headers; use `hover:bg-current/10` for neutral hover
  feedback. Semantic exceptions are `text-warning` for ringing alerts and
  error styling for destructive actions.

High-contrast VSCode themes may make bg-only chrome look flatter than normal.
That is accepted; terminal content still uses the theme's terminal palette.

## Runtime model

MouseTerm has two theme layers:

1. `--vscode-*` variables hold imported or host-provided VSCode color data.
2. `--color-*` variables in `lib/src/theme.css` provide semantic Tailwind
   tokens such as `bg-app-bg`, `bg-header-active-bg`, and `text-foreground`.

`applyTheme()` sets imported `--vscode-*` variables on `document.body` and
adds either `vscode-light` or `vscode-dark` for consumers that need the theme
type. `theme.css` declares the theme-dependent `--color-*` tokens on `body`
because `--vscode-*` variables also live there. Keep the parallel `@theme`
declarations so Tailwind can generate utility classes, but treat the
body-level declarations as the runtime source of truth.

`theme.css` must not contain hardcoded color defaults or `var(..., fallback)`
chains. Runtime hosts are responsible for providing the consumed `--vscode-*`
variables before MouseTerm renders.

## Terminal color contract

Terminal content is orthogonal to the chrome. xterm.js reads terminal colors
directly from `--vscode-*` in `getTerminalTheme()`:

- `terminal.background` and `terminal.foreground`, with editor background and
  foreground fallbacks.
- `terminalCursor.foreground`.
- `terminal.selectionBackground`.
- The 16 ANSI colors from `terminal.ansiBlack` through
  `terminal.ansiBrightWhite`.

The `terminal-registry.ts` body `MutationObserver` re-reads these values when
the body class or style changes, so applying a theme updates existing
terminals.

## Theme data

Bundled and installed themes are represented by `MouseTermTheme` objects in
`lib/src/lib/themes/`. A theme's `vars` map contains only consumed
`--vscode-*` variables. `convertVscodeThemeColors()` filters imported VSCode
theme JSON to `CONSUMED_VSCODE_KEYS`; themes used outside VSCode must provide
the variables consumed by `theme.css`. `applyTheme()` materializes a small set
of missing optional VSCode variables from other variables already present in the
same theme so `theme.css` can stay direct.

Theme discovery, OpenVSX download/extraction, picker UI, and localStorage
persistence are implementation details of `lib/src/lib/themes/` and
`ThemePicker.tsx`. They must preserve the rendering contract above but do not
need separate spec rules here.

## Maintainer checklist

When changing theme behavior:

- Update `lib/src/theme.css` and `lib/src/components/design.tsx` together for
  any chrome token change.
- Update `CONSUMED_VSCODE_KEYS` when adding or removing any `--vscode-*`
  dependency used by chrome, terminal rendering, selection UI, or theme-picker
  inline styles.
- Keep xterm.js terminal colors sourced from `--vscode-terminal-*` variables,
  not from MouseTerm chrome tokens.
- Do not add hardcoded color defaults or CSS variable fallback chains to
  `lib/src/theme.css`; fix the theme data or runtime host instead.
- Avoid reintroducing a pass-through `--mt-*` layer or one-off tokens for tabs,
  badges, accents, or button hovers unless there is a new rendered surface that
  cannot be expressed by the hierarchy above.
