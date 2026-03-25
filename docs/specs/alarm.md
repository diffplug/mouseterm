# Alarm Spec

## Goal

The alarm system is an opt-in reminder for a **Session** that may finish work while the user is looking elsewhere. Alarm state lives on the Session itself, not on the Pane or Door that currently displays it.

This spec uses semantic state names that describe what the Session currently owes the user:

- `NOTHING_TO_SHOW`
- `MIGHT_BE_BUSY`
- `BUSY`
- `MIGHT_NEED_ATTENTION`
- `ALARM_RINGING`

This document is the source of truth for the naming and behavior of this state machine.

## Non-goals

- No command sniffing or per-tool heuristics. We do not try to guess whether `vim`, `npm dev`, `claude`, or any other command is "appropriate" for alarms.
- No sound, OS notifications, or browser notifications in v1.
- No Door-specific alarm menu that overrides the existing click-to-reattach behavior from `docs/specs/layout.md`.

## When alarms are useful

Alarms are most useful for sessions such as:

- long-running jobs that eventually finish, such as signing, notarization, deploys, or test runs
- slow human-in-the-loop sessions, such as AI chats where the user may switch to other work

Alarms are usually not useful for sessions such as:

- continuous background output, such as `npm dev`
- fast local interactive tools where the user is already present
- read-only streams that the user expects to keep changing forever

This is guidance only. The system does not auto-enable or auto-disable alarms based on process name, shell command, exit code, or output patterns.

## Data model

Each Session owns:

- `status: 'ALARM_DISABLED' | 'NOTHING_TO_SHOW' | 'MIGHT_BE_BUSY' | 'BUSY' | 'MIGHT_NEED_ATTENTION' | 'ALARM_RINGING'`
  - This is the unified alarm and activity state for the Session.
  - `ALARM_DISABLED`: alarm is off; no activity tracking is performed. Default state.
  - Stable states: `ALARM_DISABLED`, `NOTHING_TO_SHOW`, `BUSY`, `ALARM_RINGING`.
  - Transitional states: `MIGHT_BE_BUSY`, `MIGHT_NEED_ATTENTION`.
  - When the user enables the alarm, status transitions from `ALARM_DISABLED` to `NOTHING_TO_SHOW` and activity tracking begins fresh from that moment.
  - When the user disables the alarm, activity tracking stops and status returns to `ALARM_DISABLED`.
- `todo: false | 'soft' | 'hard'`
  - Reminder state for the Session. Default `false`.
  - `'soft'`: auto-created when a ringing alarm is phantom-dismissed (any attention path). Dashed-outline pill. Auto-clears when the user types printable text into the terminal (synthetic terminal reports like focus events and cursor-position responses are excluded).
  - `'hard'`: explicitly set by the user via `t` key or context menu. Solid-outline pill. Only clears via explicit toggle.
  - Dismissing a ringing alarm when `todo` is already `'soft'` or `'hard'` does not downgrade it.

Each Session also owns:

- `attentionDismissedRing: boolean`
  - True when the user attended to a ringing Session (clicked into the Pane, typed in passthrough, etc.). Cleared when the bell is next clicked or the alarm is toggled/disabled. Used by the bell button to show the context menu on the next click instead of immediately disabling.

The workspace owns:

- `attentionSessionId: string | null`
  - Which Session currently has the user's attention.
- `attentionTimer: timeout handle | null`
  - Auto-clears `attentionSessionId` after `T_USER_ATTENTION`. Reset on each new attention event.

Important invariants:

- Alarm state is session-scoped and survives Pane <-> Door transitions.
- `status` describes what the Session owes the user since the last explicit attention boundary.
- Destroying a Session clears `todo` with it; the activity monitor is disposed.
- Re-rendering, theme changes, resize reflow, or remounting a Pane must not create a new alarm by themselves.

## Attention model

We only ring when a Session produces a completion signal and the user is not actively attending to that Session.

`attentionSessionId` is set only by explicit user actions that plausibly mean "I am looking at this Session now":

- clicking a Pane body or Pane header
- entering passthrough on a Pane
- typing into a Session in passthrough
- clicking a Door or pressing `Enter` on a Door, because both reattach into passthrough

These do **not** count as attention:

- a Session merely being visible
- a Session merely being selected in command mode
- hovering
- a Door existing in the baseboard
- reattaching a Door with `d`, because that restores the Pane but stays in command mode

Attention is cleared when:

- the user has not explicitly interacted with that Session for `T_USER_ATTENTION`
- the app loses focus
- the Session is detached into a Door while it had attention
- the Session is destroyed

`T_USER_ATTENTION` is intentionally finite so a user can run a slow command, walk away, and still get a visual alarm later even if that Pane remained selected. Start with 15s and tune with real usage.

Doors never directly hold attention. A Door can only regain attention by being restored into a Pane through an action that enters passthrough.

## State model

The point of the state machine is not to model every output blip. It is to answer a narrow question:

- Does this Session currently have nothing worth surfacing?
- Does it appear to be busy with ongoing work?
- Has it likely finished and now needs attention?

The `MIGHT_*` states exist only to absorb uncertainty. They are debounce states, not user-facing end states.

### Timing reference

| Timer | Value | Purpose |
|---|---|---|
| `T_BUSY_CANDIDATE_GAP` | 1.5 s | enough elapsed time to treat ongoing output as a possible busy transition |
| `T_BUSY_CONFIRM_GAP` | 500 ms | window in `MIGHT_BE_BUSY` before reverting to `NOTHING_TO_SHOW` if no further output |
| `T_MIGHT_NEED_ATTENTION` | 2 s | silence after `BUSY` before suspecting completion |
| `T_ALARM_RINGING_CONFIRM` | 3 s | additional silence before confirming `ALARM_RINGING` |
| `T_RESIZE_DEBOUNCE` | 500 ms | ignore resize redraw noise |
| `T_USER_ATTENTION` | 15 s | attention idle expiry |

All values are configurable via `cfg.alarm`. Total silence from last meaningful output to `ALARM_RINGING`: 5 s (`T_MIGHT_NEED_ATTENTION` + `T_ALARM_RINGING_CONFIRM`).

### State semantics

- `NOTHING_TO_SHOW`
  - Default state.
  - The Session does not currently owe the user a reminder.
  - Immediate command echo or a single quick response is not enough to leave this state.

- `MIGHT_BE_BUSY`
  - Transitional state entered when output suggests the Session may be moving from a quick response into ongoing work.
  - If that suspicion is not confirmed quickly, fall back to `NOTHING_TO_SHOW`.

- `BUSY`
  - Stable state.
  - There is enough evidence that the Session is doing ongoing work and may later produce something worth surfacing.

- `MIGHT_NEED_ATTENTION`
  - Transitional state entered when a `BUSY` Session goes quiet.
  - This may be true completion, or only a pause in output.

- `ALARM_RINGING`
  - Stable state.
  - The Session likely completed a meaningful unit of work and the alarm is actively ringing.

### Transition rules

| Current | Event | Next | Notes |
|---|---|---|---|
| any | explicit attention boundary | `NOTHING_TO_SHOW` | Clicking into the Pane, typing in passthrough, or restoring a Door via click/`Enter` starts a new cycle. |
| `NOTHING_TO_SHOW` | first meaningful output after an attention boundary | `NOTHING_TO_SHOW` | A single output burst may be only immediate feedback. |
| `NOTHING_TO_SHOW` | another meaningful output arrives after `T_BUSY_CANDIDATE_GAP`, or multiple rapid outputs continue through that gap | `MIGHT_BE_BUSY` | The Session may be entering a longer-running phase. |
| `MIGHT_BE_BUSY` | further output confirms ongoing work within `T_BUSY_CONFIRM_GAP` | `BUSY` | Enough evidence to treat the Session as busy. |
| `MIGHT_BE_BUSY` | output stops before confirmation | `NOTHING_TO_SHOW` | False positive; it was just a quick response. |
| `BUSY` | more meaningful output | `BUSY` | Stay busy. |
| `BUSY` | no meaningful output for `T_MIGHT_NEED_ATTENTION` | `MIGHT_NEED_ATTENTION` | The Session may have finished, or may only be pausing. |
| `MIGHT_NEED_ATTENTION` | output resumes | `BUSY` | It was only a pause. |
| `MIGHT_NEED_ATTENTION` | silence continues for `T_ALARM_RINGING_CONFIRM` and the Session lacks attention | `ALARM_RINGING` | This is the alarm-eligible completion transition. |
| `MIGHT_NEED_ATTENTION` | silence continues for `T_ALARM_RINGING_CONFIRM` but the Session has attention | `NOTHING_TO_SHOW` | The user already sees it; no reminder is owed. |
| `ALARM_RINGING` | explicit attention boundary | `NOTHING_TO_SHOW` | The user attended to the result. |
| `ALARM_RINGING` | new meaningful output and the Session has attention | `MIGHT_BE_BUSY` | A new work cycle may be starting. |
| `ALARM_RINGING` | new meaningful output but the Session lacks attention | `ALARM_RINGING` | Latch: new output does not silently clear the alarm without user awareness. |

### Meaningful output

`Meaningful output` means terminal output that is not suppressed as incidental UI churn. In particular:

- output during `T_RESIZE_DEBOUNCE` does not count
- theme changes, remounts, or DOM reparenting do not count
- pure selection or focus changes do not count

The implementation may later learn additional suppressions, but this spec only requires resize churn suppression today.

## Alarm trigger

Alarm logic is driven entirely by transitions in `status`.

### Ringing starts when all of these are true

- the Session has an active activity monitor (i.e. `status !== 'ALARM_DISABLED'`)
- the Session transitions from `MIGHT_NEED_ATTENTION` into `ALARM_RINGING`
- the Session does not currently have attention

### Ringing does not start when any of these are true

- the Session already has attention at the moment it would otherwise enter `ALARM_RINGING`
- the Session is merely re-rendered or reattached while already `ALARM_RINGING`
- the only recent output was resize noise already ignored by the completion detector
- the alarm is disabled (`status === 'ALARM_DISABLED'`)

This "fresh transition into `ALARM_RINGING` only" rule is critical. It prevents duplicate alarms on remount, theme change, or Pane <-> Door movement.

## Alarm clearing rules

The Session leaves `ALARM_RINGING` and returns to `NOTHING_TO_SHOW` when any of these happen:

- the user attends to the Session (clicking into the Pane, typing in passthrough, restoring a Door via click/`Enter`)
- the user dismisses the alarm (clicking the ringing bell, pressing `a`)
- the user marks the Session as hard TODO (`t` key or context menu)
- new output arrives while the Session has attention (starts a new `MIGHT_BE_BUSY` cycle; without attention the alarm stays ringing — see latch in transition rules)

All attention-based dismissals (the first three above) create a soft TODO if `todo` is currently `false`. This prevents phantom dismissals where the alarm vanishes without a trace. Typing printable text into the terminal auto-clears soft TODOs, so users who engage with the output don't accumulate breadcrumbs. Synthetic terminal reports (focus events, cursor-position responses) do not count as typing.

The Session leaves `ALARM_RINGING` and returns to `ALARM_DISABLED` when:

- the user disables alarms on that Session (disposes the activity monitor)

The Session's alarm state is cleared entirely when:

- the Session is destroyed

If more output arrives later and the Session makes a fresh transition back into `ALARM_RINGING`, the alarm rings again.

Marking a Session as hard TODO resets the alarm to `NOTHING_TO_SHOW` and sets `todo = 'hard'`, but it does **not** disable future alarms. `todo` and the alarm toggle are separate concerns.

Disabling alarms disposes the activity monitor and returns `status` to `ALARM_DISABLED`.

## UI

### Pane header

The Pane header exposes two independent concepts:

- TODO pill
- alarm button

TODO pill:

- toggled in command mode with `t` (cycles: `false` → `'hard'`, `'soft'` → `'hard'`, `'hard'` → `false`)
- shown when `todo` is `'soft'` or `'hard'`
- `'soft'`: dashed-outline pill — auto-created on alarm dismiss, auto-clears on user input
- `'hard'`: solid-outline pill — explicitly set, only clears manually
- clicking a soft pill shows a prompt: "Clear" / "Keep" (keep promotes to hard)
- clicking a hard pill clears it
- no empty placeholder when off

Alarm button:

- shown in all header tiers, including compact and minimal
- icon-only control with tooltip and accessible label
- visual states (pure function of `status`):
  - `ALARM_DISABLED`: `BellSlashIcon`, muted
  - `NOTHING_TO_SHOW`: `BellIcon` filled, muted
  - `MIGHT_BE_BUSY`: `BellIcon` filled, muted, with a faint dot badge (`foreground/40`, static)
  - `BUSY`: `BellIcon` filled, muted, with an accent-colored dot badge (gentle breathing pulse)
  - `MIGHT_NEED_ATTENTION`: `BellIcon` filled, muted, with a warning-colored dot badge (`warning/60`, gentle breathing pulse)
  - `ALARM_RINGING`: `BellIcon` filled, warning color, whole-button breathing pulse; no dot badge
- the dot badge is a small circle positioned at the top-right corner of the bell icon
- the dot badge has a `border-surface-alt` outline to cleanly separate it from the bell icon
- the dot badge must not change the button's layout size

Interaction (`dismissOrToggleAlarm` state machine):

- left-click the bell while `ALARM_DISABLED`: enables the alarm (creates activity monitor)
- left-click the bell while `ALARM_RINGING`: dismisses the alarm, creates a soft TODO if none exists, then opens the context menu anchored below the button
- left-click the bell after an attention-based dismissal (`attentionDismissedRing` is set): clears the flag and opens the context menu. This lets the user access TODO/disable options after attending to a ringing Session without requiring a right-click.
- left-click the bell in any other enabled state: disables the alarm (destroys activity monitor)
- pressing `a` on a selected Pane in command mode: same as left-click
- right-click the bell (any state): opens a context menu with:
  - "Mark as TODO" / "Clear TODO" (toggles hard TODO), with `[t]` shortcut hint
  - "Disable alarms" (only when alarm is enabled)
  - brief description of soft/hard TODO behavior
- tooltip includes "Right-click for options" hint

The alarm control has higher layout priority than split or zoom controls. Long titles must truncate before the bell disappears.

### Door

A Door is display-only for alarm state in v1. It must not replace the existing Door primary actions defined in `docs/specs/layout.md`.

Door indicators:

- show bell indicator only when `status !== 'ALARM_DISABLED'`
- show TODO pill when `todo !== false` (`'soft'` or `'hard'`)
- if `status === 'ALARM_RINGING'`, the Door itself gets the ringing treatment, not just a tiny icon
- the Door bell icon shows the same dot badge as the Pane header for `MIGHT_BE_BUSY`, `BUSY`, and `MIGHT_NEED_ATTENTION` states, but smaller (4px vs 6px) to match the smaller bell icon

Door interaction:

- click or `Enter` keeps its existing meaning: reattach and enter passthrough
- `d` keeps its existing meaning: reattach and stay in command mode
- alarm-specific actions are manipulated after restore, from the Pane header UI

Consequences:

- clicking or `Enter` on a ringing Door counts as attention and clears the ring
- `d` on a ringing Door does not count as attention, so the ring remains until the user explicitly attends, dismisses, or disables

## Hardening requirements

### Text overflow and narrow layouts

- Session titles may contain long text, emoji, CJK, RTL text, combining marks, and shell prompts with paths.
- Pane titles and Door titles must use `min-width: 0` plus truncation so indicators do not overflow their containers.
- Bell and TODO indicators must be fixed-width, non-shrinking affordances.
- The ringing treatment must not change layout size. No border-width jumps, no icon-size jumps.
- If header space becomes extremely tight, the TODO pill may collapse before the alarm control does.

### Accessibility and motion

- Ringing must not rely on color alone. Use icon state plus outline, fill, or pulse.
- Respect `prefers-reduced-motion`. In reduced-motion mode, replace flashing with a steady highlighted state. Dot badge pulse animations are also disabled; the `MIGHT_BE_BUSY` dot is always static regardless of motion preference.
- Bell button must expose accurate `aria-label` text:
  - "Enable alarm"
  - "Disable alarm"
  - "Alarm ringing"
- TODO pill and bell actions must remain keyboard reachable.
- Any ringing modal or popover must trap focus, support `Escape`, and restore focus to the bell button when closed.

### Session and lifecycle edge cases

- Multiple Sessions may ring at once. Alarm state is independent per Session.
- Detaching or reattaching a ringing Session preserves the ring because the ring belongs to the Session.
- A Session that exits while ringing continues to ring until attended, dismissed, disabled, or destroyed by the user.
- Killing the Session clears all alarm and TODO state because the Session no longer exists.
- If output resumes while a Session is ringing and the Session has attention, the ring clears and the Session returns to the normal state-machine flow. If the Session lacks attention, the ring persists (latch behavior prevents silent dismissal).
- App blur clears attention but does not dismiss existing rings.

### Internationalization

- Icon-only header controls avoid fixed-width translated labels.
- Tooltips, menus, and modal actions must wrap cleanly for longer translations.
- Use logical CSS properties where layout direction matters so RTL remains correct.
- The literal TODO pill may remain `TODO` in v1, but the layout must tolerate a longer localized label later.

## Scenarios

### Slow response, same pane, user walks away

- User enables alarm on a Pane.
- User runs a slow command.
- The Session progresses through `MIGHT_BE_BUSY` and `BUSY`.
- The Session later goes quiet, then transitions through `MIGHT_NEED_ATTENTION` into `ALARM_RINGING`.
- If `T_USER_ATTENTION` has expired, the Pane rings even if it remained selected.

### Slow response, user switched elsewhere

- User enables alarm on Session A.
- Session A becomes `MIGHT_BE_BUSY`, then `BUSY`.
- User works in Session B or another app.
- Session A later goes quiet long enough to transition into `ALARM_RINGING`.
- Session A rings because it does not have attention.

### Door rings, user wants to inspect immediately

- User detaches an alarm-enabled Session into a Door.
- The Session later transitions into `ALARM_RINGING`.
- The Door rings.
- User clicks the Door.
- The Session reattaches into passthrough and the ring clears.

### Door rings, user wants to keep command-mode control

- User detaches an alarm-enabled Session into a Door.
- The Door starts ringing.
- User presses `d` on the Door in command mode.
- The Pane is restored, but the ring remains because the user has not yet explicitly attended to the Session.

### User dismisses, then new output arrives

- A Session rings.
- User clicks into the pane to read the output.
- The alarm clears, a soft TODO appears (dashed pill).
- User types a command → soft TODO auto-clears (they engaged).
- The Session later emits new output, progresses through `BUSY`, and eventually reaches `ALARM_RINGING` again.

### User dismisses but doesn't engage

- A Session rings.
- User clicks into the pane briefly, then switches to another session.
- The alarm clears, a soft TODO appears.
- User never types into the terminal → soft TODO persists.
- User later notices the dashed TODO pill and clicks it → "Clear" / "Keep".
- Choosing "Keep" promotes to a hard (solid) TODO.

## Verification checklist

- Alarm only rings on a fresh transition into `ALARM_RINGING`
- Single quick responses stay in `NOTHING_TO_SHOW`
- short pauses in a `BUSY` session only reach `MIGHT_NEED_ATTENTION`, not `ALARM_RINGING`
- Resize noise cannot cause a ring
- Detach/reattach preserves alarm state (`status` and `todo`)
- `d` restore from a Door does not silently clear a ring
- click/`Enter` restore from a Door does clear a ring
- very long titles do not push bell or TODO indicators out of bounds
- ringing is still understandable with reduced motion enabled
- multiple simultaneous ringing Sessions remain independently dismissible
