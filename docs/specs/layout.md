# Layout Spec

## Conceptual model

A **Session** is a single PTY instance — a running shell process with its scrollback, environment, and working directory. Sessions are managed by the terminal registry and persist independently of how they are displayed. Each session also carries UI state: an alarm status (from the activity monitor) and an optional TODO flag.

A Session can be in one of two containers:

- **Pane** — a visible container in the content area. The session's terminal output is rendered via xterm.js. The pane has a header with controls and acts as the drag handle for layout rearrangement.
- **Door** — a minimized container in the baseboard. The session is still alive (PTY running, output buffered) but not visible. The door shows the session's title plus alarm and TODO indicators, and looks like a mouse hole cut into the baseboard.

Transitioning between Pane and Door does not alter the Session in any way. Detaching a pane creates a door; reattaching a door creates a pane. The terminal content, scrollback, and process state are preserved across transitions.

## Shell layout

There are two areas:

- **Content** — tiling layout containing Panes, powered by dockview
- **Baseboard** — always-visible bottom strip containing Doors and shortcut hints

The user can navigate between all elements using the mouse, or by entering `command` mode and using the keyboard.

```
Pond
├── Context providers (Mode, SelectedId, PondActions, PanelElements, DoorElements, RenamingId, Zoomed)
│   └── div (h-screen, flex col)
│       ├── Dockview wrapper (flex-1, 6px padding around edges)
│       │   ├── DockviewReact (tiling layout engine, singleTabMode="fullwidth")
│       │   │   └── Groups (one session per group, no tab stacking)
│       │   │       ├── TerminalPanel → TerminalPane → xterm.js
│       │   │       └── TerminalPaneHeader (tab component, drag handle)
│       │   └── SelectionOverlay (fixed positioned, pointer-events: none)
│       ├── Baseboard (always-visible bottom strip, shortcut hints when empty)
│       │   └── Door components (one per detached session)
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
- Session lifecycle: detach (pane → door), reattach (door → pane), kill
- Terminal lifecycle (via terminal-registry)
- Activity monitoring and alarm state
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

Each pane has a 30px header that doubles as a drag handle. The header uses `cursor-grab` / `active:cursor-grabbing` and `select-none`. Background uses `--mt-tab-*` theme tokens (adapts to VSCode host theme). Dockview's default close button and right-actions container are hidden via CSS.

Elements from left to right:

- Session name (click to rename, truncates with ellipsis)
- Alarm bell button (reflects session activity status)
- TODO pill (if todo state is set; hidden in minimal tier)
- Flexible gap
- SplitHorizontalIcon `split horizontal ["]` (full tier only)
- SplitVerticalIcon `split vertical [%]` (full tier only)
- ArrowsOutIcon / ArrowsInIcon `zoom / unzoom [z]` (full tier only)
- ArrowLineDownIcon `detach [d]`
- XIcon `kill [x]` (hover turns error-red)

The alarm bell and TODO pill are defined in `docs/specs/alarm.md` (visual states, interaction, context menu, and hardening).

### Pane header responsive sizing

The header adapts to available width via ResizeObserver in three tiers:

- **Full** (>280px): all controls visible — alarm, TODO, split, zoom, detach, kill
- **Compact** (160–280px): SplitH/SplitV/Zoom hidden; alarm, TODO, detach, kill visible
- **Minimal** (<160px): SplitH/SplitV/Zoom and TODO pill hidden; alarm, detach, kill visible. Session name truncates with ellipsis as needed.

## Baseboard

Below the content area is the baseboard (`h-8`, 32px). It is always visible — a thin strip when empty, showing keyboard shortcut hints when there are no doors and the container is wider than 350px (currently: `LCmd → RCmd to enter command mode`).

When a session is detached, it becomes a **door** on the baseboard. The door displays the session's title, a TODO badge (if set), and an alarm bell icon with activity dot. It uses the bottom edge of the window as its bottom border, with left, top, and right borders with `rounded-t-md` — resembling a mouse hole. Door dimensions: `min-w-[68px] max-w-[220px] h-6`.

### Door interaction

- **Clicking a door** (in any mode): restores the session into the content area as a pane and enters passthrough mode. The terminal gets focus immediately.
- **Enter** on a door (command mode): same as clicking — restores and enters passthrough mode.
- **d** on a door (command mode): restores the session into a pane but stays in command mode. This is the inverse of pressing `d` on a pane (which detaches it), making `d` a toggle.
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
| `d` | Detach to door | Restore session (stay in command) |
| `z` | Toggle maximize/restore | — |
| `t` | Toggle TODO flag (none → soft → hard → none) | — |
| `a` | Dismiss or toggle alarm | — |

### Kill confirmation

Pressing `x` shows a pane-centered semi-transparent overlay (`KillConfirmOverlay` → `KillConfirmCard`) with a random uppercase letter (A-Z, excluding X). Typing that letter confirms the kill (destroys session, removes pane). Escape cancels.

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

## Detach and reattach

### Detach (`d` key or detach header button)
1. Capture restore context before removing:
   - `neighborId` and `direction`: spatial position relative to nearest neighbor
   - `remainingPanelIds`: sorted IDs of panes that stay
   - `restoreLayout`: full layout snapshot
   - `detachedLayoutSignature`: structural fingerprint (ignores sizes)
2. Remove pane from dockview (`api.removePanel`)
3. Add to `detached` state → door appears in baseboard
4. Session stays alive in registry (not destroyed)
5. Selection moves to the new door (stays in command mode)

### Reattach (click door, Enter/d on door)
Three strategies based on layout state:

**Exact restore** (layout structure signature matches AND same panes exist):
- Deserialize the saved layout snapshot with `reuseExistingPanels: true`
- Preserves exact split ratios from before detach

**Neighbor restore** (neighbor still exists AND pane set matches `remainingPanelIds`):
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

Pane IDs are session IDs. `TerminalPane` calls `getOrCreateTerminal(id)` on mount and `detachTerminal(id)` on unmount. The session (xterm.js instance, PTY, DOM element) persists in the registry across mount/unmount cycles.

- **Create**: `getOrCreateTerminal` spawns xterm.js + FitAddon + PTY, returns existing if already created
- **Reconnect**: `reconnectTerminal` creates xterm entry and writes replay data without spawning a new PTY (used after webview recreation when platform preserves live PTYs)
- **Restore**: `restoreTerminal` creates xterm entry and spawns new PTY with saved cwd and scrollback (used on app restart from saved session)
- **Attach/detach**: moves the persistent DOM element in/out of a container — no session state loss
- **Destroy**: `destroyTerminal` kills PTY, disposes xterm, removes from registry. Only called on explicit kill (`x`).
- **Swap**: `swapTerminals` swaps two registry entries and reattaches DOM elements to each other's containers

### Session persistence

Layout, scrollback, cwd, detached items, and alarm state are saved to persistent storage via a debounced save (500ms). Saves are triggered by layout changes, panel add/remove, and a 30s periodic interval. Saves are flushed immediately on PTY exit, `pagehide`, and extension shutdown requests.

On startup, recovery is priority-based:
1. **Live PTYs** (webview hidden/shown): request PTY list + replay data from platform, `reconnectTerminal()` for each (500ms timeout)
2. **Saved session** (app restart): restore layout from serialized dockview state, `restoreTerminal()` for each pane with saved cwd + scrollback
3. **Empty state**: create a single new pane

### Session UI state

Each session carries `SessionUiState` with `status: SessionStatus` and `todo: TodoState`. These are synced to React via `useSyncExternalStore`. State that arrives from the platform before a terminal entry is created (reconnect scenario) is held as "primed state" and applied when the terminal is finally created.

## Theme

Custom `mousetermTheme` extends dockview's `themeAbyss`:
- `gap: 6` — 6px between groups in both directions
- `dndOverlayMounting: 'absolute'`, `dndPanelOverlay: 'group'`
- Pane header height: `--dv-tabs-and-actions-container-height: 30px`
- 6px padding around the dockview area (`p-1.5` on wrapper, `inset-1.5` on container)

Colors use a two-layer CSS variable strategy: `--mt-*` semantic tokens → `var(--vscode-*, <fallback>)`. In VSCode, host theme variables take precedence. In standalone mode, fallback values apply (Dark+ defaults with `prefers-color-scheme: light` overrides). Tailwind v4 `@theme` block registers `--mt-*` tokens as Tailwind colors (e.g., `bg-surface`, `text-foreground`, `border-border`). See `theme.css` for the full token map.

Dockview's separator borders, sash handles, and groupview borders are all set to transparent/none — the 6px gap is the only visual separator between panes. All dockview container backgrounds are flattened to `var(--mt-surface)`.

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
10. **Auto-spawn on empty**: `onDidRemovePanel` creates a new session when the last pane is removed and no doors exist.

## Files

| File | Role |
|------|------|
| `lib/src/components/Pond.tsx` | Main layout orchestrator: modes, keyboard, selection overlay, detach/reattach. Also defines `TerminalPanel`, `TerminalPaneHeader`, `KillConfirmOverlay` |
| `lib/src/components/Baseboard.tsx` | Always-visible bottom strip with door components, overflow arrows, and shortcut hints |
| `lib/src/components/Door.tsx` | Individual door element — mouse-hole styled button with alarm/TODO indicators |
| `lib/src/components/TerminalPane.tsx` | Thin xterm.js mount point — attaches/detaches persistent session elements |
| `lib/src/lib/terminal-registry.ts` | Session lifecycle: create, reconnect, restore, attach, detach, destroy, swap, focus, refit. Session UI state store |
| `lib/src/lib/spatial-nav.ts` | Spatial navigation (`findPanelInDirection`) and restore-neighbor detection (`findRestoreNeighbor`) |
| `lib/src/lib/layout-snapshot.ts` | Layout cloning (`cloneLayout`) and structural signature (`getLayoutStructureSignature`) for restore comparison |
| `lib/src/lib/activity-monitor.ts` | Per-session activity state machine: output timing → alarm escalation |
| `lib/src/lib/alarm-manager.ts` | Manages ActivityMonitors + attention tracking + TODO state per session |
| `lib/src/lib/session-types.ts` | Type definitions for persisted sessions (`PersistedPane`, `PersistedDetachedItem`, `PersistedSession`) |
| `lib/src/lib/session-save.ts` | Serialization: collects layout, scrollback, cwd, alarm state for persistence |
| `lib/src/lib/session-restore.ts` | Deserialization: loads saved session, calls `restoreTerminal()` for each pane |
| `lib/src/lib/reconnect.ts` | Priority-based recovery: live PTYs first, then saved session, then empty |
| `lib/src/lib/resume-patterns.ts` | Detects resumable commands (`claude --resume`, etc.) in scrollback |
| `lib/src/index.css` | Dockview theme overrides — separator/sash/border removal, background flattening |
| `lib/src/theme.css` | Two-layer VSCode theme token system (`--mt-*` → `--vscode-*`) and Tailwind v4 `@theme` integration |
