# Auto-Update Spec

The standalone app checks for updates on launch, downloads silently in the background, and installs when the user quits. A banner tells the user an update is pending. On next launch, a brief banner confirms the update succeeded (or notes a failure).

## How it works

```
app launch
  │
  ├─ check for post-install markers in localStorage
  │    ├─ success marker → show "Updated to vX.Y.Z" banner (auto-dismisses after 10s)
  │    ├─ failure marker → show "Update failed — will retry" banner
  │    └─ no marker → continue
  │
  ├─ wait 5 seconds
  │
  ├─ check(endpoint) ──→ no update ──→ done (silent)
  │                  │
  │                  └─→ update available → download in background
  │                                           ├─ success → show "will install when you quit" banner
  │                                           └─ failure → log error, done (silent)
  │
  ... user works normally ...
  │
  user quits
  │
  ├─ no pending update → exit normally
  └─ pending update → write success marker → install() → exit
                         │
                         └─ install fails → overwrite with failure marker → exit normally
```

The `Update` object from `download()` is held in memory for the session. The close handler intercepts the window close event, writes a success marker to `localStorage` *before* calling `install()` (because on Windows, NSIS force-kills the process), then calls `install()`. In Vite dev mode (`pnpm dev:standalone`), the close handler skips `install()` without preventing the close. Dev mode is useful for testing check/download/banner behavior, but install must be tested from a packaged app because the updater resolves its replacement target from the current executable path.

## Update notice in the Baseboard

Update status appears as a text notice on the right side of the Baseboard (the always-visible bottom strip — see `layout.md`). It coexists with doors and shortcut hints.

| State | Message | Changelog | Auto-dismiss |
|-------|---------|-----------|--------------|
| `downloaded` | "Update downloaded (v0.5.0) — will install when you quit." | Yes | No |
| `post-update-success` | "Updated to v0.5.0 — from v0.4.0." | Yes | 10 seconds |
| `post-update-failure` | "Update to v0.5.0 failed — will retry next launch." | No | No |

All states are dismissible via [×]. Dismissing hides the notice for the session only — it does not affect whether the update installs on quit.

The notice matches the Baseboard's existing text style (9px mono, `text-muted`). It's pushed right via `ml-auto` so it doesn't compete with doors or the shortcut hint on the left.

### Threading

The Baseboard is in `lib/` but the updater is standalone-only. The notice is threaded as a `ReactNode` prop: `App` → `Wall` → `Baseboard` (via `baseboardNotice`). This keeps all updater knowledge out of `lib/` — the Baseboard just renders an opaque slot.

## Platform behavior at quit

| Platform | What `install()` does | App exit |
|----------|----------------------|----------|
| Windows | Launches NSIS installer in passive mode (progress bar, no user interaction). Force-kills the app. | Automatic (NSIS) |
| macOS | Replaces the `.app` bundle in place | `getCurrentWindow().close()` after `install()` returns |
| Linux | Replaces the AppImage in place | `getCurrentWindow().close()` after `install()` returns |
| Vite dev mode | Skips `install()` to avoid replacing the dev executable directory | Native close proceeds normally |

Windows uses `"installMode": "passive"` (configured in `tauri.conf.json` under `plugins.updater.windows`).

## localStorage

Single key: `mouseterm:update-result`

| Scenario | Value written | When cleared |
|----------|--------------|--------------|
| Successful install | `{ "from": "0.4.0", "to": "0.5.0" }` | On next launch, after reading |
| Failed install | `{ "failed": true, "version": "0.5.0", "error": "..." }` | On next launch, after reading |

The success marker is written *before* `install()` because Windows NSIS force-kills the process — if we wrote it after, it would never persist. If `install()` then throws, the marker is overwritten with a failure entry.

## Files

| File | Role |
|------|------|
| [`standalone/src/updater.ts`](../../standalone/src/updater.ts) | State machine, update check, background download, close handler, post-install markers |
| [`standalone/src/UpdateBanner.tsx`](../../standalone/src/UpdateBanner.tsx) | Pure presentational component — renders inline notice content for the Baseboard |
| [`standalone/src/main.tsx`](../../standalone/src/main.tsx) | Passes `<ConnectedUpdateBanner />` as the `baseboardNotice` prop to `<App />`, calls `startUpdateCheck()` after platform init |

All updater code is standalone-only. The Baseboard accepts a generic `notice` prop (`ReactNode`) — it has no knowledge of the updater.

## Configuration

In `standalone/src-tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "<ed25519 public key>",
    "endpoints": ["https://mouseterm.com/standalone-latest.json"],
    "windows": { "installMode": "passive" }
  }
}
```

The Rust side registers the plugin with `tauri_plugin_updater::Builder::new().build()` in `lib.rs`. No custom Rust commands or `on_before_exit` hooks — the JS close handler handles everything. Capabilities must include `core:window:allow-destroy` as well as `core:window:allow-close`: Tauri's `onCloseRequested` API calls `destroy()` after the handler returns when the close was not prevented.

## Dependencies

- `@tauri-apps/plugin-updater` — update check, download, install
- `@tauri-apps/api/window` — `getCurrentWindow()`, `onCloseRequested`
- `@tauri-apps/api/app` — `getVersion()` for the "from" version in markers
- `@tauri-apps/plugin-shell` — `open()` for the changelog link
- `tauri-plugin-updater` Rust crate — registered in `Cargo.toml` and `lib.rs`

## Design decisions

**Why install on quit, not on demand?** MouseTerm is a terminal app with running processes. A mid-session relaunch would kill all sessions. By installing at quit time, the user has already decided to close their terminals.

**Why no "skip this version"?** The update is already downloaded and will install on quit regardless. There's nothing to opt out of. [×] just hides the notification.

**Why the Baseboard, not a top banner?** A top banner pushes terminal content down, which is disruptive in a terminal app. The Baseboard is already a status strip — the update notice fits naturally alongside doors and shortcut hints. It also avoids adding a new UI element; the notice just occupies unused space in an existing one.

**Why write the success marker before `install()`?** On Windows, the NSIS installer force-kills the process — code after `install()` may never run. Writing optimistically and overwriting on failure handles both platforms correctly.

**Why no `on_before_exit` Rust hook?** The JS close handler (`onCloseRequested`) runs before `install()` and handles marker writes. On Windows, NSIS handles process termination after `install()`. Sidecar cleanup is not currently handled at update-time — the sidecar process is orphaned and will exit when its stdin closes.

**Why `localStorage` instead of Tauri's store plugin?** `localStorage` persists across launches in Tauri's webview, requires no additional dependencies, and is automatically scoped to the app. If the user resets app data, markers are cleaned up naturally.
