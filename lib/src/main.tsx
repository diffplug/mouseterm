import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initPlatform } from "./lib/platform";
import { reconnectFromInit } from "./lib/reconnect";
import { initAlertStateReceiver } from "./lib/terminal-registry";
import App from "./App";
import "./index.css";

const platform = initPlatform();

// Wire up alert state before reconnect so state messages are handled
initAlertStateReceiver();

// Request PTY list before rendering so Pond can restore existing sessions.
// On non-VSCode platforms (or first launch), this resolves immediately with no IDs.
reconnectFromInit(platform).then((result) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initialPaneIds={result.paneIds} restoredLayout={result.layout} initialDetached={result.detached} />
    </StrictMode>,
  );
});

platform.init();
