> [!CAUTION]
> This project is under construction and not ready for public use. Please check back in a few days!

# MouseTerm

Multitasking terminal with tmux keybindings, mouse support, and a built-in alert system for completed tasks and prompts.

TODO: GIF demonstrating a 3-pane layout where one pane finishes a build and its border changes to show completion, while the user clicks to split another pane and drags to resize

  - GIF starts out with one terminal
  - npm dev, sleep it
  - claude, start a long job
  - split horizontal, codex long job
  - claude alerts when done

## Features

### Built-in Alert System

Know when a task finishes without watching it. MouseTerm monitors terminal output and marks panes as done when they go quiet — works with any CLI tool, zero configuration. No more staring at idle screens or forgetting which terminal you were waiting on.

TODO: GIF showing two terminals running long tasks, one finishes and gets the ✓ floating status, user is working in another pane and notices at a glance

### Tiling Layout with Minimize / Maximize

Split horizontally, split vertically, drag to resize. Maximize the complicated one. Minimize the ones you don't need to look at right now (detach in tmux terminology). Alerts keep running whether minimized or not.

Already know tmux? Same shortcuts. Nothing new to learn.

Never used tmux? Click everything with the mouse, hover to learn the shortcuts if you want.

TODO: GIF showing splitting panes with mouse clicks and keyboard shortcuts, dragging borders to resize, swapping pane positions

### Any Theme, Anywhere

MouseTerm uses your VSCode theme — colors, styling, everything. Switch themes and MouseTerm switches with you. No separate configuration, no mismatched colors.

TODO: GIF showing theme switching — user changes VSCode theme and MouseTerm updates instantly to match

You can also use MouseTerm in the View area (bottom and sides), in the Editor area (center region where the files are), or both.

TODO: GIF showing MouseTerm in various areas

## Getting Started

1. Install the extension
2. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **MouseTerm: Open**

## Keyboard Reference

MouseTerm has two modes: **command** for managing panes, and **passthrough** where all keypresses passthrough to the terminal.

Press `Enter` to go from **command** to **passthrough** mode.
Press `Left Cmd` then `Right Cmd` in quick succession to go back to **command** mode.

### Command Mode Shortcuts

| Key | Action |
|-----|--------|
| `"` | Split horizontally (" looks like it was split in half horizontally) |
| `%` | Split vertically (the slash in % looks like it's splitting something vertically) |
| Arrow keys | Navigate between panes |
| `Cmd+Arrow` | Swap pane positions |
| `Enter` | Enter terminal mode |
| `z` | Zoom / unzoom the selected pane |
| `d` | Detach pane to bottom bar |
| `x` | Close pane |
| `,` | Rename pane |

## Links

- Also available as a standalone terminal app for Win, Mac and Linux at [mouseterm.com](https://mouseterm.com)
- [GitHub](https://github.com/diffplug/mouseterm)
- [Report an Issue](https://github.com/diffplug/mouseterm/issues)
