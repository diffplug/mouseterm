# Deploy Spec

## What we ship

Every release produces three artifact groups under one version and changelog:

| Artifact | Format | Destination |
|----------|--------|-------------|
| VSCode extension | `.vsix` | VS Code Marketplace + OpenVSX |
| Standalone (Windows) | NSIS `.exe` installer | GitHub Release + Tauri updater |
| Standalone (macOS, Apple Silicon) | `.dmg` (install) + `.tar.gz` (update) | GitHub Release + Tauri updater |
| Standalone (Linux) | AppImage + `.deb` | GitHub Release + Tauri updater |

## Versioning

A single version number (`X.Y.Z`) applies to all artifacts. The version lives in three places that must stay in sync:

- `standalone/src-tauri/tauri.conf.json` → `version`
- `vscode-ext/package.json` → `version`
- `lib/package.json` → `version` (if applicable)

A release is triggered by pushing a tag: `v0.1.0`. This is intentionally a single tag (not separate `vscode-ext/v*` and `standalone/v*` tags) because we want one changelog entry for both.

## Two-stage pipeline

Code signing for Windows requires a physical USB hardware key (EV cert via PIV). macOS signing uses a local Developer ID cert. Both must happen locally. So:

```
Stage 1: CI (GitHub Actions)
  → Build unsigned Tauri apps (win, mac, linux)
  → Build + publish VSCode extension
  → Upload unsigned Tauri artifacts

Stage 2: Local (sign-and-deploy.sh)
  → Download CI artifacts
  → Sign macOS (codesign + notarize)
  → Sign Windows (jsign + PIV hardware key)
  → Generate Tauri update manifest with signatures
  → Upload signed artifacts to GitHub Release
```

## Stage 1: CI workflow

Triggered by tag push `v*`. Three parallel jobs:

### Job: `build-standalone` (matrix)

Runs on `ubuntu-22.04` (linux), `macos-latest` (mac), and `windows-latest` (win). Uses `tauri-apps/tauri-action@v0`.

```yaml
strategy:
  matrix:
    include:
      - platform: ubuntu-22.04
        target: x86_64-unknown-linux-gnu
      - platform: macos-latest
        target: aarch64-apple-darwin
      - platform: windows-latest
        target: x86_64-pc-windows-msvc
```

Each matrix leg:
1. Checkout, setup Node 22, pnpm 10, Rust stable
2. Install workspace dependencies once from the repo root with `pnpm install --frozen-lockfile`
3. Install system deps (Linux: libgtk, libwebkit, etc.)
4. Build via `tauri-action` — but **skip signing** (no `APPLE_SIGNING_IDENTITY`, no `TAURI_SIGNING_PRIVATE_KEY`)
5. Upload artifacts (installers + bundles) via `actions/upload-artifact`

**Note:** We do NOT use `tauri-action`'s built-in GitHub Release creation. We create the release locally after signing.

### Job: `build-vscode`

Runs on `ubuntu-latest`:
1. Checkout, setup Node 22, pnpm 10
2. `pnpm install --frozen-lockfile` at the repo root
3. `pnpm --filter mouseterm-lib test`
4. `pnpm --filter mouseterm build:frontend && pnpm --filter mouseterm build`
5. `npx vsce package --no-dependencies`
6. Upload `.vsix` as artifact

### Job: `publish-vscode`

Runs after `build-vscode` succeeds:
1. Download `.vsix` artifact
2. `npx vsce publish --packagePath *.vsix --no-dependencies`
3. `npx ovsx publish --packagePath *.vsix --no-dependencies`

This runs in CI because VSCode Marketplace publishing uses PAT tokens (no hardware key needed).

**Migration note:** This replaces the existing `.github/workflows/publish-vscode.yml`, which was triggered by `vscode-ext/v*` tags and has never been run. That workflow should be deleted when the unified release workflow is created. Fixes from the old workflow: use `ubuntu-latest` instead of `macos-latest`, upgrade to Node 22, and unify under the `v*` tag convention.

## Stage 2: Local script

`scripts/sign-and-deploy.sh` — modeled on the Type The Rhythm script.

### Prerequisites

```bash
brew install gh jsign
gh auth login
xcode-select --install
tauri signer generate  # one-time: creates update signing keypair
```

### Signing identity

| Platform | Tool | Identity |
|----------|------|----------|
| macOS | codesign + notarytool | Developer ID Application: DiffPlug LLC (LXW8WAGWYX) |
| Windows | jsign | PIV hardware key, alias AUTHENTICATION, TSA http://ts.ssl.com |

### Two signing layers

There are two independent signing layers. OS signing proves the executable is from DiffPlug; Tauri signing proves the update bundle hasn't been tampered with in transit. Both are required — they protect different things at different points in time.

| Layer | What it signs | Who verifies | What happens without it |
|-------|--------------|--------------|------------------------|
| OS (codesign / jsign) | The executable (`.app` / `.exe`) | The OS, on launch | Gatekeeper / SmartScreen warnings |
| Tauri updater (ed25519) | The update bundle (`.tar.gz` / `.nsis.zip`) | The running app, on update | Updater rejects the download |

**Order matters:** OS-sign the inner executable first, then package it into the update bundle, then Tauri-sign the bundle. The `.sig` file is generated from the final bundle that already contains the OS-signed binary.

```
codesign/jsign the executable
  → package into update bundle (.tar.gz / .nsis.zip)
    → Tauri-sign the bundle → produces .sig file
      → upload bundle + .sig to GitHub Release
```

### Flow

```
./scripts/sign-and-deploy.sh all 0.1.0
```

1. **Wait for CI** — find the workflow run for tag `v0.1.0`, poll until complete
2. **Download artifacts** — `gh run download` into `release-signed/`
3. **Sign macOS** (OS layer)
   - Fix any framework symlink issues (artifact downloads flatten symlinks)
   - `codesign --force --deep --sign "$IDENTITY" --entitlements ... --options runtime`
   - Notarize via `xcrun notarytool submit --wait`
   - `xcrun stapler staple`
   - Re-package signed `.app` into `.dmg` (for direct download) and `.tar.gz` (for updater)
4. **Sign Windows** (OS layer)
   - Sign the inner exe: `jsign --storetype PIV --storepass "$PIN" --alias AUTHENTICATION --tsaurl http://ts.ssl.com --tsmode RFC3161 MouseTerm.exe`
   - Rebuild the NSIS installer around the signed exe
   - Sign the installer exe: `jsign ... MouseTerm-windows-x64.exe`
5. **Sign update bundles** (Tauri layer)
   - Tauri-sign each update bundle (the `.tar.gz` and `.nsis.zip` from steps 3-4) using `TAURI_SIGNING_PRIVATE_KEY`
   - This produces a `.sig` file per bundle
   - Build the update manifest JSON (see below) with the `.sig` contents inline
6. **Create GitHub Release**
   - `gh release create v0.1.0 --title "v0.1.0" --notes-file CHANGELOG.md`
   - Upload: signed installers (`.dmg`, `.exe`, `.AppImage`, `.deb`) + update bundles (`.tar.gz`, `.nsis.zip`) + `.sig` files + `latest.json` manifest
7. **Verify** — spot-check signatures, confirm release assets are correct

### Resuming after failure

```bash
./scripts/sign-and-deploy.sh resume 0.1.0  # re-download + sign + release
./scripts/sign-and-deploy.sh sign-mac       # re-sign macOS only
./scripts/sign-and-deploy.sh sign-win       # re-sign Windows only
./scripts/sign-and-deploy.sh release 0.1.0  # re-create GitHub Release only
```

## Artifact filenames

All release assets use **stable filenames** (no version in the name). This allows hotlinking directly from mouseterm.com via GitHub's `/latest/download/` redirect, which always resolves to the most recent release.

| Asset | Filename | Purpose |
|-------|----------|---------|
| Windows installer | `MouseTerm-windows-x64.exe` | Direct download |
| Windows update bundle | `MouseTerm-windows-x64.nsis.zip` | Tauri updater |
| macOS installer | `MouseTerm-macos-aarch64.dmg` | Direct download |
| macOS update bundle | `MouseTerm-macos-aarch64.tar.gz` | Tauri updater |
| Linux AppImage | `MouseTerm-linux-x86_64.AppImage` | Direct download |
| Linux update bundle | `MouseTerm-linux-x86_64.AppImage.tar.gz` | Tauri updater |
| Linux deb | `MouseTerm-linux-x86_64.deb` | Direct download |
| Update manifest | `latest.json` | Tauri updater endpoint |

### Download hotlinks

The mouseterm.com download page can link directly to the latest release with no server-side logic:

```
https://github.com/diffplug/mouseterm/releases/latest/download/MouseTerm-windows-x64.exe
https://github.com/diffplug/mouseterm/releases/latest/download/MouseTerm-macos-aarch64.dmg
https://github.com/diffplug/mouseterm/releases/latest/download/MouseTerm-linux-x86_64.AppImage
```

These can later be migrated to `mouseterm.com/download/...` URLs backed by Cloudflare R2 (for analytics) without changing anything in the app — only the website links and the updater endpoint URL in `tauri.conf.json` would change.

## Tauri auto-updater

### Configuration

In `standalone/src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<TAURI_SIGNING_PUBLIC_KEY>",
      "endpoints": [
        "https://mouseterm.com/standalone-latest.json"
      ]
    }
  }
}
```

And in the Rust app bootstrap (`standalone/src-tauri/src/lib.rs`), the updater plugin is registered with:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

`standalone/src-tauri/Cargo.toml` must include `tauri-plugin-updater = "2"` so the configured updater endpoint is actually active at runtime.

### Update manifest (`standalone-latest.json`)

Generated by the local script after signing. The script copies it to `website/public/standalone-latest.json` so it's served from `mouseterm.com/standalone-latest.json` via Cloudflare Pages. This gives us request analytics on update checks. The manifest is also uploaded to the GitHub Release as a backup.

```json
{
  "version": "0.1.0",
  "notes": "Release notes here",
  "pub_date": "2026-03-25T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "url": "https://github.com/diffplug/mouseterm/releases/download/v0.1.0/MouseTerm-windows-x64.nsis.zip",
      "signature": "<contents of .sig file>"
    },
    "darwin-aarch64": {
      "url": "https://github.com/diffplug/mouseterm/releases/download/v0.1.0/MouseTerm-macos-aarch64.tar.gz",
      "signature": "<contents of .sig file>"
    },
    "linux-x86_64": {
      "url": "https://github.com/diffplug/mouseterm/releases/download/v0.1.0/MouseTerm-linux-x86_64.AppImage.tar.gz",
      "signature": "<contents of .sig file>"
    }
  }
}
```

Note: the update manifest URLs include the version in the *path* (`/v0.1.0/`) but the *filenames* are stable. The manifest itself is served from `mouseterm.com/standalone-latest.json` — Cloudflare Pages analytics tracks every update check.

## Release checklist

Human-driven steps, in order:

1. **Update dependencies page** — run `node website/scripts/generate-deps.js` and review the diff in `website/src/data/dependencies.json`. Commit if changed.
2. **Finalize changelog** — promote the `[Unreleased]` section in `CHANGELOG.md` to `[X.Y.Z]` with today's date. Write release notes covering both standalone and VSCode changes.
3. **Bump versions** — update `version` in all three places:
   - [standalone/src-tauri/tauri.conf.json](../../standalone/src-tauri/tauri.conf.json)
   - [vscode-ext/package.json](../../vscode-ext/package.json)
   - [lib/package.json](../../lib/package.json)
4. **Commit and tag** — `git commit -m "Release vX.Y.Z"` then `git tag vX.Y.Z`.
5. **Push** — `git push && git push origin vX.Y.Z`. This triggers CI (Stage 1).
6. **Wait for CI** — monitor the workflow run. VSCode extension publishes automatically.
7. **Run local signing** — `./scripts/sign-and-deploy.sh all X.Y.Z`. Plug in the PIV USB key first. The script will:
   - Download unsigned CI artifacts
   - Sign macOS (will prompt for `APPLE_SIGN_PASS` if not set)
   - Sign Windows (will prompt for `EV_SIGN_PIN` if not set)
   - Generate Tauri update manifest and copy to `website/public/standalone-latest.json`
   - Create the GitHub Release with all signed assets
8. **Deploy website** — commit the updated `website/public/standalone-latest.json` and deploy mouseterm.com so the updater endpoint is live.
9. **Verify the release**
   - Check GitHub Release assets are correct
   - On a Mac: download the `.dmg`, open it, confirm no Gatekeeper warnings
   - On Windows: download the `.exe` installer, confirm no SmartScreen warnings
   - Confirm Tauri auto-updater picks up the new version (test from a previous version)
   - Confirm VSCode extension is live on Marketplace and OpenVSX

## Changelog

A single `CHANGELOG.md` at the repo root, following [Keep a Changelog](https://keepachangelog.com/) format. The `[Unreleased]` section is promoted to `[X.Y.Z]` at release time. The release notes include both standalone and VSCode changes in one entry.

## Environment / secrets

| Secret | Where | Purpose |
|--------|-------|---------|
| `VSCE_PAT` | GitHub Actions secret | VS Code Marketplace publish |
| `OVSX_PAT` | GitHub Actions secret | OpenVSX publish |
| `GITHUB_TOKEN` | GitHub Actions (automatic) | Artifact upload |
| `APPLE_SIGNING_IDENTITY` | Local keychain | macOS codesign |
| `APPLE_ID` | Local env / prompted | Notarization |
| `APPLE_SIGN_PASS` | Local env / prompted | Notarization password |
| `APPLE_TEAM_ID` | Local env / hardcoded | Notarization |
| `EV_SIGN_PIN` | Local env / prompted | Windows PIV signing |
| `TAURI_SIGNING_PRIVATE_KEY` | Local env | Tauri update signatures |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Local env / prompted | Tauri update key password |
