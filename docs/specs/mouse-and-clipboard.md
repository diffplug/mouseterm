# Terminal Mouse and Clipboard Behavior Specification

## Overview

This document specifies the mouse-handling and clipboard (copy and paste) behavior for a mouse-friendly terminal emulator intended to serve both new and experienced users across macOS, Linux, and Windows. The core design goal is to make text selection, copying, pasting, and mouse-driven interaction with TUI programs coexist cleanly, with visible state and predictable transitions between modes.

## Background: The Two Mouse Regimes

At any moment, mouse events in the terminal belong to one of two consumers:

1. **The terminal itself.** Drags paint a selection on the terminal surface; clicks position a cursor or interact with terminal chrome. This is the default.
2. **The running application inside the terminal.** When a program emits a mouse-reporting escape sequence (e.g. `\e[?1000h`, `\e[?1002h`, `\e[?1003h`, with optional `\e[?1006h` SGR encoding), the terminal forwards mouse events to the program as input. Programs such as `tmux`, `vim`, `less`, and `htop` use this. The terminal's own selection behavior becomes unreachable while mouse reporting is active.

The terminal must make the current regime visible, provide a way for the user to override it when they want to select text, and preserve useful selection actions (copy, copy-rewrapped, extend-to-URL, etc.) across both regimes.

## Terminology

- **Live region:** the portion of the terminal showing the active screen buffer (what the running program is currently drawing).
- **Scrollback:** the history of previously-drawn content above the live region.
- **Mouse reporting:** the state in which the inside program has requested and is receiving mouse events.
- **Override:** a state in which the terminal intercepts mouse events for selection purposes even though the inside program has requested mouse reporting.
- **Mouse icon:** a header indicator showing the current mouse regime.

---

## 1. The Mouse Icon (Header Indicator)

### 1.1 Visibility

- When the inside program has **not** requested mouse reporting: no icon is shown.
- When the inside program **has** requested mouse reporting: a **Mouse icon** is shown in the terminal header.
- When the user has activated an override: the Mouse icon is replaced by a **No-Mouse icon** in the same header location.

**Implementation note:** The Mouse icon is rendered as `CursorClickIcon`. The No-Mouse icon is rendered as `ProhibitIcon` composited on top of the same `CursorClickIcon` (not as a separate replacement glyph), so the two states share a consistent base and the override state reads visually as "cursor, but prohibited."

### 1.2 Hover Text

- Mouse icon hover text: `TUI is intercepting mouse commands. Click to override.`
- No-Mouse icon hover text: `You're overriding the TUI's mouse capture. Click to restore.`

### 1.3 Click Behavior

- Clicking the **Mouse icon** activates a **temporary override** (see §2).
- Clicking the **No-Mouse icon** ends the override immediately and restores mouse reporting to the inside program.

---

## 2. Override State

### 2.1 Temporary Override

Activated by clicking the Mouse icon. While the temporary override is active:

- Mouse events are handled by the terminal, not forwarded to the inside program.
- The Mouse icon is replaced with the No-Mouse icon.
- A banner appears next to the No-Mouse icon reading:
  `Temporary mouse override until mouse-up. [Make permanent] [Cancel]`
- The override persists until the **next mouse-up event inside the terminal content area** (live region or scrollback) that is paired with a prior mouse-down in the same area. The click on the No-Mouse icon itself, the banner's buttons, and any "orphan" mouse-up from a drag that started outside the terminal do **not** count as that mouse-up.
- After that mouse-up, the override automatically ends: mouse reporting is restored to the inside program, the banner is dismissed, and the icon reverts to the Mouse icon.

### 2.2 Making the Override Permanent

- Clicking **[Make permanent]** in the banner converts the temporary override into a permanent one.
- The banner is dismissed.
- The No-Mouse icon remains visible with its "click to restore" hover text.
- The override persists until the user clicks the No-Mouse icon, or until the inside program stops requesting mouse reporting.

### 2.3 Canceling the Temporary Override

- Clicking **[Cancel]** in the banner ends the override immediately.
- The banner is dismissed, mouse reporting is restored, and the icon reverts to the Mouse icon.

### 2.4 No Keyboard Activation

The mouse icon, No-Mouse icon, and banner buttons are mouse-only. They are not keyboard-activatable.

### 2.5 Edge Case: No Drag After Override

If the user activates an override and then never performs a mouse action, the override remains in place indefinitely (temporary overrides simply wait for their terminating mouse-up). This is acceptable; no timeout is implemented.

---

## 3. Selection Behavior

Selection is available whenever the terminal is handling mouse events — that is, whenever mouse reporting is not active, or an override is in effect, or the drag originates in scrollback (see §3.5).

### 3.1 Initiating a Selection

- A click-and-drag in the terminal content area begins a selection.
- The selection is rendered by the terminal in a compositor layer **above** the cell grid, not by writing into the grid. This avoids conflicts with programs redrawing the screen.

### 3.2 Selection Shapes

- **Linewise (default):** click-and-drag selects text in reading order, wrapping from end-of-line to start-of-next-line.
- **Block (rectangular):** hold **Alt** (Option on macOS) during the drag to select a rectangular region.
- The selection shape updates live as Alt is pressed and released during the drag: pressing Alt mid-drag converts the current selection to block; releasing Alt converts it back to linewise.

### 3.3 Selection Hint Text

While a drag is in progress, a small hint is displayed above the selection:

- `Hold Alt for block selection` on Windows and Linux.
- `Hold Opt for block selection` on macOS.

The hint is always shown during an active drag. It does not fade with use.

When a URL or path token is detected near the current drag position, an additional extension hint (`Press e to select the full URL` / `Press e to select the full path`) is shown alongside it. See §5 for full details.

### 3.4 Selection Follows Content

The selection is anchored to the characters under it, not to screen coordinates.

- **Pure scroll:** if content scrolls (translates vertically with no character changes), the selection scrolls with it. This is coordinate math only; no matching is required.
- **Content change:** if any cell overlapped by the selection changes, the selection is immediately canceled. Repaints outside the selected cells (e.g. a status line, clock, or progress bar elsewhere on screen) are irrelevant and do not cancel the selection.
- **Terminal resize:** a resize counts as a content change and cancels any active selection.
- There is no partial-match or content-tracking heuristic. Cancel-on-change is the rule.

### 3.5 Selection in the Live Region vs. Scrollback

- **Live region:** selection is available only when mouse reporting is off, or an override is in effect.
- **Scrollback:** selection is **always** available, regardless of mouse reporting or override state. The override state of the Mouse icon is irrelevant for drags that originate in scrollback.
- **Crossing the boundary:** a drag that begins in scrollback and continues into the live region is allowed and produces a single continuous selection. A drag that begins in the live region while mouse reporting is active (with no override) is forwarded to the inside program, not treated as a selection.

### 3.6 During a Drag

- **Auto-scroll:** if the mouse reaches the top or bottom edge of the viewport during a drag, the terminal scrolls in that direction at a modest rate so the selection can extend beyond the visible region. Auto-scroll stops when the cursor moves back inside the viewport or the mouse button is released.
- **Keyboard routing:** while a terminal-handled drag is in progress, the terminal consumes keystrokes relevant to the drag — **Alt** for block-selection shape (§3.2), **e** for smart extension (§5), **Esc** to cancel the drag and any in-progress selection. All other keystrokes are ignored and **not** forwarded to the inside program for the duration of the drag. Normal keyboard routing resumes when the mouse button is released.

### 3.7 Ending a Selection

- Releasing the mouse button ends the drag and fixes the selection.
- The selection popup (§4) appears.
- The selection persists until the user acts on it (copy, extend, etc.), clicks elsewhere to dismiss it, presses **Esc**, or the underlying content changes.
- Starting a new drag (mouse-down in the terminal content area) immediately replaces any existing selection with the new one; the previous popup is dismissed.

---

## 4. Selection Popup

When a selection is finalized, a popup appears near the selection with action buttons.

### 4.1 Copy Buttons

The popup always shows two primary copy buttons:

- `[Cmd+C] Copy Raw`
- `[Cmd+Shift+C] Copy Rewrapped`

On non-macOS platforms, the labels show `Ctrl` and `Ctrl+Shift` respectively.

#### 4.1.1 Copy Raw

Copies the selected text to the system clipboard exactly as it appears in the terminal cells, including hard line breaks and any box-drawing or decorative characters.

#### 4.1.2 Copy Rewrapped

Copies the selected text with two transformations applied:

1. **Unwrap hard line breaks** that appear to be display wrapping rather than intentional paragraph breaks. (Heuristics for distinguishing the two are implementation-defined and expected to evolve; a reasonable starting point is to unwrap single newlines inside what appears to be a flowing paragraph and preserve blank lines as paragraph separators.)
2. **Strip box-drawing characters** that form UI chrome around text (e.g. `┌`, `─`, `│`, `└`, `╭`, `═`, etc.) when they appear to be part of a textbox, table border, or decorative frame rather than intentional content.

### 4.2 Keyboard Shortcuts

While the terminal has an active selection:

- **Cmd+C** (Ctrl+C on non-macOS) triggers Copy Raw.
- **Cmd+Shift+C** (Ctrl+Shift+C on non-macOS) triggers Copy Rewrapped.

These shortcuts work whether or not the popup is visible and whether or not the user has clicked on it. The precedence rule is narrow: Ctrl+C is intercepted as Copy Raw **only** when a terminal selection is active. With no terminal selection, Ctrl+C is forwarded to the inside program as usual (SIGINT for shells, app-defined behavior for TUIs). An in-program selection maintained by a TUI (e.g. vim visual mode, less search highlight) is **not** a terminal selection for this purpose and does not change Ctrl+C routing.

### 4.3 Dismissing the Popup

- Pressing **Esc** dismisses the popup and cancels the selection.
- Clicking outside the selection dismisses the popup and cancels the selection.
- Performing a copy action dismisses the popup but leaves the selection visible briefly (implementation-defined; a short fade is reasonable).

### 4.4 Extensibility

The popup is designed to accommodate additional copy modes in the future (e.g. strip ANSI codes, strip line numbers, strip prompt markers). These will appear as additional buttons or within a `...` overflow menu. The initial implementation ships with only Copy Raw and Copy Rewrapped.

---

## 5. Smart Extension (URL / Path Detection)

Smart extension is offered **mid-drag**, in parallel with the Alt block-selection modifier (§3.2–§3.3). During an active drag, the terminal continuously examines the characters at and immediately around the current selection for a URL-shaped or path-shaped token; if one is detected, a hint is shown above the selection inviting the user to press **e** to extend to the full token.

### 5.1 Detection

While a drag is in progress, the terminal continuously examines the characters at and immediately around the current selection for a URL-shaped or path-shaped token. A token is whitespace-delimited and matches one of:

- A URL (e.g. `https?://...`, `file://...`).
- An absolute path (e.g. `/...`, `~/...`).
- A relative path (e.g. `./...`, `../...`).
- A Windows-style path (e.g. `C:\...`).
- An error location pattern (e.g. `file.ext:line`, `file.ext:line:col`).

Trailing characters that are unlikely to be part of the token — `.`, `,`, `;`, `:`, `!`, `?`, and single/double quotes — are stripped from the detected token's end before it is offered for extension. Unmatched closing brackets (`)`, `]`, `}`, `>`) are also stripped, but matched pairs are preserved (e.g. `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its trailing `)`).

A token qualifies for extension only if it is not already fully covered by the current selection.

### 5.2 Mid-Drag Hint

When a qualifying token is detected during a drag, a hint is shown above the selection, alongside the existing `Hold Alt for block selection` hint:

- `Press e to select the full URL` (for URLs)
- `Press e to select the full path` (for paths and error locations)

The hint appears and disappears live as the drag moves into and out of qualifying tokens. If no qualifying token is present at the current drag position, no extension hint is shown.

### 5.3 Extension Action

- Pressing **e** during a drag, while the hint is visible, immediately extends the selection to cover the full detected token.
- After extension, the drag continues normally: further mouse movement updates the selection from the extended boundary, and the Alt modifier continues to toggle block-selection shape.
- If **e** is pressed when no qualifying token is present, the keypress is ignored.
- Pressing **e** a second time when the same token is already fully covered by the selection is a no-op (per §5.1's qualification rule).
- Pressing **e** has no effect after the drag has ended (i.e. once the popup has appeared, §4). Extension is a mid-drag action only.
- Per §3.6, the `e` keystroke (and all others) is consumed by the terminal during a terminal-handled drag and is not forwarded to the inside program.

### 5.4 Interaction with Selection Completion

When the user releases the mouse button, the selection is finalized at whatever boundaries the drag (including any `e`-extensions) produced. The popup (§4) then appears with the standard copy actions operating on the final selection.

### 5.5 Simplicity Bound

The initial implementation offers only the single extension step described above. There is no multi-level extension (token → line → paragraph) and no "open URL" or "open in editor" action in the popup. These may be added later.

---

## 6. Interaction Summary

### 6.1 State Matrix

| Inside program requests mouse | Override active | Drag in live region goes to... | Drag in scrollback goes to... |
|-------------------------------|-----------------|--------------------------------|-------------------------------|
| No                            | —               | Terminal (selection)           | Terminal (selection)          |
| Yes                           | No              | Inside program                 | Terminal (selection)          |
| Yes                           | Temporary       | Terminal (selection), ends on mouse-up | Terminal (selection) |
| Yes                           | Permanent       | Terminal (selection)           | Terminal (selection)          |

### 6.2 Header Icon States

| Condition                                                 | Icon shown    | Banner shown                                           |
|-----------------------------------------------------------|---------------|--------------------------------------------------------|
| Inside program does not request mouse reporting           | None          | None                                                   |
| Inside program requests mouse, no override                | Mouse         | None                                                   |
| Temporary override active                                 | No-Mouse      | `Temporary mouse override until mouse-up. [Make permanent] [Cancel]` |
| Permanent override active                                 | No-Mouse      | None                                                   |

---

## 7. Rendering Notes

- The selection highlight is rendered in a compositor layer above the cell grid.
- The header icon and banner are part of persistent terminal chrome and are not affected by inside-program redraws.
- The selection popup is rendered above the cell grid and anchored to the selection; it should reposition if the selection moves due to scroll, and dismiss if the selection is canceled.
- All hint text (`Hold Alt for block selection`, `Press e to select the full URL`, etc.) is rendered by the terminal above the cell grid and does not interfere with the inside program's output.

---

## 8. Paste Behavior

### 8.1 Overview

Paste is the inverse of copy: the terminal reads the system clipboard and writes the content to the PTY as if it had been typed. Paste keystrokes are **intercepted by the terminal**, not forwarded to the inside program. The inside program only receives the pasted bytes (optionally wrapped in bracketed-paste markers; see §8.5).

Paste behavior differs by platform to match each OS's native convention.

### 8.2 Paste Keybindings

#### 8.2.1 macOS

| Keystroke      | Behavior                                           |
|----------------|----------------------------------------------------|
| **Cmd+V**      | Terminal intercepts and performs a bracketed paste. |
| **Cmd+Shift+V**| Terminal intercepts and performs a bracketed paste. (Alias for Cmd+V.) |
| **Ctrl+V**     | Not intercepted. Forwarded to the inside program as the raw control byte `0x16`. |

macOS users have a clean separation: Cmd is the paste modifier, Ctrl is passed through to the program. No escape hatch is needed.

#### 8.2.2 Windows and Linux

| Keystroke       | Behavior                                           |
|-----------------|----------------------------------------------------|
| **Ctrl+V**      | Terminal intercepts and performs a bracketed paste (default). |
| **Ctrl+Shift+V**| Terminal intercepts and performs a bracketed paste. (Alias for Ctrl+V, matches convention from Linux terminals and Windows Terminal.) |

Because Ctrl+V is needed as both the paste shortcut (user expectation from every other app) and as the raw control byte `0x16` (for shell `quoted-insert`, vim literal-next, etc.), Ctrl+V is always intercepted and the raw byte is not sent to the inside program by this key. Users needing to send `0x16` can use the mechanism in §8.3.

### 8.3 Sending `0x16` on Windows and Linux (Ctrl+Q)

Users needing to insert a literal control character at a shell prompt can use the existing readline feature: press **Ctrl+Q**, then the desired key. This is a feature of bash, zsh, fish, and other readline-aware shells; the terminal does nothing special to enable it. This handles the most common occasional use case (inserting a literal Tab, Esc, or other control byte in the shell) without requiring any terminal-level escape hatch.

This mechanism is documentation-only from the terminal's perspective: it works because the shell already supports it. No equivalent is provided for programs that do not support Ctrl+Q-style `quoted-insert` (e.g. vim insert mode, where `0x16` is the default literal-next key and has been taken over by paste). See §9.2 for deferred alternatives.

### 8.4 Platform Detection

The terminal detects its platform at startup and configures paste keybindings accordingly. There is no "pretend to be macOS on Linux" mode or equivalent; each platform gets its native convention by default.

### 8.5 Bracketed Paste

All pastes performed by the terminal are **bracketed** when the inside program has opted in via `\e[?2004h`:

- The terminal writes `\e[200~`, followed by the clipboard content, followed by `\e[201~`, to the PTY.
- If the inside program has not opted in (or has opted out via `\e[?2004l`), the content is written without brackets.

This is standard xterm behavior and is mandatory. It allows shells and TUIs to distinguish pasted content from typed input (e.g. to not execute newlines immediately, to highlight pasted text, or to confirm before running pasted commands).

### 8.6 Paste Content

The initial implementation pastes plain text only:

- If the clipboard contains text, that text is written to the PTY.
- If the clipboard contains a file URL (e.g. from Finder or Explorer), the path is written to the PTY as text. This is the standard behavior across terminals and enables the file-attachment workflows used by Claude Code and similar tools.
- If the clipboard contains non-text content with no text or file-URL representation (e.g. a raw screenshot image from the system screenshot tool), the paste is a no-op. A brief notification may be shown: `Clipboard contains no pasteable content.`

Richer paste behavior — such as image/file detection with a paste popup, content-aware transformations (strip trailing whitespace, normalize line endings, convert smart quotes), paste history, credential detection, and preview thumbnails — is out of scope for the initial implementation. See §9.

### 8.7 Right-Click and Menu Paste

- **Right-click menu:** the terminal's context menu includes a **Paste** item that performs the same bracketed paste as the keyboard shortcut.
- **Edit menu:** on macOS, the standard **Edit → Paste** menu item is wired to the same action.

These provide a mouse-driven path for users who don't know or don't remember the keyboard shortcut.

---

## 9. Out of Scope for Initial Implementation

The following were considered and explicitly deferred:

### 9.1 Mouse and Selection

- Additional copy modes beyond Raw and Rewrapped (strip ANSI, strip line numbers, strip prompts, join hyphenated line-breaks).
- Contextual actions in the popup (Open URL, Open in $EDITOR, Copy hash).
- Multi-level `e` extension (token → line → paragraph).
- Fading or suppressing hint text as the user becomes experienced.
- A "quiet mode" setting to suppress chrome for experienced users.
- Content-matching selection tracking when the underlying content changes (current behavior is cancel-on-change).
- Keyboard activation of the mouse icon and banner buttons.
- Timeout behavior when a temporary override is activated but never used.
- Double-click to select word and triple-click to select line. These are standard terminal conventions and will almost certainly be added in a follow-up; they are deferred from the initial implementation to keep the first cut minimal.
- Concrete rules for Copy Rewrapped's unwrap / box-drawing-strip heuristics (§4.1.2). The spec intentionally leaves these implementation-defined; finalizing a first-cut ruleset and its test cases is tracked as a follow-up rather than open-ended work.

### 9.2 Paste

- A settings toggle to disable Ctrl+V interception on Windows and Linux (making Ctrl+V send `0x16` to the inside program and leaving Ctrl+Shift+V as the sole paste shortcut). Intended for power users who work predominantly in vim, Emacs, or other programs where `0x16`-as-literal-next is a frequent action. Deferred from the initial implementation.
- A paste popup (parallel to the copy popup) for previewing or transforming paste content before it is committed.
- Paste content transformations (strip trailing whitespace, normalize line endings, convert smart quotes, etc.).
- Image paste: detecting image data on the clipboard and offering to paste it as a file path (saved to a temp file) or as inline base64-encoded data.
- File paste beyond plain file-URL-as-text: offering to paste file contents as text, thumbnails in a preview, etc.
- Paste history (a buffer of recent pastes accessible via a shortcut or menu).
- Credential-shaped content detection and warnings.
- Multi-line paste confirmation dialogs ("this paste contains newlines and will execute immediately").
- A "literal next keystroke" terminal-level shortcut (Ctrl+Alt+V or similar) to send `0x16` or other control bytes in programs that don't support Ctrl+Q-style `quoted-insert`.
- A Ctrl+V-pastes toggle on macOS (macOS users almost never want this, so it is not exposed unless requested).
- Middle-click paste / X11 PRIMARY selection integration on Linux (auto-copy on selection and middle-click paste of PRIMARY, distinct from the CLIPBOARD used by Ctrl+C / Ctrl+V). Standard on many Linux terminals and frequently expected by Linux power users, but deferred to keep the initial clipboard model single-buffer and cross-platform consistent.

These may be revisited based on user feedback after the initial implementation ships.