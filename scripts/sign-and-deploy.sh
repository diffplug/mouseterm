#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Local Code Signing and GitHub Release Script
# =============================================================================
# Downloads unsigned CI artifacts, signs macOS and Windows binaries locally,
# generates Tauri update manifest, and creates a GitHub Release.
#
# Usage: ./scripts/sign-and-deploy.sh all <version>
#   Example: ./scripts/sign-and-deploy.sh all 0.1.0
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$REPO_ROOT/release-signed"

# =============================================================================
# Configuration
# =============================================================================

# macOS Signing Identity
MACOS_IDENTITY="Developer ID Application: DiffPlug LLC (LXW8WAGWYX)"
MACOS_TEAM_ID="LXW8WAGWYX"
APPLE_ID="edgar.twigg@gmail.com"

# Windows Signing (jsign with PIV)
JSIGN_ALIAS="AUTHENTICATION"
TSA_URL="http://ts.ssl.com"

# GitHub repo
GITHUB_REPO="diffplug/mouseterm"

# Stable filenames for release assets
FNAME_WIN_EXE="MouseTerm-windows-x64.exe"
FNAME_WIN_UPDATE="MouseTerm-windows-x64.nsis.zip"
FNAME_MAC_ARM_DMG="MouseTerm-macos-aarch64.dmg"
FNAME_MAC_ARM_UPDATE="MouseTerm-macos-aarch64.tar.gz"
FNAME_MAC_INTEL_DMG="MouseTerm-macos-x86_64.dmg"
FNAME_MAC_INTEL_UPDATE="MouseTerm-macos-x86_64.tar.gz"
FNAME_LINUX_APPIMAGE="MouseTerm-linux-x86_64.AppImage"
FNAME_LINUX_UPDATE="MouseTerm-linux-x86_64.AppImage.tar.gz"
FNAME_LINUX_DEB="MouseTerm-linux-x86_64.deb"
FNAME_MANIFEST="latest.json"

# =============================================================================
# Helper Functions
# =============================================================================

log() { echo "[$(date '+%H:%M:%S')] $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }
warn() { echo "[WARN] $*" >&2; }

prompt_secret() {
    local varname="$1"
    local prompt="$2"
    if [[ -z "${!varname:-}" ]]; then
        read -rsp "$prompt: " "$varname"
        echo
        export "$varname"
    fi
}

check_command() {
    command -v "$1" &>/dev/null || error "Required command not found: $1. Install with: $2"
}

check_git_clean() {
    log "Checking git status..."

    if ! git -C "$REPO_ROOT" diff --quiet || ! git -C "$REPO_ROOT" diff --cached --quiet; then
        error "Local changes detected. Commit or stash changes before deploying."
    fi

    if [[ -n "$(git -C "$REPO_ROOT" ls-files --others --exclude-standard)" ]]; then
        error "Untracked files detected. Commit or remove them before deploying."
    fi

    local branch
    branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)
    local upstream
    upstream=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null) || true

    if [[ -n "$upstream" ]]; then
        local ahead
        ahead=$(git -C "$REPO_ROOT" rev-list --count "$upstream..HEAD")
        if [[ "$ahead" -gt 0 ]]; then
            error "You have $ahead unpushed commit(s). Push changes before deploying."
        fi
    else
        warn "No upstream branch set. Cannot verify commits are pushed."
    fi

    log "Git status clean."
}

# =============================================================================
# Download CI Artifacts
# =============================================================================

download_artifacts() {
    local version="$1"
    local tag="v$version"

    log "Finding workflow run for tag $tag..."

    check_command gh "brew install gh && gh auth login"

    local run_id=""
    local attempts=0
    local max_attempts=60  # 5 minutes of retries

    while [[ -z "$run_id" ]] && [[ $attempts -lt $max_attempts ]]; do
        run_id=$(gh run list \
            --repo "$GITHUB_REPO" \
            --workflow release.yml \
            --branch "$tag" \
            --limit 5 \
            --json databaseId \
            --jq ".[0].databaseId // empty")

        if [[ -z "$run_id" ]]; then
            attempts=$((attempts + 1))
            log "Workflow not found yet, waiting... (attempt $attempts/$max_attempts)"
            sleep 5
        fi
    done

    [[ -z "$run_id" ]] && error "Could not find workflow run for tag $tag"

    log "Found workflow run: $run_id"
    log "Waiting for workflow to complete (this may take several minutes)..."

    gh run watch "$run_id" --repo "$GITHUB_REPO" --exit-status \
        || error "Workflow failed. Check: https://github.com/$GITHUB_REPO/actions/runs/$run_id"

    log "Workflow completed successfully!"

    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR"

    log "Downloading artifacts..."
    gh run download "$run_id" \
        --repo "$GITHUB_REPO" \
        --dir "$WORK_DIR"

    log "Artifacts downloaded to $WORK_DIR"
    ls -la "$WORK_DIR"
}

resume_download() {
    local version="$1"
    local tag="v$version"

    log "Finding completed workflow run for tag $tag..."

    check_command gh "brew install gh && gh auth login"

    local run_id=""
    run_id=$(gh run list \
        --repo "$GITHUB_REPO" \
        --workflow release.yml \
        --branch "$tag" \
        --limit 5 \
        --json databaseId \
        --jq ".[0].databaseId // empty")

    [[ -z "$run_id" ]] && error "Could not find workflow run for tag $tag"

    local conclusion
    conclusion=$(gh run view "$run_id" --repo "$GITHUB_REPO" --json conclusion --jq '.conclusion')
    if [[ "$conclusion" != "success" ]]; then
        error "Workflow run $run_id has conclusion '$conclusion' (expected 'success'). Check: https://github.com/$GITHUB_REPO/actions/runs/$run_id"
    fi

    log "Found completed workflow run: $run_id"

    rm -rf "$WORK_DIR"
    mkdir -p "$WORK_DIR"

    log "Downloading artifacts..."
    gh run download "$run_id" \
        --repo "$GITHUB_REPO" \
        --dir "$WORK_DIR"

    log "Artifacts downloaded to $WORK_DIR"
    ls -la "$WORK_DIR"
}

# =============================================================================
# Sign macOS App Bundles
# =============================================================================

sign_macos_app() {
    local app_path="$1"
    local arch_label="$2"

    log "Signing macOS app ($arch_label): $app_path"

    [[ -d "$app_path" ]] || error "macOS app not found at $app_path"

    # Verify signing identity is available
    security find-identity -v -p codesigning | grep -q "$MACOS_IDENTITY" \
        || error "Signing identity not found: $MACOS_IDENTITY"

    # Sign with hardened runtime
    codesign --force --deep --sign "$MACOS_IDENTITY" \
        --options runtime \
        --timestamp \
        "$app_path"

    # Verify
    codesign --verify --deep --strict --verbose=2 "$app_path" \
        || error "Signature verification failed for $app_path"

    log "macOS signing complete ($arch_label)"
}

sign_macos() {
    log "Starting macOS code signing..."

    # Find and sign both arch builds
    local aarch64_app
    aarch64_app=$(find "$WORK_DIR/standalone-mac-aarch64" -name "*.app" -type d | head -1)
    local x86_64_app
    x86_64_app=$(find "$WORK_DIR/standalone-mac-x86_64" -name "*.app" -type d | head -1)

    [[ -n "$aarch64_app" ]] && sign_macos_app "$aarch64_app" "aarch64"
    [[ -n "$x86_64_app" ]] && sign_macos_app "$x86_64_app" "x86_64"

    log "All macOS signing complete"
}

# =============================================================================
# Notarize macOS Apps
# =============================================================================

notarize_macos_app() {
    local app_path="$1"
    local arch_label="$2"

    log "Notarizing macOS app ($arch_label)..."

    local zip_path="$WORK_DIR/notarize-${arch_label}.zip"

    ditto -c -k --keepParent "$app_path" "$zip_path"

    xcrun notarytool submit "$zip_path" \
        --apple-id "$APPLE_ID" \
        --team-id "$MACOS_TEAM_ID" \
        --password "$APPLE_SIGN_PASS" \
        --wait \
        --timeout 30m

    rm -f "$zip_path"

    xcrun stapler staple "$app_path"
    xcrun stapler validate "$app_path" \
        || warn "Stapler validation warning for $arch_label (may still work)"

    log "Notarization complete ($arch_label)"
}

notarize_macos() {
    log "Starting macOS notarization..."

    check_command xcrun "xcode-select --install"
    prompt_secret APPLE_SIGN_PASS "Enter Apple ID password (or app-specific password)"

    local aarch64_app
    aarch64_app=$(find "$WORK_DIR/standalone-mac-aarch64" -name "*.app" -type d | head -1)
    local x86_64_app
    x86_64_app=$(find "$WORK_DIR/standalone-mac-x86_64" -name "*.app" -type d | head -1)

    [[ -n "$aarch64_app" ]] && notarize_macos_app "$aarch64_app" "aarch64"
    [[ -n "$x86_64_app" ]] && notarize_macos_app "$x86_64_app" "x86_64"

    # Re-package signed+notarized apps into .dmg and .tar.gz
    for arch in aarch64 x86_64; do
        local app
        app=$(find "$WORK_DIR/standalone-mac-${arch}" -name "*.app" -type d | head -1)
        [[ -z "$app" ]] && continue

        local app_name
        app_name=$(basename "$app")

        if [[ "$arch" == "aarch64" ]]; then
            local dmg_name="$FNAME_MAC_ARM_DMG"
            local tar_name="$FNAME_MAC_ARM_UPDATE"
        else
            local dmg_name="$FNAME_MAC_INTEL_DMG"
            local tar_name="$FNAME_MAC_INTEL_UPDATE"
        fi

        log "Creating $dmg_name..."
        hdiutil create -volname "MouseTerm" -srcfolder "$app" \
            -ov -format UDZO "$WORK_DIR/$dmg_name"

        log "Creating $tar_name..."
        tar -czf "$WORK_DIR/$tar_name" -C "$(dirname "$app")" "$app_name"
    done

    log "All macOS notarization and packaging complete"
}

# =============================================================================
# Sign Windows Executable
# =============================================================================

sign_windows() {
    log "Starting Windows code signing..."

    check_command jsign "brew install jsign"
    prompt_secret EV_SIGN_PIN "Enter PIV PIN for Windows signing"

    # Find the inner exe
    local exe_path
    exe_path=$(find "$WORK_DIR/standalone-win-x64" -name "MouseTerm.exe" -not -name "*setup*" -not -name "*install*" | head -1)
    [[ -n "$exe_path" ]] || error "Windows executable not found"

    log "Signing inner executable: $exe_path"
    jsign \
        --storetype PIV \
        --storepass "$EV_SIGN_PIN" \
        --alias "$JSIGN_ALIAS" \
        --tsaurl "$TSA_URL" \
        --tsmode RFC3161 \
        "$exe_path"

    # Find the NSIS installer
    local installer_path
    installer_path=$(find "$WORK_DIR/standalone-win-x64" -name "*setup*.exe" -o -name "*install*.exe" | head -1)

    if [[ -n "$installer_path" ]]; then
        # TODO: Rebuild NSIS installer with signed exe, then sign the installer
        log "Signing installer: $installer_path"
        jsign \
            --storetype PIV \
            --storepass "$EV_SIGN_PIN" \
            --alias "$JSIGN_ALIAS" \
            --tsaurl "$TSA_URL" \
            --tsmode RFC3161 \
            "$installer_path"

        # Copy with stable filename
        cp "$installer_path" "$WORK_DIR/$FNAME_WIN_EXE"
    fi

    log "Windows signing complete"
}

# =============================================================================
# Sign Update Bundles (Tauri Layer)
# =============================================================================

sign_updates() {
    local version="$1"

    log "Signing update bundles with Tauri key..."

    prompt_secret TAURI_SIGNING_PRIVATE_KEY "Enter Tauri signing private key"

    local release_dir="$WORK_DIR/release-assets"
    mkdir -p "$release_dir"

    # Collect and rename update bundles with stable filenames
    # macOS .tar.gz (already created by notarize step)
    [[ -f "$WORK_DIR/$FNAME_MAC_ARM_UPDATE" ]] && cp "$WORK_DIR/$FNAME_MAC_ARM_UPDATE" "$release_dir/"
    [[ -f "$WORK_DIR/$FNAME_MAC_INTEL_UPDATE" ]] && cp "$WORK_DIR/$FNAME_MAC_INTEL_UPDATE" "$release_dir/"
    [[ -f "$WORK_DIR/$FNAME_MAC_ARM_DMG" ]] && cp "$WORK_DIR/$FNAME_MAC_ARM_DMG" "$release_dir/"
    [[ -f "$WORK_DIR/$FNAME_MAC_INTEL_DMG" ]] && cp "$WORK_DIR/$FNAME_MAC_INTEL_DMG" "$release_dir/"

    # Windows NSIS zip — rebuild with signed exe so Tauri auto-update gets the signed binary
    local win_nsis
    win_nsis=$(find "$WORK_DIR/standalone-win-x64" -name "*.nsis.zip" | head -1)
    if [[ -n "$win_nsis" ]]; then
        local signed_exe
        signed_exe=$(find "$WORK_DIR/standalone-win-x64" -name "MouseTerm.exe" -not -name "*setup*" -not -name "*install*" | head -1)
        if [[ -n "$signed_exe" ]]; then
            log "Rebuilding NSIS zip with signed executable..."
            local nsis_tmp="$WORK_DIR/nsis-repack"
            mkdir -p "$nsis_tmp"
            unzip -o "$win_nsis" -d "$nsis_tmp"
            # Replace the unsigned exe inside the extracted zip with the signed one
            local inner_exe
            inner_exe=$(find "$nsis_tmp" -name "MouseTerm.exe" -not -name "*setup*" -not -name "*install*" | head -1)
            if [[ -n "$inner_exe" ]]; then
                cp "$signed_exe" "$inner_exe"
                # Rebuild the zip
                (cd "$nsis_tmp" && zip -r "$release_dir/$FNAME_WIN_UPDATE" .)
            else
                warn "Could not find exe inside NSIS zip; copying original"
                cp "$win_nsis" "$release_dir/$FNAME_WIN_UPDATE"
            fi
            rm -rf "$nsis_tmp"
        else
            cp "$win_nsis" "$release_dir/$FNAME_WIN_UPDATE"
        fi
    fi

    # Windows installer
    [[ -f "$WORK_DIR/$FNAME_WIN_EXE" ]] && cp "$WORK_DIR/$FNAME_WIN_EXE" "$release_dir/"

    # Linux AppImage
    local linux_appimage
    linux_appimage=$(find "$WORK_DIR/standalone-linux-x64" -name "*.AppImage" -not -name "*.tar.gz" | head -1)
    [[ -n "$linux_appimage" ]] && cp "$linux_appimage" "$release_dir/$FNAME_LINUX_APPIMAGE"

    local linux_update
    linux_update=$(find "$WORK_DIR/standalone-linux-x64" -name "*.AppImage.tar.gz" | head -1)
    [[ -n "$linux_update" ]] && cp "$linux_update" "$release_dir/$FNAME_LINUX_UPDATE"

    local linux_deb
    linux_deb=$(find "$WORK_DIR/standalone-linux-x64" -name "*.deb" | head -1)
    [[ -n "$linux_deb" ]] && cp "$linux_deb" "$release_dir/$FNAME_LINUX_DEB"

    # Generate .sig files for update bundles using Tauri CLI
    for bundle in "$release_dir/$FNAME_MAC_ARM_UPDATE" \
                  "$release_dir/$FNAME_MAC_INTEL_UPDATE" \
                  "$release_dir/$FNAME_WIN_UPDATE" \
                  "$release_dir/$FNAME_LINUX_UPDATE"; do
        if [[ -f "$bundle" ]]; then
            log "Tauri-signing: $(basename "$bundle")"
            # Use tauri signer to sign the bundle
            TAURI_SIGNING_PRIVATE_KEY="$TAURI_SIGNING_PRIVATE_KEY" \
            TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" \
                npx --prefix "$REPO_ROOT/standalone" tauri signer sign \
                    --private-key "$TAURI_SIGNING_PRIVATE_KEY" \
                    "$bundle"
        fi
    done

    # Build latest.json manifest
    local base_url="https://github.com/$GITHUB_REPO/releases/download/v$version"
    local pub_date
    pub_date=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    # Read .sig file contents
    local sig_mac_arm="" sig_mac_intel="" sig_win="" sig_linux=""
    [[ -f "$release_dir/$FNAME_MAC_ARM_UPDATE.sig" ]] && sig_mac_arm=$(cat "$release_dir/$FNAME_MAC_ARM_UPDATE.sig")
    [[ -f "$release_dir/$FNAME_MAC_INTEL_UPDATE.sig" ]] && sig_mac_intel=$(cat "$release_dir/$FNAME_MAC_INTEL_UPDATE.sig")
    [[ -f "$release_dir/$FNAME_WIN_UPDATE.sig" ]] && sig_win=$(cat "$release_dir/$FNAME_WIN_UPDATE.sig")
    [[ -f "$release_dir/$FNAME_LINUX_UPDATE.sig" ]] && sig_linux=$(cat "$release_dir/$FNAME_LINUX_UPDATE.sig")

    cat > "$release_dir/$FNAME_MANIFEST" <<EOF
{
  "version": "$version",
  "notes": "See https://github.com/$GITHUB_REPO/releases/tag/v$version",
  "pub_date": "$pub_date",
  "platforms": {
    "darwin-aarch64": {
      "url": "$base_url/$FNAME_MAC_ARM_UPDATE",
      "signature": "$sig_mac_arm"
    },
    "darwin-x86_64": {
      "url": "$base_url/$FNAME_MAC_INTEL_UPDATE",
      "signature": "$sig_mac_intel"
    },
    "windows-x86_64": {
      "url": "$base_url/$FNAME_WIN_UPDATE",
      "signature": "$sig_win"
    },
    "linux-x86_64": {
      "url": "$base_url/$FNAME_LINUX_UPDATE",
      "signature": "$sig_linux"
    }
  }
}
EOF

    log "Update manifest written to $release_dir/$FNAME_MANIFEST"

    # Copy manifest to website for serving via mouseterm.com
    local website_manifest="$REPO_ROOT/website/public/standalone-latest.json"
    cp "$release_dir/$FNAME_MANIFEST" "$website_manifest"
    log "Manifest copied to $website_manifest — commit and deploy website to make it live"

    log "Update bundle signing complete"
}

# =============================================================================
# Create GitHub Release
# =============================================================================

create_release() {
    local version="$1"
    local tag="v$version"
    local release_dir="$WORK_DIR/release-assets"

    log "Creating GitHub Release $tag..."

    check_command gh "brew install gh && gh auth login"

    [[ -d "$release_dir" ]] || error "Release assets not found at $release_dir. Run signing steps first."

    # Extract changelog for this version
    local notes_file="$WORK_DIR/release-notes.md"
    if [[ -f "$REPO_ROOT/CHANGELOG.md" ]]; then
        # Extract section between [X.Y.Z] and the next ## heading
        sed -n "/^## \[$version\]/,/^## \[/p" "$REPO_ROOT/CHANGELOG.md" | head -n -1 > "$notes_file"
    fi

    if [[ ! -s "$notes_file" ]]; then
        echo "Release $tag" > "$notes_file"
    fi

    # Create or update the release
    if gh release view "$tag" --repo "$GITHUB_REPO" &>/dev/null; then
        log "Release $tag already exists — updating assets..."
        gh release upload "$tag" \
            --repo "$GITHUB_REPO" \
            --clobber \
            "$release_dir"/*
        gh release edit "$tag" \
            --repo "$GITHUB_REPO" \
            --title "$tag" \
            --notes-file "$notes_file"
    else
        gh release create "$tag" \
            --repo "$GITHUB_REPO" \
            --title "$tag" \
            --notes-file "$notes_file" \
            "$release_dir"/*
    fi

    rm -f "$notes_file"

    log "GitHub Release created: https://github.com/$GITHUB_REPO/releases/tag/$tag"
}

# =============================================================================
# Main Entry Point
# =============================================================================

usage() {
    cat <<EOF
Usage: $(basename "$0") COMMAND [OPTIONS]

Commands:
    all VERSION         Full pipeline: wait for CI, download, sign, release
    resume VERSION      Resume: download completed CI artifacts, sign, release
    sign-mac            Re-sign macOS app bundles
    notarize            Re-notarize macOS apps
    sign-win            Re-sign Windows executable
    sign-updates VER    Re-generate Tauri update signatures and manifest
    release VERSION     Re-create GitHub Release from existing signed assets

Environment Variables:
    APPLE_SIGN_PASS     Apple ID password (or app-specific password)
    EV_SIGN_PIN         PIV PIN for Windows code signing
    TAURI_SIGNING_PRIVATE_KEY           Tauri update signing key
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD  Tauri update key password (optional)

Examples:
    $(basename "$0") all 0.1.0       # Full pipeline
    $(basename "$0") resume 0.1.0    # Resume after CI completed
    $(basename "$0") sign-mac        # Re-sign macOS only
    $(basename "$0") release 0.1.0   # Re-create GitHub Release
EOF
}

main() {
    local cmd="${1:-}"

    if [[ -z "$cmd" ]]; then
        usage
        exit 1
    fi

    case "$cmd" in
        -h|--help|help)
            usage
            exit 0
            ;;
        all)
            local version="${2:-}"
            [[ -z "$version" ]] && error "Usage: $(basename "$0") all <version>"

            check_git_clean
            download_artifacts "$version"
            sign_macos
            notarize_macos
            sign_windows
            sign_updates "$version"
            create_release "$version"
            ;;
        resume)
            local version="${2:-}"
            [[ -z "$version" ]] && error "Usage: $(basename "$0") resume <version>"

            resume_download "$version"
            sign_macos
            notarize_macos
            sign_windows
            sign_updates "$version"
            create_release "$version"
            ;;
        sign-mac)
            sign_macos
            ;;
        notarize)
            notarize_macos
            ;;
        sign-win)
            sign_windows
            ;;
        sign-updates)
            local version="${2:-}"
            [[ -z "$version" ]] && error "Usage: $(basename "$0") sign-updates <version>"
            sign_updates "$version"
            ;;
        release)
            local version="${2:-}"
            [[ -z "$version" ]] && error "Usage: $(basename "$0") release <version>"
            create_release "$version"
            ;;
        *)
            error "Unknown command: $cmd. Use --help for usage."
            ;;
    esac

    log "Done!"
}

main "$@"
