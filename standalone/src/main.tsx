import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { setPlatform } from "mouseterm-lib/lib/platform";
import { reconnectFromInit } from "mouseterm-lib/lib/reconnect";
import App from "mouseterm-lib/App";
import "mouseterm-lib/index.css";
import { TauriAdapter } from "./tauri-adapter";
import { UpdateBanner } from "./UpdateBanner";
import { AppBar, type ShellEntry } from "./AppBar";
import { startUpdateCheck, useUpdateState, dismissBanner, openChangelog } from "./updater";

// Initialize Tauri platform adapter before rendering
const platform = new TauriAdapter();
setPlatform(platform);

function ConnectedUpdateBanner() {
  const state = useUpdateState();
  return <UpdateBanner state={state} onDismiss={dismissBanner} onOpenChangelog={openChangelog} />;
}

// Await init() first to register event listeners before reconnecting
async function bootstrap() {
  await platform.init();
  const { initAlarmStateReceiver } = await import("mouseterm-lib/lib/terminal-registry");
  initAlarmStateReceiver();
  const result = await reconnectFromInit(platform);

  startUpdateCheck();

  // Fetch app bar data from Rust backend
  const [homeDir, defaultShell] = await Promise.all([
    invoke<string>("get_project_dir"),
    invoke<ShellEntry>("get_default_shell"),
  ]);
  const projectDir = homeDir; // For now, project dir defaults to home
  const shells: ShellEntry[] = [defaultShell];

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppBar projectDir={projectDir} homeDir={homeDir} shells={shells} />
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
