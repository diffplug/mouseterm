import { useState, useEffect, useCallback, useRef } from "react";
import SiteHeader from "../components/SiteHeader";
import { PlaygroundToolbar } from "../components/PlaygroundToolbar";
import { ThemePicker } from "../components/ThemePicker";
import { TutorialShell } from "../lib/tutorial-shell";
import { TutorialDetector } from "../lib/tutorial-detection";

export { Playground as Component };

// Pane IDs — stable so we can assign scenarios before mount
const PANE_MAIN = "tut-main";
const PANE_NPM = "tut-npm";
const PANE_LS = "tut-ls";

type FakePtyAdapter = import("mouseterm-lib/lib/platform/fake-adapter").FakePtyAdapter;
type PondEvent = import("mouseterm-lib/components/Pond").PondEvent;

function Playground() {
  const [PondModule, setPondModule] = useState<{
    Pond: React.ComponentType<any>;
  } | null>(null);
  const adapterRef = useRef<FakePtyAdapter | null>(null);
  const shellRef = useRef<TutorialShell | null>(null);
  const detectorRef = useRef<TutorialDetector | null>(null);

  useEffect(() => {
    async function loadPond() {
      const platform = await import("mouseterm-lib/lib/platform");
      const registry = await import("mouseterm-lib/lib/terminal-registry");
      const pond = await import("mouseterm-lib/components/Pond");
      const scenarios = await import("mouseterm-lib/lib/platform/fake-scenarios");

      await import("mouseterm-lib/index.css");

      const adapter = platform.initPlatform("fake");
      registry.initAlarmStateReceiver();
      adapterRef.current = adapter;

      // Assign scenarios to panes before Pond mounts them
      adapter.setScenario(PANE_NPM, scenarios.SCENARIO_LONG_RUNNING);
      adapter.setScenario(PANE_LS, scenarios.SCENARIO_LS_OUTPUT);
      adapter.setScenario(PANE_MAIN, scenarios.SCENARIO_TUTORIAL_MOTD);

      // Wire up the tutorial shell
      const shell = new TutorialShell((data) => adapter.sendOutput(PANE_MAIN, data));
      shellRef.current = shell;
      adapter.setInputHandler(PANE_MAIN, (data) => shell.handleInput(data));

      // Wire up step detection
      const detector = new TutorialDetector(shell);
      detectorRef.current = detector;

      setPondModule({ Pond: pond.Pond });
    }
    loadPond();

    return () => {
      detectorRef.current?.dispose();
    };
  }, []);

  const handleApiReady = useCallback((api: any) => {
    api.addPanel({
      id: PANE_NPM,
      component: "terminal",
      tabComponent: "terminal",
      title: "npm install",
      position: { referencePanel: PANE_MAIN, direction: "right" },
    });
    api.addPanel({
      id: PANE_LS,
      component: "terminal",
      tabComponent: "terminal",
      title: "project",
      position: { referencePanel: PANE_NPM, direction: "below" },
    });

    const mainPanel = api.getPanel(PANE_MAIN);
    if (mainPanel) mainPanel.api.setActive();

    // Attach step detection to the API
    detectorRef.current?.attach(api);
  }, []);

  const handlePondEvent = useCallback((event: PondEvent) => {
    detectorRef.current?.handlePondEvent(event);
  }, []);

  return (
    <>
      <SiteHeader
        activePath="/playground"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      />

      <PlaygroundToolbar>
        <ThemePicker />
      </PlaygroundToolbar>

      <main className="fixed top-[100px] left-0 right-0 bottom-0">
        {PondModule ? (
          <PondModule.Pond
            initialPaneIds={[PANE_MAIN]}
            onApiReady={handleApiReady}
            onEvent={handlePondEvent}
          />
        ) : null}
      </main>
    </>
  );
}
