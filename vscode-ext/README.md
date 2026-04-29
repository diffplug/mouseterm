# MouseTerm

Terminal multiplexer for VS Code (or [standalone app](https://mouseterm.com/#download)) - tmux keybindings, mouse support, human-friendly copy-paste, and alerts for completed tasks.

[mouseterm.com/playground](https://mouseterm.com/playground) - try before you install

TODO: Hero GIF.

## Alert System

MouseTerm tracks activity the same way you do — visual motion. When a pane stops changing for two seconds, it marks the task complete and alerts you. Works with any CLI tool that prints to a terminal, no plugins or configuration.

TODO: GIF showing two terminals running long tasks, one finishes and gets the ✓ floating status, user is working in another pane and notices at a glance

- TODO: alerts disabled
- TODO: alerts enabled
- TODO: task is running, will send an alert when task completes
- TODO: task is finished and needs your attention

When you click a task that was ringing, it adds a TODO next to the terminal's title. This TODO will remain until you hit `Enter` in that terminal, or until you explicitly dismiss the TODO by clicking it or typing `t` in command mode.

This lightweight TODO system remembers which tasks need follow-up so you don't have to.

## Mouse-Friendly Copy and Paste

When you copy-paste from a terminal, you are usually stuck with a bunch of newlines that you wouldn't get if you were copying from any other kind of program. MouseTerm can optionally remove these with `Copy Rewrapped`.

<video src="https://github.com/user-attachments/assets/4d1f1b00-5ce8-4ca0-b05f-9bf5a6eddaba" autoplay muted loop playsinline width="744" height="378"></video>

For TUIs which register for xterm mouse interception (such as `htop` and `neovim`), most terminals make it impossible for you to copy using the mouse. MouseTerm makes it easy to temporarily override the mouse interception.

TODO: GIF showing htop and the override mechanism

## Tiling Layout with Minimize

Run builds, agents, servers, and scripts side by side. Minimize the ones you're not watching to a compact status indicator — every pane keeps running and every alert still fires whether minimized or not.

You can spawn, layout, and relayout everything in the terminal using any of:

- default tmux shortcuts
- intuitive modern shortcuts
- the mouse

TODO: layout GIF

## Keyboard Shortcuts

If you use the mouse, then MouseTerm is always in **passthrough** mode, where all keypresses passthrough to the selected terminal. If you press `LShift` followed by `RShift` in quick succession (or `LCmd → RCmd`, or `LCtrl → RCtrl`), then you will enter **command** mode where keypresses can spawn terminals, navigate panes, and rearrange the layout.

### Command Mode Shortcuts


| Key | Action |
|-----|--------|
| `Enter` | Return to **passthrough** mode |
| `\|` tmux `%` | Split left/right |
| `-` tmux `"` | Split top/bottom |
| Arrow keys | Navigate between panes |
| `Cmd+Arrow` | Swap pane positions |
| `z` | Zoom / unzoom the selected pane |
| `m` tmux `d` | Minimize pane to baseboard |
| `k` tmux `x` | Kill pane |
| `,` | Rename pane |

## Any Theme, Anywhere

MouseTerm uses your VSCode theme — colors, styling, everything. Switch themes and MouseTerm switches with you. No separate configuration, no mismatched colors.

TODO: GIF showing theme switching — user changes VSCode theme and MouseTerm updates instantly to match

You can also use MouseTerm in the Panel area (bottom, next to the built-in terminal), in the Editor area (center region where you edit files), or both.

TODO: GIF showing MouseTerm in various areas

## Getting Started

1. Install the extension
2. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
  - **MouseTerm: Focus** to open the "Panel" version of MouseTerm (next to the terminal)
  - **MouseTerm: Open in Editor** to open a MouseTerm tab in the content area (you can open multiple)

## Links

- Prefer a standalone terminal app? Self-updating installers available for Win, Mac and Linux at [mouseterm.com](https://mouseterm.com/#download)
- You can try it in a [browser playground](https://mouseterm.com/playground)
- [GitHub](https://github.com/diffplug/mouseterm)
- Brought to you by [DiffPlug](https://www.diffplug.com/)
