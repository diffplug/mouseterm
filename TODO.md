# Storybook Cleanup TODO

## Wall Stories

- [x] Remove `Wall/Multi Pane Dark` and `Wall/Multi Pane Light`; theme-specific Wall stories are not needed.
- [x] Fix `Wall/With Doors` so the story actually shows minimized doors.
- [x] Remove `Wall/Marketing Demo`.
- [x] Fix `Wall/Alert Enabled Idle Pane` so the alert-enabled state is visible.
- [x] Fix `Wall/Alert Ringing Pane` so the ringing state is visible.
- [x] Fix `Wall/Alert Ringing Door` so the minimized door shows the ringing state.
- [x] Fix `Wall/Alert Modal Open` so the alert dialog is visible.
- [x] Fix `Wall/Todo After Dismiss` so the TODO state is visible.
- [x] Fix `Wall/Minimized Ringing Session` so the minimized session shows ringing and TODO state.
- [x] Fix `Wall/Multiple Ringing Sessions` so all intended alert/TODO states are visible.

## Terminal Header Stories

- [ ] Fix or remove `TerminalPaneHeader/Todo Click To Dismiss`; it currently clicks a noop and matches `Todo And Alert Enabled`.

## Text Selection Stories

- [ ] Fix `TextSelection/Linewise Outline` so it is outline-only.
- [ ] Fix `TextSelection/Block Outline` so it is outline-only.

## Selection Overlay Stories

- [x] Replace `SelectionOverlay` stories with stories that exercise the real selection overlay component instead of a hand-rolled `MarchingAntsRect` demo.

## Update Banner Stories

- [ ] Remove or reframe `UpdateBanner/Idle`; it renders blank because the component returns `null`.
- [ ] Remove or reframe `UpdateBanner/Dismissed`; it renders blank because the component returns `null`.
- [ ] Reframe `UpdateBanner/Long Version String` so the long-version stress case is obvious.
- [ ] Reframe `UpdateBanner/Narrow Viewport` so the constrained width is visible.

## App Bar Stories

- [ ] Make `AppBar/Default`, `AppBar/Single Shell`, and `AppBar/Many Shells` meaningfully different, likely by opening the shell dropdown or reducing the story set.

## Kill Modal Stories

- [ ] Fix or remove `KillModal/Shaking`; it is visually identical to `Default` in static capture.

## Story Framing

- [ ] Improve thin chrome story framing for `Door`, `TerminalPaneHeader`, `MouseHeaderIcon`, `UpdateBanner`, `AppBar`, and `Baseboard` so the target UI is not a tiny strip in a mostly blank fullscreen canvas.
