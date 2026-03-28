#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="standalone/src-tauri/target/release"

# Build
pnpm run build:standalone

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
