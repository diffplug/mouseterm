# MouseTerm

Multitasking terminal for mice.

- VSCode plugin or standalone desktop app
- tmux-compatible keybindings AND mouse
- alarm system for notifying when a terminal task is done or waiting for user input

Major URLs:
- [homepage with screen recordings](https://mouseterm.com)
- [download standalone app or VSCode plugins](https://mouseterm.com/#download)
- [playground and tutorial](https://mouseterm.com/playground)
- [production dependencies](https://mouseterm.com/dependencies)

## Development

This project uses pnpm, react, typescript, vite, tailwind, storybook, and xterm.js. The standalone app is built with Tauri.

The terminal is currently hosted by `node-pty`, but we plan on switching to a Rust backend for the PTY.

### Quickstart

Here are the key development loops:

```sh
pnpm install
pnpm dev:website  # http://localhost:5173/playground
pnpm storybook    # http://localhost:6006
pnpm test           # runs all tests
pnpm dogfood:vscode # builds the VSCode extension and installs it into your local VSCode
```

### Folder structure

| Path | Description |
|------|-------------|
| `lib/` | Shared terminal library |
| `website/` | mouseterm.com (including playground) |
| `standalone/` | Tauri desktop app |
| `vscode-ext/` | VSCode extension |

### Agent strategy

This project was built with a combination of Claude, Codex, and Devin. Recommend running `npx skills experimental_install` to install the skills we are using (namely [impeccable.style](https://impeccable.style/)). See [AGENTS.md](AGENTS.md) for more detail.

## License

[FSL-1.1-MIT](LICENSE) — Copyright 2026 DiffPlug LLC
