#!/usr/bin/env bash
#
# Builds the standalone app and either launches or installs it.
#
# Usage:
#   pnpm dogfood:standalone              Build and launch from the build directory.
#   pnpm dogfood:standalone --install    Build and copy into the system install location.
#
# Launch mode (default):
#   Runs the built binary directly from target/release. Works on Windows, macOS,
#   and Linux with no prior setup. This is the fastest way to test changes.
#
# Install mode (--install):
#   Copies the built files over the system-installed copy, bypassing the slow
#   bundling/installer step. Requires a one-time install via the NSIS installer
#   so that registry entries, shortcuts, etc. are in place. Currently Windows only.
#
set -euo pipefail

# Skip past "--" that pnpm injects when forwarding arguments
[[ "${1:-}" == "--" ]] && shift

RELEASE_DIR="standalone/src-tauri/target/release"

if [[ "${1:-}" == "--install" ]]; then
  # Full build with bundling, but disable updater artifact signing
  pnpm --filter mouseterm-standalone tauri build \
    -c '{"bundle":{"createUpdaterArtifacts":false}}'
else
  # Fast build: skip bundling entirely since we just need the exe
  pnpm --filter mouseterm-standalone tauri build --no-bundle
fi

if [[ "${1:-}" == "--install" ]]; then
  # --- Install mode ---
  # Platform-specific: copy built files to system install location
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      INSTALL_DIR="$LOCALAPPDATA/MouseTerm"
      if [[ ! -f "$INSTALL_DIR/mouseterm.exe" ]]; then
        echo "MouseTerm is not installed yet."
        echo "Run the installer once first:"
        echo "  $RELEASE_DIR/bundle/nsis/MouseTerm_*-setup.exe"
        echo ""
        echo "After that, 'dogfood:standalone --install' will work from then on."
        exit 1
      fi
      cp "$RELEASE_DIR/mouseterm.exe" "$INSTALL_DIR/"
      cp "$RELEASE_DIR/node.exe" "$INSTALL_DIR/"
      cp -r "$RELEASE_DIR/_up_/" "$INSTALL_DIR/_up_/"
      echo "✦ Installed to $INSTALL_DIR"
      ;;
    *)
      echo "--install is not yet implemented for this platform."
      exit 1
      ;;
  esac
else
  # --- Launch mode (default) ---
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      "$RELEASE_DIR/mouseterm.exe" ;;
    Darwin)
      open "$RELEASE_DIR/bundle/macos/MouseTerm.app" ;;
    Linux)
      "$RELEASE_DIR/mouseterm" ;;
    *)
      echo "Unsupported platform: $(uname -s)"
      exit 1 ;;
  esac
fi
