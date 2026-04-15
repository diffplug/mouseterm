# MouseTerm

A mouse-friendly multitasking terminal built with pnpm, react, typescript, vite, tailwind, storybook, and xterm.js.

## Setup

```
pnpm install     # install deps
pnpm build       # build lib, vscode extension, and website
```

## Architecture

- **lib/** — Shared React + TailwindCSS frontend library (components, platform abstraction, tests, Storybook)
- **standalone/** — Tauri desktop app with Node.js sidecar for native PTY via node-pty
- **vscode-ext/** — VS Code extension wrapping the lib in a webview with native PTY backend
- **website/** — Marketing website bundling part of the lib as an interactive demo

## Project Structure

- `lib/` — Core UI library (pnpm) — Storybook, tests, shared components
- `lib/src/lib/platform/` — Platform abstraction layer (`PlatformAdapter` interface, fake + VSCode adapters)
- `standalone/` — Tauri app (Rust + Vite frontend)
- `standalone/sidecar/` — Node.js PTY manager, bundled as Tauri sidecar
- `standalone/src-tauri/` — Rust backend that bridges webview ↔ Node.js sidecar
- `vscode-ext/` — VS Code extension (esbuild, node-pty via forked child process)
- `website/` — Marketing site (Vite, uses FakePtyAdapter for demo)

## Specs

The primary job of a spec is to be an accurate reference for the current state of the code. Read the relevant spec before modifying a feature it covers — the spec describes invariants, edge cases, and design decisions that are not obvious from the code alone.

- **`docs/specs/layout.md`** — Tiling layout, pane/door containers, dockview configuration, modes (passthrough/command), keyboard shortcuts, selection overlay, spatial navigation, detach/reattach, inline rename, session lifecycle, session persistence, and theming. Read this when touching: `Pond.tsx`, `Baseboard.tsx`, `Door.tsx`, `TerminalPane.tsx`, `spatial-nav.ts`, `layout-snapshot.ts`, `terminal-registry.ts`, `session-save.ts`, `session-restore.ts`, `reconnect.ts`, `index.css`, `theme.css`, or any keyboard/navigation/mode behavior.
- **`docs/specs/alarm.md`** — Activity monitoring state machine, alarm trigger/clearing rules, attention model, TODO lifecycle (soft/hard), bell button visual states and interaction, door alarm indicators, and hardening (a11y, motion, i18n, overflow). Read this when touching: `activity-monitor.ts`, `alarm-manager.ts`, the alarm bell or TODO pill in `Pond.tsx` (TerminalPaneHeader), alarm indicators in `Door.tsx`, or the `a`/`t` keyboard shortcuts. Layout.md defers to this spec for all alarm/TODO behavior.
- **`docs/specs/vscode.md`** — VS Code extension architecture: hosting modes (WebviewView + WebviewPanel), PTY lifecycle and buffering, message protocol between webview and extension host, session persistence flow, reconnection protocol, theme integration, CSP, build pipeline, and invariants (save-before-kill ordering, PTY ownership, alarm state merging). Read this when touching: `extension.ts`, `webview-view-provider.ts`, `message-router.ts`, `message-types.ts`, `pty-manager.ts`, `pty-host.js`, `session-state.ts`, `webview-html.ts`, `vscode-adapter.ts`, or `pty-core.js`.
- **`docs/specs/tutorial.md`** — Playground tutorial on the website: 3-pane initial layout, `tut` command and TutorialShell, 6-step progressive tutorial with detection logic, theme picker, FakePtyAdapter extensions, and Pond event hooks. Read this when touching: `website/src/pages/Playground.tsx`, `website/src/lib/tutorial-shell.ts`, `website/src/lib/tutorial-detection.ts`, `lib/src/components/ThemePicker.tsx`, `website/src/lib/playground-themes.ts`, `lib/src/lib/platform/fake-scenarios.ts` (tutorial scenarios), or the `onApiReady`/`onEvent`/`initialPaneIds` props on Pond.

When updating code covered by a spec, update the spec to match. When the two specs overlap (e.g. pane header elements appear in both), layout.md documents placement and sizing while alarm.md documents behavior and visual states.

## Design

See [.impeccable.md](.impeccable.md) for full design context. Key principles:

1. **Native first** — Inside VSCode, feel indistinguishable from a built-in feature. Use the host's theme tokens.
2. **Information density without intimidation** — Dense for power users, approachable for beginners. Progressive disclosure.
3. **Status at a glance** — Scannable in under a second across many terminals.
4. **No chrome, all content** — Minimize UI chrome. Terminals are the content.
5. **Theme-adaptive** — Never hardcode colors. Support light and dark from day one.
