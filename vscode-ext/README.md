# MouseTerm

Multitasking terminal with tmux keybindings, mouse support, human-friendly copy-paste, and an alert system for completed tasks and prompts. You can try it without installing at [mouseterm.com/playground](https://mouseterm.com/playground).


TODO: Hero GIF.

## Alert System

MouseTerm tracks activity the same way you do — visual motion. When a pane stops changing for two seconds, it marks the task complete and alerts you. Works with any CLI tool that prints to a terminal, no plugins or configuration.

TODO: GIF showing two terminals running long tasks, one finishes and gets the ✓ floating status, user is working in another pane and notices at a glance

- ![TODO] alerts disabled
- ![TODO] alerts enabled
- ![TODO] task is running, will start ringing when it completes
- ![TODO] task is finished and needs your attention

When you click a task that was ringing, it adds a `TODO`. This `TODO` will remain until you hit `[Enter]` in that terminal, or until you explicitly dismiss the `TODO` by clicking it or typing `t` in command mode.

This lightweight TODO system empowers you to glance at the result of a completed task without requiring you to remember to come back to it.

## Mouse-Friendly Copy and Paste

When you copy-paste from a terminal, you are usually stuck with a bunch of newlines that you wouldn't get if you were copying from any other kind of program. MouseTerm can optionally remove these with `Copy Rewrapped`.

TODO: GIF showing copy/paste with line-break rewrap

For TUIs which register for xterm mouse interception (such as `htop` and `neovim`), most terminals make it impossible for you to copy using the mouse. MouseTerm makes it easy to temporarily override the mouse interception.

TODO: GIF showing htop

## Tiling Layout with Minimize / Maximize

You can spawn, layout, and relayout everything in the terminal using any of:

- default tmux shortcuts
- intuitive modern shortcuts
- the mouse

TODO: layout GIF

## Keyboard shortcuts

MouseTerm has two modes: **command** for managing panes, and **passthrough** where all keypresses passthrough to the terminal.

Press `Enter` to drill down from **command** to **passthrough** mode for the selected terminal. To go back up to command mode, press `LShift` then `RShift` in quick succession (or `LCmd -> RCmd`, or `LCtrl -> RCtrl`).

### Command Mode Shortcuts


| Key | Action |
|-----|--------|
| `\|` tmux `%` | Split horizontally |
| `-` tmux `"` | Split vertically |
| Arrow keys | Navigate between panes |
| `Cmd+Arrow` | Swap pane positions |
| `Enter` | Enter terminal mode |
| `z` | Zoom / unzoom the selected pane |
| `m` tmux `d` | Minimize pane to baseboard |
| `k` tmux `x` | Kill pane |
| `,` | Rename pane |


## Any Theme, Anywhere

MouseTerm uses your VSCode theme — colors, styling, everything. Switch themes and MouseTerm switches with you. No separate configuration, no mismatched colors.

TODO: GIF showing theme switching — user changes VSCode theme and MouseTerm updates instantly to match

You can also use MouseTerm in the Panel area (bottom and sides), in the Editor area (center region where the files are), or both.

TODO: GIF showing MouseTerm in various areas

## Getting Started

1. Install the extension
2. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. **MouseTerm: Focus** to open the "Panel" version of MouseTerm (next to the terminal)
4. **MouseTerm: Open in Editor** to open a MouseTerm tab in the content area (you can open multiple)

## Links

- Also available as a standalone terminal app for Win, Mac and Linux at [mouseterm.com](https://mouseterm.com/#download)
- You can try it in a [browser playground](https://mouseterm.com/playground)
- [GitHub](https://github.com/diffplug/mouseterm)
- Brought to you by [DiffPlug](https://www.diffplug.com/)