import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setPlatform } from "mouseterm-lib/lib/platform";
import { reconnectFromInit } from "mouseterm-lib/lib/reconnect";
import App from "mouseterm-lib/App";
import "mouseterm-lib/index.css";
import { TauriAdapter } from "./tauri-adapter";
import { UpdateBanner } from "./UpdateBanner";
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

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
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
