import type { Preview } from '@storybook/react';
import { useEffect } from 'react';
import { createElement } from 'react';
import '../src/theme.css';
import '../src/index.css';
import { initPlatform, type FakePtyAdapter, type FakeScenario } from '../src/lib/platform';
import {
  clearPrimedActivity,
  disposeAllSessions,
  getActivitySnapshot,
  primeActivity,
  type ActivityState,
} from '../src/lib/terminal-registry';
import { VSCODE_THEMES } from './themes';
import { cfg } from '../src/cfg';

// Initialize fake platform once at module scope
const fakePlatform = initPlatform('fake');

// Pin animations at T=0 for deterministic Chromatic snapshots
if (window?.navigator?.userAgent?.includes('Chromatic')) {
  cfg.marchingAnts.paused = true;
  cfg.alert.ringingPaused = true;
}

// Collect all CSS variable names across all themes for cleanup
const ALL_THEME_VARS = new Set(
  Object.values(VSCODE_THEMES).flatMap((theme) => Object.keys(theme)),
);

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
  },
  globalTypes: {
    theme: {
      description: 'VSCode theme simulation',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: Object.keys(VSCODE_THEMES),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'GitHub Dark Default',
  },
  decorators: [
    // Theme switcher: inject --vscode-* CSS variables
    (Story, context) => {
      const themeName = context.globals.theme as string;
      const theme = VSCODE_THEMES[themeName];
      const root = document.documentElement;
      // Clear all theme variables first to prevent stale values from previous theme
      for (const key of ALL_THEME_VARS) {
        root.style.removeProperty(key);
      }
      if (theme) {
        for (const [key, value] of Object.entries(theme)) {
          root.style.setProperty(key, value);
        }
      }
      // Force remount on theme change so terminals pick up new colors
      return createElement('div', { key: themeName, style: { display: 'flex', flexDirection: 'column' as const, height: '100vh' } }, createElement(Story));
    },
    // FakePty: set scenario from parameters, clean up on unmount
    (Story, context) => {
      const scenario = (context.parameters?.fakePty as { scenario?: FakeScenario })?.scenario;
      const primedSessionState = context.parameters?.primedSessionState as
        | {
            byId?: Record<string, Partial<ActivityState>>;
            byIndex?: Partial<ActivityState>[];
          }
        | undefined;
      const platform = fakePlatform as FakePtyAdapter;

      if (scenario) platform.setDefaultScenario(scenario);
      else platform.clearDefaultScenario();

      useEffect(() => {
        let raf2 = 0;

        const applyPrimedState = () => {
          clearPrimedActivity();

          for (const [id, state] of Object.entries(primedSessionState?.byId ?? {})) {
            primeActivity(id, state);
          }

          const sessionIds = [...getActivitySnapshot().keys()];
          primedSessionState?.byIndex?.forEach((state, index) => {
            const id = sessionIds[index];
            if (id) {
              primeActivity(id, state);
            }
          });
        };

        const raf1 = window.requestAnimationFrame(() => {
          raf2 = window.requestAnimationFrame(applyPrimedState);
        });

        return () => {
          window.cancelAnimationFrame(raf1);
          window.cancelAnimationFrame(raf2);
          clearPrimedActivity();
          platform.clearDefaultScenario();
          disposeAllSessions();
        };
      }, [platform, primedSessionState]);

      return createElement(Story);
    },
  ],
};

export default preview;
