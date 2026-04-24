# Layout Spec

> See `docs/specs/ontology.md` for canonical state names, layer definitions, and transition verbs. This spec uses the ontology's vocabulary throughout.

## Conceptual model

A **Session** is a single PTY instance — a running shell process with its scrollback, environment, and working directory. Sessions are managed by the terminal registry and persist independently of how they are displayed. Each session also carries Activity state (alert status from the activity monitor, optional TODO flag).

A Session's **View** state places it in one of two containers:

- **Pane** — a visible container in the content area. The session's terminal output is rendered via xterm.js. The pane has a header with controls and acts as the drag handle for layout rearrangement.
- **Door** — a minimized container in the baseboard. The session is still alive (PTY running, output buffered) but not visible. The door shows the session's title plus alert and TODO indicators, and looks like a mouse hole cut into the baseboard.

Transitioning between Pane and Door does not alter the Session in any way. Minimizing a pane creates a door; reattaching a door creates a pane. The terminal content, scrollback, and process state are preserved across transitions.

## Shell layout

There are two areas:

- **Content** — tiling layout containing Panes, powered by dockview
- **Baseboard** — always-visible bottom strip containing Doors and shortcut hints

The user can navigate between all elements using the mouse, or by entering `command` mode and using the keyboard.

```
Pond
├── Context providers (Mode, SelectedId, PondActions, PanelElements, DoorElements, RenamingId, Zoomed, WindowFocused)
│   └── div (h-screen, flex col)
│       ├── Dockview wrapper (flex-1, 6px padding around edges)
│       │   ├── DockviewReact (tiling layout engine, singleTabMode="fullwidth")
│       │   │   └── Groups (one session per group, no tab stacking)
│       │   │       ├── TerminalPanel → TerminalPane → xterm.js
│       │   │       └── TerminalPaneHeader (tab component, drag handle)
│       │   └── SelectionOverlay (fixed positioned, pointer-events: none)
│       ├── Baseboard (always-visible bottom strip, shortcut hints when empty)
│       │   └── Door components (one per minimized session)
│       └── KillConfirmOverlay (conditional)
```

### What dockview controls
- Spatial arrangement of groups in a grid
- Resize sashes between groups
- Drag-and-drop rearrangement via pane headers
- Group sizing and positioning

### What we control
- Focus and selection state (`selectedId`, `selectedType`)
- Passthrough/command mode system
- Keyboard shortcuts and selection overlay rendering
- Session lifecycle: minimize (pane → door), reattach (door → pane), kill
- Terminal lifecycle (via terminal-registry)
- Activity monitoring and alert state
- TODO state management
- Session persistence (save/restore across restarts)

## Content

The content area is a tiling layout of panes, powered by dockview. Each pane occupies its own group (no tab stacking). Panes are separated by a 6px gap. DockviewReact uses `singleTabMode="fullwidth"` so tabs stretch to fill the header.

### Tiling constraints

**One session per group.** Dockview supports multiple panels per group (tabs), but we enforce one-panel-per-group to behave like a tiling window manager.

**No tab stacking.** Prevented via:
- `onWillShowOverlay`: `event.kind === 'tab'` → blocked
- `group.model.onWillDrop`: `event.position === 'center'` → intercepted and converted to a **swap**
- All other positions and kinds are allowed — these create splits

**Center drop = swap.** Dropping a pane onto the center of another swaps their session content (same as `Cmd+Arrow`). The overlay is allowed so the user sees a valid drop target, but `group.model.onWillDrop` intercepts it, calls `swapTerminals()` + swaps titles, then `preventDefault()` to block the merge.

### Pane header

Each pane has a 30px header that doubles as a drag handle. The header uses `cursor-grab` / `active:cursor-grabbing` and `select-none`. Background uses `--color-tab-*` theme tokens (adapts to VSCode host theme). Dockview's default close button and right-actions container are hidden via CSS.

Elements from left to right:

- Session name (click to rename, truncates with ellipsis)
- Alert bell button (reflects session activity status)
- TODO pill (if todo state is set; hidden in minimal tier)
- Flexible gap
- SplitHorizontalIcon `split left/right [|]` (full tier only)
- SplitVerticalIcon `split top/bottom [-]` (full tier only)
- ArrowsOutIcon / ArrowsInIcon `zoom / unzoom [z]` (full tier only)
- ArrowLineDownIcon `minimize [m]`
- XIcon `kill [x]` (hover turns error-red)

The alert bell and TODO pill are defined in `docs/specs/alert.md` (visual states, interaction, context menu, and hardening).

### Pane header responsive sizing

The header adapts to available width via ResizeObserver in three tiers:

- **Full** (>280px): all controls visible — alert, TODO, split, zoom, minimize, kill
- **Compact** (160–280px): SplitH/SplitV/Zoom hidden; alert, TODO, minimize, kill visible
- **Minimal** (<160px): SplitH/SplitV/Zoom and TODO pill hidden; alert, minimize, kill visible. Session name truncates with ellipsis as needed.

## Baseboard

Below the content area is the baseboard (`h-8`, 32px). It is always visible — a thin strip when empty, showing keyboard shortcut hints when there are no doors and the container is wider than 350px (currently: `LCmd → RCmd to enter command mode`).

When a session is minimized, it becomes a **door** on the baseboard. The door displays the session's title, a TODO badge (if set), and an alert bell icon with activity dot. It uses the bottom edge of the window as its bottom border, with left, top, and right borders with `rounded-t-md` — resembling a mouse hole. Door dimensions: `min-w-[68px] max-w-[220px] h-6`.

### Door interaction

- **Clicking a door** (in any mode): restores the session into the content area as a pane and enters passthrough mode. The terminal gets focus immediately.
- **Enter** on a door (command mode): same as clicking — restores and enters passthrough mode.
- **d** on a door (command mode): restores the session into a pane but stays in command mode. This is the inverse of pressing `d` on a pane (which minimizes it), making `d` a toggle.
- **x** on a door (command mode): restores the session into a pane, then immediately shows the kill confirmation.
- **Arrow keys** can navigate to doors from panes (see Navigation).

### Baseboard responsive sizing

Doors are measured in a hidden off-screen container first:

- If they all fit, display them all. If there is remaining space, show the keyboard shortcut hint.
- If they do not all fit:
  - Reserve space for a `N more →` button on the right edge
  - Add doors until no more fit
  - If scrolled, show `← N more` on the left and/or `N more →` on the right
  - Assume single-digit overflow counts

Clicking an overflow arrow reveals one door in that direction. A longer title may push more doors off the opposite side.

Extreme case: a single door with a very long title, with more doors on both sides. Show both arrows with counts, and the single door with as much title as fits (ellipsis for the rest).

## Modes

### Passthrough mode
- All keyboard input routes to the active session's xterm.js instance
- Only the mode-exit gesture (LCmd → RCmd) is intercepted
- Selection overlay shows 2px solid border with glow
- Terminal has DOM focus

### Command mode
- Keyboard drives navigation and commands (see Shortcuts)
- Session does not receive keyboard input
- Selection overlay shows animated marching-ants SVG border (2px stroke, dashed pattern animated at 0.4s cycle)

### Mode switching

**Enter passthrough mode:**
- Click any pane body or header
- Press `Enter` on a selected pane in command mode
- Click or press `Enter` on a door (restores session first)
- Focus is deferred via `requestAnimationFrame` to prevent dockview from stealing it

**Enter command mode:**
- Left Cmd keydown, then Right Cmd keydown within 500ms
- Detected via capture-phase `keydown` listener on `e.key === 'Meta'` and `e.location` (1 = left, 2 = right)
- Works even when xterm has DOM focus because listener uses capture phase

## Keyboard shortcuts (command mode)

All handled in a single capture-phase `keydown` listener on `window`. Every handled key calls `preventDefault()` + `stopPropagation()`. While a rename input is active, all shortcuts are bypassed.

| Key | On pane | On door |
|-----|---------|---------|
| `"` | Horizontal split — new pane to the right | — |
| `%` | Vertical split — new pane below | — |
| Arrow keys | Spatial navigation between panes | Left/Right between doors, Up to panes |
| `Cmd+Arrow` | Swap session content with neighbor | — |
| `Enter` | Enter passthrough mode | Restore session + enter passthrough |
| `,` | Inline rename | — |
| `x` | Kill with confirmation | Restore session + kill confirmation |
| `d` | Minimize to door | Restore session (stay in command) |
| `z` | Toggle maximize/restore | — |
| `t` | Toggle TODO flag (none/soft → hard → none) | — |
| `a` | Dismiss or toggle alert | — |

### Kill confirmation

Pressing `x` (or clicking the kill button) enters command mode and shows a pane-centered semi-transparent overlay (`KillConfirmOverlay` → `KillConfirmCard`) with a random uppercase letter (A-Z, excluding X). Typing that letter confirms the kill (destroys session, removes pane). Cancel with Escape key, clicking the `[ESC] to cancel` button, or clicking another panel. Any other key triggers a shake animation (400ms `shake-x` keyframe) then auto-dismisses the confirmation.

## Selection overlay

A fixed-positioned element rendered on top of dockview. Covers the active element's area inflated by 3px (half the 6px gap) for panes, or 2px for doors.

- A pane or door can be **active** or **inactive**. Only one element is active at a time.
- **Passthrough:** `border: 2px solid ${color}` + `box-shadow: 0 0 15px color-mix(in srgb, ${color} 30%, transparent)`
- **Command:** animated SVG marching-ants border — rounded rectangle path with `stroke-dasharray` animation (10px segment, 60% dash / 40% gap, 0.4s cycle, 2px stroke)
- Border radius: `0.5rem` for panes, `0.375rem 0.375rem 0 0` for doors
- Color from CSS custom property `--mt-selection-terminal`
- `z-index: 50`, `pointer-events: none`, `transition: 150ms`

### Position tracking
- Each `TerminalPanel` registers its DOM element in a `panelElements` Map on mount, removes on unmount
- Door elements are registered by the `Baseboard` via `DoorElementsContext` (queries `[data-door-id]` attributes)
- Updates on: selection change, resize (`ResizeObserver`), layout change (`api.onDidLayoutChange`)

## Spatial navigation

### Direction detection

Uses DOM positions of pane elements (registered in `panelElements` Map). For each candidate:

1. **Edge-based direction check**: candidate must be entirely in the correct direction on the primary axis
2. **Overlap requirement**: candidate must overlap on the secondary axis
3. **Distance**: edge-to-edge on the primary axis
4. **Fallback**: if no overlapping candidate, nearest non-overlapping candidate

### Back-navigation

A breadcrumb tracks the last navigation direction and origin pane. Pressing the opposite direction returns to the origin instead of spatial lookup. This handles asymmetric layouts (tall pane left, stacked panes right).

### Pane-to-door navigation

Down from the bottom-most pane navigates to the first door in the baseboard. Up from a door navigates to the last pane. Left/Right navigates between doors.

### Cmd+Arrow swap

Swaps session **content** between two panes — the layout shape is unchanged. Uses `swapTerminals()` from terminal-registry which swaps registry entries and reattaches DOM elements to each other's containers. Also swaps dockview panel titles. Selection follows the moved session. Uses the same back-navigation breadcrumb as arrow keys.

## Minimize and reattach

### Minimize (`m` key or minimize header button)
1. Capture reattach context before removing:
   - `neighborId` and `direction`: spatial position relative to nearest neighbor
   - `remainingPaneIds`: sorted IDs of panes that stay
   - `layoutAtMinimize`: full layout snapshot
   - `layoutAtMinimizeSignature`: structural fingerprint (ignores sizes)
2. Remove pane from dockview (`api.removePanel`)
3. Add to `doors` state → door appears in baseboard
4. Session stays in registry (not disposed)
5. Selection moves to the new door (stays in command mode)

### Reattach (click door, Enter/d on door)
Three strategies based on layout state:

**Exact reattach** (layout structure signature matches AND same panes exist):
- Deserialize the saved layout snapshot with `reuseExistingPanels: true`
- Preserves exact split ratios from before minimize

**Neighbor reattach** (neighbor still exists AND pane set matches `remainingPaneIds`):
- `addPanel` with `position: { referencePanel: neighborId, direction }`
- Restores original position relative to neighbor

**Aspect-ratio split** (layout changed):
- Split the currently selected pane
- Direction: wider than tall → split right, otherwise split below

## Inline rename

Triggered by pressing `,` in command mode or clicking the session name in the pane header.

The name `<span>` is replaced by an `<input>` with:
- Same font (`font-mono font-medium`), `bg-transparent`, no border
- Text pre-selected on mount
- `Enter` confirms, `Escape` cancels, `blur` confirms
- `stopPropagation` on `mousedown`/`click`/`keydown` to prevent panel click or drag
- All command-mode shortcuts are bypassed while renaming

## Session lifecycle and terminal registry

Pane IDs are session IDs. `TerminalPane` calls `getOrCreateTerminal(id)` on React mount and `unmountElement(id)` on React unmount. The session (xterm.js instance, PTY, DOM element) persists in the registry across mount/unmount cycles — the DOM element is detached from its container but the Registry entry stays `Mounted`.

- **Create**: `getOrCreateTerminal` spawns xterm.js + FitAddon + PTY, returns existing if already created
- **Resume**: `resumeTerminal` creates xterm entry and writes replay data without spawning a new PTY. Used when the webview is recreated while the host retains Live PTYs (Link: Severed → Resuming → Live).
- **Restore**: `restoreTerminal` creates xterm entry and spawns a new PTY with saved cwd and scrollback. Used on cold start from a saved Snapshot (Link: Cold → Live).
- **mount / unmount (DOM)**: `mountElement` reparents the persistent DOM element into a container; `unmountElement` removes it. The Registry entry survives.
- **Dispose**: `disposeSession` kills the PTY, disposes xterm, removes the registry entry. Only called on explicit kill (`x`).
- **Swap**: `swapTerminals` swaps two registry entries and reattaches DOM elements to each other's containers.

### Session persistence

Layout, scrollback, cwd, minimized items, and alert state are saved to persistent storage via a debounced save (500ms). Saves are triggered by layout changes, panel add/remove, and a 30s periodic interval. Saves are flushed immediately on PTY exit, `pagehide`, and extension shutdown requests.

On startup, recovery is priority-based:
1. **Resume** (webview hidden/shown, live PTYs): request PTY list + replay data from platform, `resumeTerminal()` for each (500ms timeout). If the saved session covers every live PTY, restore the saved dockview layout when its visible panel set matches and reattach saved minimized items as doors. This still counts as a live resume when every live session is minimized, so recovery must not fall through to cold restore just because the visible `paneIds` list is empty.
2. **Restore** (app restart, cold start): restore layout from serialized dockview state, `restoreTerminal()` for each pane with saved cwd + scrollback, and spawn each PTY with the current default shell selection
3. **Fallback/manual pane creation**: when no saved layout can be safely applied, add multiple panes as splits from the previous pane rather than tabs
4. **Empty state**: create a single new pane

### Activity state

Each session carries `ActivityState` with `status: SessionStatus` and `todo: TodoState`. These are synced to React via `useSyncExternalStore`. State that arrives from the platform before a registry entry exists (resume scenario) is held as "primed state" and applied when the registry entry is created.

## Theme

Custom `mousetermTheme` extends dockview's `themeAbyss`:
- `gap: 6` — 6px between groups in both directions
- `dndOverlayMounting: 'absolute'`, `dndPanelOverlay: 'group'`
- Pane header height: `--dv-tabs-and-actions-container-height: 30px`
- 6px padding around the dockview area (`p-1.5` on wrapper, `inset-1.5` on container)

Colors use a two-layer CSS variable strategy: `@theme --color-*` tokens → `var(--vscode-*, <fallback>)`. In VSCode, host theme variables take precedence. In standalone mode, fallback values apply with `prefers-color-scheme: light` overrides. Tailwind v4 `@theme` block registers `--color-*` tokens as Tailwind colors (e.g., `bg-surface`, `text-foreground`, `border-border`). See `theme.css` for the full token map.

Dockview's separator borders, sash handles, and groupview borders are all set to transparent/none — the 6px gap is the only visual separator between panes. All dockview container backgrounds are flattened to `var(--color-surface)`.

## Animations

All pane-related motion is 440ms with `cubic-bezier(0.22, 1, 0.36, 1)` and uses `clip-path` (not `transform`) so `getBoundingClientRect` remains accurate during animation — the selection overlay measures the real post-animation bounds without lag. Reduced-motion users skip every animation described below.

### Spawn (new pane reveal)

When a pane is added, its dockview group element gets a directional `.pane-spawning-from-{left,top,top-left}` class. The clip-path starts fully closed from the opposite edge(s) and reveals to `inset(0)`. Direction is chosen by how the pane was born:

- **Horizontal split** (new pane on the right) → reveal from the left edge.
- **Vertical split** (new pane below) → reveal from the top edge.
- **Auto-spawn after last-pane kill/minimize** → reveal from the top-left corner.

The direction is carried via `FreshlySpawnedContext` — a `Map<paneId, SpawnDirection>` written by the spawn call site and consumed once by `TerminalPanel`'s `useLayoutEffect` on first mount.

### Kill (in-place fade + FLIP reclaim)

`orchestrateKill(api, killedId)` in `Pond.tsx` runs on kill confirmation. It fades the real pane element in place (its content dissolves against the same-colored background), then removes the panel and FLIP-reveals the survivors:

1. Add `.pane-fading-out` (or `.pane-fading-and-shrinking-to-br` for a last-pane kill) to the killed pane's group element. Block pointer events during the fade.
2. On `animationend`, snapshot `getBoundingClientRect` for every surviving panel's group element.
3. `disposeSession` + `api.removePanel`; dockview snaps the layout.
4. Measure post-rects. Any panel whose rect grew is a "grower."
5. For each grower, apply an inline `clip-path: inset(...)` with the newly-claimed territory clipped off, force a reflow, then transition to `inset(0)`. This reveals the grower into the vacated space without affecting `getBoundingClientRect`. Clears on `transitionend`.

Case handling is purely rect-based (measure before and after removal), so 2-pane splits, linear 3+ rows/columns, and nested splits all fall through the same code path with no per-case branching.

### Auto-spawn delay

When `onDidRemovePanel` triggers the "always keep one pane visible" auto-spawn (see corner case #10), the `api.addPanel` call is deferred by 440ms. This lets the outgoing animation (kill ghost crush, or minimize's selection-overlay slide to the door) complete before the replacement's reveal starts — they play sequentially in the same screen region instead of fighting each other. The deferred spawn re-checks `totalPanels` at fire time and becomes a no-op if anything repopulated the pane area during the delay (e.g. a door reattach).

The deferred spawn also only calls `selectPanel` if selection is null. The kill handler clears selection to null, so the new pane takes focus. The minimize flow sets selection to the just-created door; preserving that door focus across the delay is the point.

## Corner cases

1. **Dual React instance**: dockview bundles its own React. Fixed with `resolve.dedupe: ['react', 'react-dom']` in Vite config.
2. **White screen on boot**: `DockviewReact` needs pixel dimensions. Fixed with relative wrapper + absolute inner container.
3. **Theme as prop**: dockview v5 uses `theme={themeObject}` prop, not a CSS class.
4. **xterm steals Meta keys**: mode-exit gesture uses `capture: true` on the window keydown listener.
5. **Click doesn't focus terminal**: focus deferred to `requestAnimationFrame` to prevent dockview from stealing it.
6. **Stale hitboxes after DnD**: each `TerminalPanel` registers its own DOM element in a Map for overlay/navigation.
7. **Asymmetric back-navigation**: breadcrumb tracks last direction + origin for opposite-direction return.
8. **Center drop merges panels**: intercepted at group-level `model.onWillDrop` and converted to a swap.
9. **Group drag has null panelId**: falls back to `api.getGroup(groupId).activePanel.id`.
10. **Auto-spawn on empty**: `onDidRemovePanel` creates a new session whenever the last visible pane is removed, whether or not doors exist — there is always a pane visible. The `addPanel` call is delayed 440ms (see "Auto-spawn delay" under Animations) so the outgoing kill/minimize animation finishes first.
11. **Door focus survives auto-spawn**: `api.addPanel` auto-activates the new panel, firing `onDidActivePanelChange`. When the current selection is a door (e.g., just-minimized last pane), that listener must not flip `selectedId` to the new pane — otherwise `selectedType === 'door'` + `selectedId === newPaneId` desyncs and the door loses its highlight while the SelectionOverlay is stuck on the stale door rect. The listener early-returns when `selectedType === 'door'`.

## Files

| File | Role |
|------|------|
| `lib/src/components/Pond.tsx` | Main layout orchestrator: modes, keyboard, selection overlay, minimize/reattach. Also defines `TerminalPanel`, `TerminalPaneHeader`, `KillConfirmOverlay` |
| `lib/src/components/Baseboard.tsx` | Always-visible bottom strip with door components, overflow arrows, and shortcut hints |
| `lib/src/components/Door.tsx` | Individual door element — mouse-hole styled button with alert/TODO indicators |
| `lib/src/components/TerminalPane.tsx` | Thin xterm.js mount point — mounts/unmounts persistent session elements |
| `lib/src/lib/terminal-registry.ts` | Session lifecycle: create, resume, restore, mount, unmount, dispose, swap, focus, refit. Activity state store |
| `lib/src/lib/spatial-nav.ts` | Spatial navigation (`findPanelInDirection`) and reattach-neighbor detection (`findReattachNeighbor`) |
| `lib/src/lib/layout-snapshot.ts` | Layout cloning (`cloneLayout`) and structural signature (`getLayoutStructureSignature`) for restore comparison |
| `lib/src/lib/activity-monitor.ts` | Per-session activity state machine: output timing → alert escalation |
| `lib/src/lib/alert-manager.ts` | Manages ActivityMonitors + attention tracking + TODO state per session |
| `lib/src/lib/session-types.ts` | Type definitions for persisted sessions (`PersistedPane`, `PersistedDoor`, `PersistedSession`) |
| `lib/src/lib/session-save.ts` | Serialization: collects layout, scrollback, cwd, alert state for persistence |
| `lib/src/lib/session-restore.ts` | Deserialization: loads saved session, calls `restoreTerminal()` for each pane |
| `lib/src/lib/reconnect.ts` | Priority-based recovery: live PTYs first, then saved session, then empty |
| `lib/src/lib/resume-patterns.ts` | Detects resumable commands (`claude --resume`, etc.) in scrollback |
| `lib/src/index.css` | Dockview theme overrides — separator/sash/border removal, background flattening |
| `lib/src/theme.css` | Two-layer VSCode theme token system (`@theme --color-*` → `--vscode-*`) and Tailwind v4 `@theme` integration |
