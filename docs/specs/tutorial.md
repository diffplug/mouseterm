# Playground Tutorial

At the `/playground` route on the website. **Status: Implemented** (Epics 14, 15, 16).

## Layout

- `SiteHeader` at top (with Playground as active nav item). On `/playground`, the header renders the **Theme:** dropdown as an optional header control; other routes do not render it.
- Below the header: MouseTerm `Pond` embedded fullscreen using `FakePtyAdapter`. The page-level `<main>` is a flex container so Pond's `flex-1 min-h-0` root receives a real height.
- The playground header uses the active `--vscode-*` theme variables for its background, border, text, and banner colors so theme changes affect the header as well as Pond.

### Implementation

- `website/src/pages/Playground.tsx` — Page component. Dynamically imports Pond (SSR-safe). Initializes `FakePtyAdapter`, `TutorialShell`, and `TutorialDetector`. Passes `onApiReady` to set up the 3-pane layout and `onEvent` for step detection.
- `website/src/components/SiteHeader.tsx` — Shared header. Accepts an optional playground-only `controls` slot and a `themeAware` mode that reads the active VSCode theme variables.
- `mouseterm-lib/components/ThemePicker` — Shared header dropdown for bundled and installed themes. The playground passes `variant="playground-header"` and the footer action opens the OpenVSX installer.
- `website/vite.config.ts` — Vite alias `mouseterm-lib` → `../lib/src` for workspace imports.

## Initial State

The sandbox starts pre-populated — not empty. Scenarios assigned via `FakePtyAdapter.setScenario()` before Pond mounts:

- **Pane 1** (`tut-main`, left, ~60%): `SCENARIO_TUTORIAL_MOTD` — MOTD welcome message + shell prompt. `TutorialShell` handles all input via `FakePtyAdapter.setInputHandler()`.
- **Pane 2** (`tut-npm`, right-top, ~40%): `SCENARIO_LONG_RUNNING` — `npm install` with progress dots.
- **Pane 3** (`tut-ls`, right-bottom): `SCENARIO_LS_OUTPUT` — `ls -la` output with a prompt.

The two right-side panes are added in `onApiReady` with `position: { referencePanel, direction }` after Pond creates the initial main pane.

## The `tut` Command

Implemented in `website/src/lib/tutorial-shell.ts` (`TutorialShell` class).

The fake terminal accepts these inputs:

- **`tut`** — Shows the current tutorial step (or the next incomplete one). Does NOT show the full checklist upfront.
- **`tut status`** — Shows all 6 steps with `[x]`/`[ ]` completion markers, grouped by phase.
- **`tut reset`** — Clears localStorage progress and confirms.
- **Anything else** — `Unknown command. Type tut to start the tutorial.`

`TutorialShell` provides full line editing (character echo, backspace) and parses commands on Enter. Output goes through `FakePtyAdapter.sendOutput()`.

### Cold Start

`SCENARIO_TUTORIAL_MOTD` (in `lib/src/lib/platform/fake-scenarios.ts`) shows a styled MOTD above the prompt:

```
  Welcome to MouseTerm.
  Type tut to start the interactive tutorial.
```

## Tutorial Steps

Steps are revealed **one at a time** — completing one reveals the next. Each step has a brief contextual prompt explaining *why* you'd do this, not just the mechanic.

Progress is stored in localStorage so the user can leave and return. Show progress as `Step N/6` when displaying each step.

### Detection

Implemented in `website/src/lib/tutorial-detection.ts` (`TutorialDetector` class). Two event sources:

1. **DockviewApi events** — `onDidAddPanel`, `onDidLayoutChange`, `onDidActivePanelChange`. Subscribed in `TutorialDetector.attach(api)`.
2. **PondEvent callbacks** — `modeChange`, `zoomChange`, `detachChange`, `split`. Routed via `Pond`'s `onEvent` prop (added in `lib/src/components/Pond.tsx`).

### Phase 1: See Everything at Once

**Step 1 — Split a pane**
> You're juggling multiple tasks. Split this terminal so you can watch two things side by side.
>
> *Drag the split button in the tab header, or drag the tab itself to a drop zone.*

Detection: `onDidAddPanel` fires on DockviewApi (panel count increases beyond initial count).

**Step 2 — Resize your panes**
> One task needs more room. Drag the divider between panes to give it space.
>
> *Drag the gap between two panes.*

Detection: Captures a `ResizeSnapshot` (serialized grid structure with branch ratios from `api.toJSON()`). On `onDidLayoutChange`, compares current ratios against baseline — triggers when any branch ratio shifts by >= `RESIZE_RATIO_DELTA` (0.08). Baseline resets after splits to avoid false positives.

### Phase 2: Focus and Background

**Step 3 — Zoom in, then zoom back out**
> One terminal needs your full attention. Zoom in to focus, then zoom back out when you're done.
>
> *Double-click a tab header to zoom. Double-click again to unzoom.*

Detection: Watches `PondEvent.zoomChange` — requires both a `zoomed: true` then `zoomed: false` event (unzoom after zoom).

**Step 4 — Detach a pane, then bring it back**
> That task is running in the background — you don't need to watch it. Send it to the baseboard, then click its door when you want it back.
>
> *Click the detach button in the tab header. Click the door in the baseboard to reattach.*

Detection: Watches `PondEvent.detachChange` — requires `count > 0` (detach) then `count === 0` (reattach back to zero).

### Phase 3: Keyboard Power

**Step 5 — Enter command mode and navigate**
> Navigate between panes without touching the mouse.
>
> *Press Escape to enter command mode. Use arrow keys to move between panes.*

Detection: Watches `PondEvent.modeChange` for transition to `'command'`, then tracks `onDidActivePanelChange` — requires focus on >= 2 different panels while in command mode.

**Step 6 — Split using keyboard shortcuts**
> Split a pane without leaving the keyboard.
>
> *In command mode, press " to split horizontally or % to split vertically.*

Detection: Watches `PondEvent.split` with `source: 'keyboard'` while in command mode.

## Completion

When all 6 steps are done, `TutorialShell.announceCompletion()` prints the completion message:

```
You've got it. MouseTerm keeps everything visible and nothing in your way.

Ready to try the real thing?
  → Download MouseTerm: mouseterm.com/#download

Or keep exploring — this sandbox is yours.
```

The sandbox stays fully functional after completion. Running `tut` shows "Tutorial complete" instead of a step. `tut reset` restarts from step 1.

## Theme Picker

Implemented in `mouseterm-lib/lib/themes` and `mouseterm-lib/components/ThemePicker`.

Bundled themes are provided by `mouseterm-lib/lib/themes` and include Dark+, Light+, GitHub variants, and Dracula variants. Users can install additional themes from OpenVSX through the dropdown footer action.

The picker appears only on `/playground`, inside `SiteHeader`, labeled `Theme:`. The trigger opens a dropdown of bundled and installed themes. The dropdown footer is always `Install theme from OpenVSX`, which opens the theme store dialog. Installed theme rows include an `X` delete control; deletion requires browser confirmation before removing the theme from localStorage. If the active installed theme is deleted, the picker falls back to the first bundled theme and applies it immediately.

Each theme is defined as a map of `--vscode-*` CSS variable overrides. `applyTheme()` applies the active theme, which:
1. Cascades into `--color-*` variables (via `var(--vscode-*, fallback)` in `theme.css`)
2. Triggers the `MutationObserver` in `terminal-registry.ts` to re-read `getTerminalTheme()` for all xterm.js terminals
3. Updates Dockview/Tailwind token colors

The picker restores the persisted active theme on mount. The playground header is `themeAware`, so the same active theme also affects the site header chrome while the picker remains hidden on non-playground routes.

## Technical Notes

- All progress keyed as `mouseterm-tutorial-step-N` in localStorage (values: `'true'`).
- `FakePtyAdapter` extensions: `setInputHandler(id, fn)` routes `writePty` calls to a custom handler; `sendOutput(id, data)` writes to a terminal's output stream.
- `Pond` extensions: `initialPaneIds` prop seeds the first pane(s); `onApiReady` callback prop exposes `DockviewApi`; `onEvent` callback prop fires `PondEvent` for mode/zoom/detach/selection/split changes (types: `modeChange`, `zoomChange`, `detachChange`, `split`, `selectionChange`).
- `SCENARIO_TUTORIAL_MOTD` scenario added to `lib/src/lib/platform/fake-scenarios.ts`.
