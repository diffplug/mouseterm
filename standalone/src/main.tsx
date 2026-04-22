import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { setPlatform } from "mouseterm-lib/lib/platform";
import { reconnectFromInit } from "mouseterm-lib/lib/reconnect";
import {
  applyTheme,
  getActiveThemeId,
  getAllThemes,
  getTheme,
  setActiveThemeId,
} from "mouseterm-lib/lib/themes";
import App from "mouseterm-lib/App";
import "mouseterm-lib/index.css";
import { TauriAdapter } from "./tauri-adapter";
import { UpdateBanner } from "./UpdateBanner";
import { AppBar, type ShellEntry } from "./AppBar";
import { startUpdateCheck, useUpdateState, dismissBanner, openChangelog } from "./updater";

// Initialize Tauri platform adapter before rendering
const platform = new TauriAdapter();
setPlatform(platform);

function restoreStandaloneTheme() {
  const allThemes = getAllThemes();
  const theme = getTheme(getActiveThemeId()) ?? allThemes[0];
  if (!theme) return;
  setActiveThemeId(theme.id);
  applyTheme(theme);
}

function ConnectedUpdateBanner() {
  const state = useUpdateState();
  return <UpdateBanner state={state} onDismiss={dismissBanner} onOpenChangelog={openChangelog} />;
}

// Await init() first to register event listeners before reconnecting
async function bootstrap() {
  await platform.init();
  const { initAlarmStateReceiver } = await import("mouseterm-lib/lib/terminal-registry");
  initAlarmStateReceiver();
  restoreStandaloneTheme();
  const result = await reconnectFromInit(platform);

  startUpdateCheck();

  // Fetch app bar data from Rust backend
  const detectedShells = await invoke<ShellEntry[]>("get_available_shells");
  const shells: ShellEntry[] = detectedShells.length > 0 ? detectedShells : [{ name: 'shell', path: '' }];

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppBar shells={shells} />
      <App
        initialPaneIds={result.paneIds}
        restoredLayout={result.layout}
        initialDetached={result.detached}
        baseboardNotice={<ConnectedUpdateBanner />}
      />
    </StrictMode>,
  );
}
bootstrap();
