# Implementation Plan: Mouse and Clipboard

Source spec: `docs/specs/mouse-and-clipboard.md`. Read it first — the spec is the contract; this plan is the build order and the technical approach.

## Overview

Build terminal-owned text selection, copy (Raw and Rewrapped), bracketed paste, smart URL/path extension, and a mouse-reporting override UI on top of xterm.js. The work lives almost entirely in `lib/`, touches `Pond.tsx` for keyboard interception and header chrome, and introduces one new runtime module (`mouse-selection.ts`) plus a small overlay component. xterm's built-in selection and mouse forwarding stay disabled for the cells we manage; we own mouse and the relevant keystrokes directly at the DOM level and use xterm only as the character grid + renderer. Detection of the inside program's mouse-reporting and bracketed-paste regimes uses xterm's public `terminal.modes` plus parser hooks.

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Selection ownership** | Terminal fully owns selection at the DOM layer; xterm's built-in selection is disabled. | The spec requires block shapes, compositor-layer highlight, cross-boundary (scrollback→live) drags, auto-scroll, and content-anchored cancel-on-change. xterm's API can't express all of that, and mixing its selection with ours causes double-highlight bugs. Owning it end-to-end is cleaner than fighting xterm's selection state machine. |
| **Mouse regime detection** | Read `terminal.modes.mouseTrackingMode` (public) and also install a `parser.registerCsiHandler` pair for DECSET/DECRST `?1000/?1002/?1003/?1006/?2004` that returns `false` (doesn't consume) so we observe changes synchronously with the escape sequence rather than polling. | The `modes` getter is the spec-intended public API but has no change event; the parser hook gives change notification without forking xterm. Returning `false` keeps xterm's own handling intact. |
| **Where the mouse/override state lives** | New module `lib/src/lib/mouse-selection.ts` with a `Map<terminalId, MouseSelectionState>` paralleling `terminal-registry.ts`. Exposes a subscription API (same `subscribeTo*`/`get*Snapshot` shape as the existing session-state API) so React can `useSyncExternalStore` it. | Matches the existing pattern for per-terminal state (`getSessionStateSnapshot` in `terminal-registry.ts`). Keeping it in a separate file keeps `terminal-registry.ts` from growing further and is easy to unit-test without DOM. |
| **Mouse event interception point** | Attach capture-phase `mousedown`/`mousemove`/`mouseup`/`wheel` listeners directly to `entry.element` (the persistent div xterm renders into) inside `setupTerminalEntry` in `terminal-registry.ts`. Decide per-event whether to forward to xterm (let it bubble) or handle ourselves (call `stopPropagation`). | `entry.element` is the right scope: listeners follow the terminal through reparenting and don't leak across panes. Capture phase gives us first shot before xterm's own listeners. |
| **Keyboard interception point (Cmd+C, Cmd+V, etc.)** | Extend the existing window-level capture keydown handler in `Pond.tsx` (the one around line 1575 that already handles the LCmd→RCmd gesture). In `passthrough` mode it currently short-circuits — add the selection/paste shortcuts as the first check before that short-circuit. | Reuses the single keyboard entry point that already handles "capture before xterm." Avoids a second global listener. Also makes the shortcut behavior identical in command and passthrough mode, which the spec requires. |
| **Selection rendering** | Absolute-positioned `<div>` overlay child of `entry.element`, one highlight rectangle per selected row (linewise) or one rectangle total (block). Cell→pixel math uses xterm's public `terminal.cols`, `terminal.rows`, and the measured element bounding rect (`getBoundingClientRect()`) so cell width/height = `element.clientWidth / cols`, `element.clientHeight / rows`. | Public API only, no `_core` internals. The highlight div is pointer-events:none so it doesn't eat the drag. Re-render on scroll, resize, and selection change. |
| **Scrollback coordinate model** | Track the selection as `{ startRow, startCol, endRow, endCol, shape }` in **absolute buffer rows** (including scrollback), not viewport rows. Use `terminal.buffer.active.viewportY` to translate to viewport on render. | Matches the spec's "selection follows content on scroll." Pure-scroll becomes free (the translation naturally updates); cancel-on-change compares absolute-row cell contents between renders. |
| **Content-change detection (cancel-on-change, §3.4)** | On `terminal.onRender`, diff the cells in the selection's absolute-row range against a cached snapshot taken at selection start. Only cancel when a diff lands inside the rectangle, not elsewhere. | Cheap (bounded to selection size) and satisfies the spec's narrow rule. |
| **Clipboard API** | `navigator.clipboard.writeText(...)` from the webview directly. No platform-adapter round trip. Read is not needed for MVP paste (we write clipboard contents to the PTY — read is needed too; use `navigator.clipboard.readText()`). | VSCode webviews and Tauri webviews both expose the async Clipboard API. Keeps the adapter surface minimal. If a platform lacks permission we fall back with a toast. |
| **Platform detection (§8.4)** | `navigator.platform` / `navigator.userAgentData` at startup — test for macOS with `/Mac|iPhone|iPad/`. Store result in a small `isMac` helper in `lib/src/lib/platform/`. | All three host environments (standalone, VSCode webview, website) run in a real browser/webview, so this works uniformly. No host round-trip needed. |
| **Bracketed-paste toggling** | Read `terminal.modes.bracketedPasteMode` at paste time; wrap with `\e[200~` / `\e[201~` when true. No per-terminal cached flag needed since `modes` is already authoritative. | Simpler than mirroring state and guaranteed consistent with what the inside program last set. |
| **Copy Rewrapped heuristics** | Initial rules shipped as the first cut (see §4.1.2): (a) unwrap single newlines inside runs of non-blank lines where the previous line ends with a non-whitespace, non-sentence-terminator char and the next starts with lowercase/continuation; (b) strip leading/trailing runs of box-drawing Unicode (`U+2500–U+257F`, `U+2550–U+256C`, etc.) when they occupy full-width runs. Lives in `lib/src/lib/rewrap.ts` with a pure-function API and table-driven tests. | The spec leaves this implementation-defined but still requires *something* to ship. A standalone pure module makes it easy to iterate heuristics without touching the selection plumbing. |
| **Selection hint / popup positioning** | Render as children of `entry.element`, absolute-positioned using the same cell-pixel math. Clamp to viewport. | Co-located with the overlay so it follows the terminal on reparent (detach/reattach) without extra work. |
| **Storybook coverage** | One new story file per visual component: `MouseHeaderIcon.stories.tsx`, `SelectionPopup.stories.tsx`, `SelectionOverlay.stories.tsx` (rename the existing "selection ring" story file to `PaneSelectionRing.stories.tsx` to free the name). | Matches the project's existing Storybook-first component workflow. Chromatic already in CI. |

## Story-by-Story Plan

### Story A.1: Per-terminal mouse state module

**What to build:**
A new module that owns the mouse-reporting / override / selection state for each terminal, plus a React subscription surface.

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` (new) — `MouseSelectionState` type, Map keyed by terminal id, `getSnapshot`/`subscribe`/`setMouseReporting`/`setOverride`/`setSelection`/etc., mirroring the shape of the session-state API in `terminal-registry.ts:63-91`.
- `lib/src/lib/mouse-selection.test.ts` (new) — state-machine tests (no DOM).

**Approach:**
- State shape: `{ mouseReporting: 'none' | 'x10' | 'vt200' | 'drag' | 'any', bracketedPaste: boolean, override: 'off' | 'temporary' | 'permanent', selection: Selection | null, hintToken: TokenHint | null }`.
- Follow the exact pattern of `subscribeToSessionStateChanges` / `getSessionStateSnapshot` / cached-snapshot invalidation from `terminal-registry.ts`. The API will be consumed via `useSyncExternalStore`.
- No DOM imports; this module is pure state.

**Test approach:**
- Unit tests for each state transition: mouse-reporting on/off, override on → temporary → permanent → off, override auto-end when program stops requesting mouse reporting.
- Verify snapshot cache invalidation on every change (listener called exactly once per change).

**Risk/complexity:** Low.

**Dependencies:** None.

---

### Story A.2: Mouse-regime and bracketed-paste detection

**What to build:**
Wire xterm's DEC private mode sequences into the mouse-selection store so every terminal reports its current regime.

**Files to create/modify:**
- `lib/src/lib/terminal-registry.ts` — in `setupTerminalEntry` (around line 307), after `terminal.open(element)`, register parser hooks for `CSI ? ... h` and `CSI ? ... l` that call `mouseSelection.setMouseReporting` / `setBracketedPaste` for params `1000, 1002, 1003, 1006, 2004`. Handlers return `false` so xterm still processes them. On terminal dispose, dispose the hook registrations.
- `lib/src/lib/terminal-registry.alarm.test.ts` and/or a new `terminal-registry.mouse.test.ts` — verify hooks fire on DECSET/DECRST sequences written to the terminal.

**Approach:**
- Use `terminal.parser.registerCsiHandler({ final: 'h', prefix: '?' }, params => { ...; return false })` and the matching `'l'` variant (xterm's `IFunctionIdentifier` accepts `prefix` and `final`).
- After every change, also read `terminal.modes.mouseTrackingMode` and `terminal.modes.bracketedPasteMode` as the authoritative source (belt-and-suspenders; the mode getter is the one the rest of the system queries).
- When `mouseReporting` transitions from non-`none` → `none`, auto-end any active override and snapshot the state (§2).

**Test approach:**
- Feed a test terminal `\x1b[?1000h`, `\x1b[?1006h`, `\x1b[?2004h`, verify `mouseSelection.getState(id)` reflects each change.
- Feed `\x1b[?1000l` after an override was active — verify override auto-cleared.

**Risk/complexity:** Low-Medium — need to confirm parser hooks fire even when xterm has its own handler (spec says they do, but verify).

**Dependencies:** A.1.

---

### Story A.3: Platform detection helper

**What to build:**
A tiny `isMac()` / `modKeyIsMeta` helper that paste/copy code keys off.

**Files to create/modify:**
- `lib/src/lib/platform/index.ts` — add `export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)`.
- Any consumers import from `../platform`.

**Approach:** Constant, computed once at module load. No tests needed.

**Risk/complexity:** Low.

**Dependencies:** None.

---

### Story B.1: Mouse / No-Mouse header icon

**What to build:**
The header indicator (§1) with its two states, hover text, and click behavior.

**Files to create/modify:**
- `lib/src/components/Pond.tsx` — inside `TerminalPaneHeader` (line 525), add a new icon button slot rendered between the title and the alarm bell, using the same `HeaderActionButton` wrapper and phosphor icons. Use `CursorClickIcon` for the base; composite `ProhibitIcon` on top for the override state (the spec calls this out explicitly). Hidden when `mouseReporting === 'none'` and no override is active.
- `lib/src/stories/MouseHeaderIcon.stories.tsx` (new) — four stories: reporting-off, reporting-on, temporary-override, permanent-override.

**Approach:**
- Subscribe to `mouseSelection` via `useSyncExternalStore` the same way `TerminalPaneHeader` already subscribes to session state (line 531).
- Click handler calls into `mouseSelection.setOverride('temporary')` / `mouseSelection.setOverride('off')`.
- Use existing `HeaderActionButton` so tooltip and styling match the alarm bell.
- Tooltip text comes verbatim from spec §1.2.

**Test approach:**
- Storybook visual coverage (Chromatic picks it up).
- No new unit tests — state transitions are already covered by A.1.

**Risk/complexity:** Low.

**Dependencies:** A.1, A.2.

---

### Story B.2: Temporary-override banner

**What to build:**
The banner next to the No-Mouse icon with `[Make permanent]` and `[Cancel]` buttons (§2).

**Files to create/modify:**
- `lib/src/components/Pond.tsx` — add a `TempOverrideBanner` component rendered next to the header icon; visible only when `override === 'temporary'`.
- `lib/src/lib/mouse-selection.ts` — add the "temporary override ends on next terminal-area mouse-up" logic. The banner click buttons route to `setOverride('permanent')` / `setOverride('off')`. The mouse-up logic lives in the mouse-event listeners wired up in C.1.

**Approach:**
- Banner reuses Tailwind chrome tokens (`bg-surface-raised`, `text-foreground`, etc.); no new color choices.
- The spec's orphan-mouse-up rule (§2.1) is handled in C.1 where mouse events originate.

**Test approach:**
- Storybook for both banner states.
- Unit test in `mouse-selection.test.ts`: override='temporary' + simulated mouse-up → override='off'; orphan mouse-up (no prior mouse-down) → override remains.

**Risk/complexity:** Low.

**Dependencies:** B.1.

---

### Story C.1: Mouse event router

**What to build:**
The DOM-level mouse listener on `entry.element` that decides, per event, whether the terminal or the inside program handles it — per the state matrix in spec §6.1.

**Files to create/modify:**
- `lib/src/lib/terminal-registry.ts` — in `setupTerminalEntry`, add capture-phase `mousedown`/`mousemove`/`mouseup`/`wheel` listeners on `element`. Route to `mouse-selection.ts`'s `handleMouseEvent(id, ev)`. Register cleanup in the existing `cleanup` function (line 363).
- `lib/src/lib/mouse-selection.ts` — add `handleMouseEvent` that implements the state matrix: terminal-handled drags update selection, mouse-reported events are left alone to bubble to xterm, scrollback drags are always terminal-handled.
- Use `terminal.buffer.active.viewportY` to map mouse Y → absolute buffer row; cell X from `event.offsetX / cellWidth`.

**Approach:**
- Before doing anything, classify the event: was it in scrollback (row < viewportY), in the live region, or on chrome?
- For events we handle, call `stopPropagation()` and update selection state. For events xterm should handle, do nothing (xterm's own listeners fire on bubble).
- Disable xterm's own right-click-selects-word (`terminal.options.rightClickSelectsWord = false`) and selection (there is no direct option; setting a custom theme where selectionBackground is transparent is one workaround, but the cleaner approach is `terminal.options.selectionBlacklist`? — **see Open Questions**).

**Test approach:**
- Unit tests in `mouse-selection.test.ts` using synthetic event fixtures and a stub terminal that exposes `{ cols, rows, buffer: { active: { viewportY } } }`.
- Case coverage: terminal-handled drag in live region with reporting off, program-forwarded event with reporting on and no override, scrollback drag with reporting on (always terminal), cross-boundary drag.

**Risk/complexity:** Medium — the interaction with xterm's own selection is the main unknown. See Open Questions.

**Dependencies:** A.1, A.2.

---

### Story C.2: Selection overlay rendering

**What to build:**
The compositor-layer highlight that shows the current selection (§3.1, §7).

**Files to create/modify:**
- `lib/src/components/SelectionOverlay.tsx` (new) — component that reads current selection for a given terminal id (via `useSyncExternalStore` on `mouse-selection.ts`) and renders absolute-positioned rectangles.
- `lib/src/components/TerminalPane.tsx` — add the overlay as a sibling of the xterm container inside the mount div.
- `lib/src/stories/SelectionOverlay.stories.tsx` — replace existing (which is actually the pane-selection ring; rename that to `PaneSelectionRing.stories.tsx` and free this name) with real text-selection overlay stories.

**Approach:**
- Cell dimensions: measure once per resize via `terminal.element.clientWidth / terminal.cols` (via the registry's `element` and a ResizeObserver already in TerminalPane).
- Linewise shape: render N rectangles, one per row, clipped at selection's first/last columns for the first and last rows.
- Block shape: single rectangle.
- Use `--vscode-terminal-selectionBackground` as the fill color (already a CSS variable on the terminal theme — see `terminal-registry.ts:255`).
- Re-render on scroll, resize, and selection change.

**Test approach:**
- Storybook: full-row linewise, mid-line linewise, block, multi-row block, selection that crosses scroll boundary.
- No unit tests — this is pure visual geometry; rely on Chromatic.

**Risk/complexity:** Medium — cell-math + viewport-scroll coordination has edge cases (half-cells at viewport edges, wide characters).

**Dependencies:** C.1.

---

### Story C.3: Drag shapes + hint text

**What to build:**
Linewise by default, block when Alt held; the `Hold Alt for block selection` hint above the drag (§3.2, §3.3).

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` — track `event.altKey` during each drag move; update `selection.shape` live so releasing Alt mid-drag reverts.
- `lib/src/components/SelectionOverlay.tsx` — render the hint tooltip above the active selection. Reuse `text-xs` Tailwind class (no fixed pixels — per memory).

**Approach:**
- Add a window-level `keydown`/`keyup` listener during the drag only (attached in `handleMouseEvent` at drag-start, removed at drag-end) to catch Alt changes that happen while the mouse isn't moving.

**Test approach:**
- Storybook: drag-in-progress linewise with hint, drag-in-progress block with hint.

**Risk/complexity:** Low.

**Dependencies:** C.1, C.2.

---

### Story C.4: Selection follows content

**What to build:**
Pure-scroll translates the selection; cell-change cancels it; resize cancels it (§3.4).

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` — add a `terminal.onRender(...)` and `terminal.onResize(...)` subscription per entry. On render, snapshot the selected cells and compare with the previous snapshot; on mismatch, call `setSelection(null)`. On resize, unconditionally `setSelection(null)`.

**Approach:**
- Snapshot = packed string of cell characters over the selection's absolute-row range. Small (bounded by selection size), fast to compare.
- The selection model already uses absolute row numbers (Story C.1) so pure scroll is free — no update needed.

**Test approach:**
- Unit test with a stub terminal that exposes `buffer.active.getLine(row).translateToString(col, endCol)`: mutate a cell inside the selection → canceled; mutate a cell outside → still active; scroll → still active.

**Risk/complexity:** Medium — we're relying on `onRender` firing after each buffer change, which it does in xterm, but double-check for batched updates.

**Dependencies:** C.1, C.2.

---

### Story C.5: Auto-scroll during drag

**What to build:**
If the drag reaches the top/bottom edge of the viewport, auto-scroll in that direction (§3.6).

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` — in the drag-move handler, when `event.offsetY < EDGE_PX` or `> height - EDGE_PX`, start a `setInterval` that calls `terminal.scrollLines(±1)`. Clear on move back into viewport or on mouse-up.

**Approach:**
- `EDGE_PX = cellHeight * 0.75` or so. Scroll rate: one line per ~50ms.
- Continue updating the selection's `endRow`/`endCol` as the terminal scrolls (the user's mouse is stationary but the buffer is moving under it).

**Test approach:**
- Manual in Storybook — hard to unit test reliably.

**Risk/complexity:** Low.

**Dependencies:** C.1, C.2.

---

### Story C.6: Cross-boundary drags and scrollback override

**What to build:**
Drags starting in scrollback are always terminal-handled regardless of mouse reporting; drags that cross from scrollback into the live region stay terminal-handled (§3.5).

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` — at mousedown, record `startedInScrollback = startRow < viewportY`. If true, capture all subsequent move/up events for this drag even if mouse reporting is on.

**Approach:**
- Already mostly covered by the mouse router (C.1); this is a specific branch in the classifier.

**Test approach:**
- Unit test: mousedown in scrollback with reporting on → drag is terminal-handled; mousedown in live region with reporting on → event forwarded to program.

**Risk/complexity:** Low.

**Dependencies:** C.1.

---

### Story D.1: Selection popup

**What to build:**
The popup near the completed selection with `[Cmd+C] Copy Raw` and `[Cmd+Shift+C] Copy Rewrapped` (§4).

**Files to create/modify:**
- `lib/src/components/SelectionPopup.tsx` (new) — positioned via the same cell-pixel math as the overlay; renders at the end of the selection or clamped to viewport.
- `lib/src/stories/SelectionPopup.stories.tsx` (new).
- Labels switch on `IS_MAC` (A.3): Cmd vs Ctrl.

**Approach:**
- Appears on mouse-up (§3.7). Dismissed on Esc, click-outside, or content change.
- Use `text-xs`, existing surface/border tokens — no new design language.

**Test approach:**
- Storybook.

**Risk/complexity:** Low.

**Dependencies:** C.1, C.2.

---

### Story D.2: Copy Raw + Copy Rewrapped

**What to build:**
The two copy actions, both as buttons and as Cmd+C / Cmd+Shift+C shortcuts.

**Files to create/modify:**
- `lib/src/lib/clipboard.ts` (new) — `copyRaw(text)` and `copyRewrapped(text)`, both wrap `navigator.clipboard.writeText`.
- `lib/src/lib/rewrap.ts` (new) — pure-function Rewrapped transform with the heuristics from Technical Decisions. Plus `lib/src/lib/rewrap.test.ts` with a fixtures table (each case = input, expected output, short rationale).
- `lib/src/lib/mouse-selection.ts` — add `getSelectedText(id, { rewrap: boolean })` that reads cells via `terminal.buffer.active.getLine(row).translateToString(...)`.
- `lib/src/components/Pond.tsx` — in the existing keydown handler (~line 1575), add an **early branch** before both the Meta gesture and the passthrough short-circuit: if there's an active terminal selection and the event is Cmd/Ctrl+C (possibly +Shift), call copy, preventDefault, return. Spec §4.2 explicit: this intercept applies only when `mouse-selection.getState(id).selection` is non-null.

**Approach:**
- Raw: join cell rows with `\n`, preserving as-is.
- Rewrapped: run through `rewrap.ts`.
- Block-shape selection: always copied as rectangular slab, one row per line, no rewrapping even in "rewrapped" mode (block mode is inherently structural).

**Test approach:**
- `rewrap.test.ts` table-driven tests covering: paragraph unwrap, preserve blank-line separators, strip box-drawing frame, preserve inline box chars that aren't UI chrome, leave code blocks alone.
- Unit test for the selection-text extraction against a stub buffer.

**Risk/complexity:** Medium — rewrap heuristics are the squishy bit. Start conservative (only unwrap when highly confident) and expand based on feedback.

**Dependencies:** D.1.

---

### Story D.3: Popup dismissal

**What to build:**
Esc and click-outside dismiss the popup and cancel the selection (§4.3).

**Files to create/modify:**
- `lib/src/components/SelectionPopup.tsx` — `useEffect` that attaches `keydown`-Esc and `mousedown`-outside listeners while the popup is open.
- The existing Pond.tsx keydown handler already handles Esc in various places; make sure it does not conflict. (It currently only handles Esc inside kill-confirmation and rename input.)

**Approach:**
- After a successful copy, the popup dismisses but the selection remains briefly (spec: "implementation-defined; a short fade is reasonable"). Use a 400ms CSS fade on the overlay rects + popup.

**Test approach:**
- Storybook: post-copy fading state.

**Risk/complexity:** Low.

**Dependencies:** D.1.

---

### Story E.1: URL / path token detection

**What to build:**
Pure function that, given a buffer row and a cursor cell column, returns the token under/around it if one matches URL / path / error-location patterns (§5.1).

**Files to create/modify:**
- `lib/src/lib/smart-token.ts` (new) — `detectTokenAt(line: string, col: number): Token | null` with regex patterns for each shape, plus the trailing-punctuation stripping rule from the spec.
- `lib/src/lib/smart-token.test.ts` — table-driven tests covering every listed pattern plus the trailing-punctuation rules (`https://x.com.` → strip `.`, `https://en.wikipedia.org/wiki/Foo_(bar)` → keep `)`, etc.).

**Approach:**
- Start from the current column, expand left and right until whitespace.
- Match the whitespace-delimited candidate against the pattern list; return first match or null.
- Strip trailing punctuation per spec.

**Test approach:**
- Extensive table — this is the most error-prone code in the feature.

**Risk/complexity:** Medium — getting the regexes right and handling trailing punctuation cleanly.

**Dependencies:** None.

---

### Story E.2: Mid-drag extension hint and action

**What to build:**
While dragging, poll the detected token; show the `Press e to select the full URL/path` hint; handle `e` to extend (§5.2, §5.3).

**Files to create/modify:**
- `lib/src/lib/mouse-selection.ts` — on each drag-move, call `detectTokenAt` at the current cursor cell and store it on the state as `hintToken`.
- `lib/src/components/SelectionOverlay.tsx` — render the hint next to the existing "Hold Alt for block selection" hint when `hintToken` is non-null.
- `lib/src/components/Pond.tsx` — in the keydown handler's early branch (same place as Cmd+C in D.2), handle `e` during an active drag: if `hintToken` present, expand selection to cover the token's cells.
- Per spec §3.6, keystrokes during a drag are consumed by the terminal and not forwarded to the program. Add that as part of the same early branch: while a drag is active, stopPropagation + preventDefault on all keys except the ones we explicitly handle (Alt, e, Esc).

**Approach:**
- After extension, drag continues from the extended boundary (the mouse-move updates are computed from `selection.end`, not the mouse's cell-at-extension-time).
- Second `e` while the same token is fully covered = no-op (already guaranteed by detection's "not already fully covered" rule, §5.1).

**Test approach:**
- Storybook: mid-drag with URL hint, mid-drag with path hint, post-extension state.
- Unit test: `e` with no hint is a no-op; `e` with hint extends; `e` again is a no-op.

**Risk/complexity:** Medium — coordinating mid-drag keystroke handling with the window-level keydown listener.

**Dependencies:** C.1, C.3, E.1.

---

### Story F.1: Bracketed paste on macOS (Cmd+V)

**What to build:**
Cmd+V and Cmd+Shift+V intercept → clipboard read → bracketed write to PTY (§8.2.1, §8.5, §8.6).

**Files to create/modify:**
- `lib/src/lib/clipboard.ts` — add `async function doPaste(terminalId: string)`: read via `navigator.clipboard.readText()`, check `terminal.modes.bracketedPasteMode`, wrap with `\e[200~`/`\e[201~` if on, write via `getPlatform().writePty(terminalId, data)`.
- `lib/src/components/Pond.tsx` — in the keydown handler, early branch: on macOS, Cmd+V and Cmd+Shift+V → doPaste. Ctrl+V is NOT intercepted on macOS (forwarded as `0x16`).
- File-URL handling (§8.6): if the clipboard contains only a file URL (`file://...`), paste the path portion. `navigator.clipboard.read()` (different API) exposes multiple MIME types; start with just `text/plain` for MVP since it covers the common case. File-URL-as-text is handled by the OS (macOS Finder puts it on the text clipboard too).

**Approach:**
- If clipboard read returns empty/null, show a brief toast: `Clipboard contains no pasteable content.` (spec §8.6). Use an existing toast pattern if any; otherwise a 2-second inline banner.

**Test approach:**
- Unit test: mock `navigator.clipboard.readText` + `terminal.modes.bracketedPasteMode` + `platform.writePty`; verify the three cases (bracketed on, bracketed off, empty).

**Risk/complexity:** Medium — clipboard permission handling can differ across webview hosts.

**Dependencies:** A.3.

---

### Story F.2: Bracketed paste on Windows/Linux (Ctrl+V, Ctrl+Shift+V)

**What to build:**
Ctrl+V and Ctrl+Shift+V both paste on Windows/Linux (§8.2.2).

**Files to create/modify:**
- `lib/src/components/Pond.tsx` — in the keydown handler early branch, on non-Mac intercept Ctrl+V and Ctrl+Shift+V. Both do the same thing.

**Approach:**
- Same `doPaste` function from F.1.
- No path exists for sending `0x16` from Ctrl+V on these platforms (spec §8.3: documentation-only use of shell `Ctrl+Q` `quoted-insert`).

**Test approach:**
- Unit test alongside F.1.

**Risk/complexity:** Low.

**Dependencies:** F.1.

---

### Story F.3: Right-click and Edit menu paste

**What to build:**
Context menu Paste item on right-click, and (macOS only) Edit → Paste (§8.7).

**Files to create/modify:**
- Right-click: in the mouse router (C.1), a `contextmenu` event on `entry.element` when **no** mouse reporting is active shows a minimal context menu with a Paste entry that calls `doPaste`. Use an existing popover/menu pattern if one exists; otherwise a small positioned `<ul>` in a new `TerminalContextMenu.tsx`.
- Edit menu: this is out of the webview's reach directly — it requires a host integration. In Tauri (`standalone/`), register an Edit menu item. In VSCode (`vscode-ext/`), register a command. **See Open Questions** — likely deferred to follow-up since the spec calls out macOS Edit menu specifically and both hosts need separate wiring.

**Approach:**
- Start with the right-click Paste, which lives in `lib/` and works in all three environments.
- Defer the OS Edit menu wiring (document in spec's §9 or in a new follow-up story).

**Test approach:**
- Storybook for the context menu.

**Risk/complexity:** Medium — Edit menu wiring in two hosts is non-trivial.

**Dependencies:** F.1.

---

### Story G.1: Spec compliance sweep

**What to build:**
Pass over the shipped feature against the spec, update the spec if implementation diverged (per AGENTS.md: "When updating code covered by a spec, update the spec to match"), and register this spec in `AGENTS.md`.

**Files to create/modify:**
- `AGENTS.md` — add `docs/specs/mouse-and-clipboard.md` to the spec list with a one-line summary and a list of files this spec covers (`mouse-selection.ts`, `SelectionOverlay.tsx`, `SelectionPopup.tsx`, `clipboard.ts`, `rewrap.ts`, `smart-token.ts`, the relevant parts of `Pond.tsx` and `terminal-registry.ts`).
- `docs/specs/mouse-and-clipboard.md` — reconcile any drift.

**Risk/complexity:** Low.

**Dependencies:** All prior stories.

---

## Shared Patterns

- **Per-terminal state:** follow the `subscribeToSessionStateChanges` / `getSessionStateSnapshot` / cached-snapshot pattern from `terminal-registry.ts:63-91` for any new React-subscribable state. Always invalidate the cached snapshot before notifying listeners.
- **React consumption:** `useSyncExternalStore` — matches the existing pattern (`Pond.tsx:531`).
- **Keyboard interception:** extend the single window-level capture-phase `keydown` listener in `Pond.tsx:1575`; do not add parallel global listeners.
- **Mouse interception:** on `entry.element` via capture-phase listeners registered in `setupTerminalEntry`; tear down in the existing `cleanup` closure.
- **Tailwind:** only scale classes (`text-xs`, `text-sm`, etc.) — no arbitrary `px` values (per project convention).
- **Phosphor icons:** use existing imports from `@phosphor-icons/react`; `CursorClickIcon` + `ProhibitIcon` for mouse icon states.
- **Theme tokens:** use the CSS variables already wired in `terminal-registry.ts:247` (`--vscode-terminal-selectionBackground` etc.) — no hardcoded colors.
- **Tests:** Vitest at `<name>.test.ts` next to the source; table-driven for anything regex/heuristic-heavy. Storybook + Chromatic for visuals.

## Open Questions

- **How to cleanly disable xterm's built-in text selection?** There's no `options.disableSelection` flag. Candidates: (a) set `selectionBackground: 'transparent'` in the theme so xterm's selection is invisible while ours paints on top — the cheapest but leaves xterm's state machine running, which may fire `onSelectionChange` events we don't want; (b) intercept mousedown at capture phase and `preventDefault()` before xterm sees it, which should suppress xterm's selection from starting at all. Plan: try (b) first; fall back to (a) if xterm reacts to mousedown on the document level rather than the element. **If neither works**, we file an upstream feature request and ship with (a).
- **Host-level Edit → Paste menu integration (§8.7).** Wiring Tauri's native menu and VSCode's command palette are distinct efforts outside `lib/`. Proposal: ship right-click Paste in F.3; open follow-up tasks for the two hosts separately. Decide before starting F.3.
- **Wide characters (CJK, emoji) in cell-math for the overlay.** xterm renders them as 2 cells but they're 1 character. The overlay math assumes uniform cell width; wide characters will under-highlight by half a cell unless we ask xterm per cell via `buffer.active.getLine(row).getCell(col).getWidth()`. Decide whether the MVP highlight is "uniform cell grid" (wrong for CJK but simple) or "per-cell width" (correct but more code). Recommend uniform for MVP; open follow-up for correctness.
- **VSCode webview clipboard permissions.** VSCode webviews may not grant `navigator.clipboard.readText` by default; may need `webviewOptions.enableCommandUris` or a postMessage round-trip to the extension host. Verify in dogfood before committing to the client-side `readText` approach. If broken, add a `PlatformAdapter.readClipboard()` method and route through the extension host for VSCode.
- **Concrete starting heuristics for Copy Rewrapped.** Technical Decisions above lists a first cut; confirm with dogfood on real terminal output (logs, `less` buffers, `cat` of a `.md` file, `npm install` output) before locking the rule set. Tracked in D.2's test fixtures.

## Proposed Story Ordering

A.1 → A.2 → A.3 → B.1 → B.2 → C.1 → C.2 → C.3 → C.4 → C.5 → C.6 → D.1 → D.2 → D.3 → E.1 → E.2 → F.1 → F.2 → F.3 → G.1.

Each phase is independently valuable and testable:
- **After A:** per-terminal mouse state is observable (no UI yet).
- **After B:** header icon + banner work; no selection yet.
- **After C:** full selection experience works; no copy yet.
- **After D:** copy works end-to-end.
- **After E:** smart extension works.
- **After F:** paste works end-to-end.
- **After G:** spec is reconciled and registered.
