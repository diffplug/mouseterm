import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { setPlatform } from "mouseterm-lib/lib/platform";
import { resumeOrRestore } from "mouseterm-lib/lib/reconnect";
import { restoreActiveTheme } from "mouseterm-lib/lib/themes";
import App from "mouseterm-lib/App";
import "mouseterm-lib/index.css";
import { TauriAdapter } from "./tauri-adapter";
import { UpdateBanner } from "./UpdateBanner";
import { UpdateDebugDialog } from "./UpdateDebugDialog";
import { AppBar, type ShellEntry } from "./AppBar";
import {
  startUpdateCheck,
  useUpdateState,
  dismissBanner,
  openChangelog,
  buildDebugReport,
  type DebugReport,
} from "./updater";

// Initialize Tauri platform adapter before rendering
const platform = new TauriAdapter();
setPlatform(platform);

function ConnectedUpdateBanner() {
  const state = useUpdateState();
  const [debugOpen, setDebugOpen] = useState(false);
  const [report, setReport] = useState<DebugReport | null>(null);

  const failureVersion = state.status === 'post-update-failure' ? state.version : '';
  const failureError = state.status === 'post-update-failure' ? (state.error ?? '') : '';

  // Lazily fetch the debug report the first time the user opens the dialog.
  useEffect(() => {
    if (!debugOpen || report) return;
    let cancelled = false;
    buildDebugReport(failureError, failureVersion).then((r) => {
      if (!cancelled) setReport(r);
    });
    return () => {
      cancelled = true;
    };
  }, [debugOpen, report, failureError, failureVersion]);

  return (
    <>
      <UpdateBanner
        state={state}
        onDismiss={dismissBanner}
        onOpenChangelog={openChangelog}
        onOpenDebug={() => setDebugOpen(true)}
      />
      <UpdateDebugDialog
        open={debugOpen}
        onClose={() => setDebugOpen(false)}
        report={report}
        targetVersion={failureVersion}
        errorPreview={failureError}
      />
    </>
  );
}

// Await init() first to register event listeners before reconnecting
async function bootstrap() {
  await platform.init();
  const { initAlertStateReceiver } = await import("mouseterm-lib/lib/terminal-registry");
  initAlertStateReceiver();
  restoreActiveTheme();
  const result = await resumeOrRestore(platform);

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
        initialDoors={result.doors}
        baseboardNotice={<ConnectedUpdateBanner />}
      />
    </StrictMode>,
  );
}
bootstrap();
