import type { Meta, StoryObj } from '@storybook/react';
import { Pond } from '../components/Pond';
import {
  flattenScenario,
  SCENARIO_SHELL_PROMPT,
  SCENARIO_LS_OUTPUT,
  SCENARIO_ANSI_COLORS,
  SCENARIO_LONG_RUNNING,
} from '../lib/platform';
import { getActivitySnapshot, primeActivity, type ActivityState, TODO_OFF, TODO_HARD } from '../lib/terminal-registry';

const meta: Meta<typeof Pond> = {
  title: 'App/Pond',
  component: Pond,
};

export default meta;
type Story = StoryObj<typeof Pond>;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function primeByIndex(states: Partial<ActivityState>[]) {
  const ids = [...getActivitySnapshot().keys()];
  states.forEach((state, index) => {
    const id = ids[index];
    if (id) {
      primeActivity(id, state);
    }
  });
}

async function splitPanes() {
  await wait(200);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '"', bubbles: true }));
  await wait(50);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '%', bubbles: true }));
  await wait(50);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(100);
}

async function minimizeSelectedPane() {
  await wait(200);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
  await wait(150);
}

async function openAlertDialog() {
  await wait(250);
  const alertButton = document.querySelector<HTMLButtonElement>('[data-alert-button-for]');
  alertButton?.click();
  await wait(100);
}

export const Default: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
};

export const WithLsOutput: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
};

export const WithAnsiColors: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_ANSI_COLORS) } },
};

export const MultiPane: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
  play: splitPanes,
};

export const MultiPaneDark: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
  globals: { theme: 'GitHub Dark Default' },
  play: splitPanes,
};

export const MultiPaneLight: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
  globals: { theme: 'GitHub Light Default' },
  play: splitPanes,
};

export const WithDoors: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
  play: async () => {
    await splitPanes();
    await minimizeSelectedPane();
  },
};

export const MarketingDemo: Story = {
  parameters: { fakePty: { scenario: SCENARIO_LONG_RUNNING } },
  play: async () => {
    await wait(1_500);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '"', bubbles: true }));
    await wait(1_000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '%', bubbles: true }));
  },
};

export const AlertEnabledIdlePane: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'NOTHING_TO_SHOW',

          todo: TODO_OFF,
        },
      ],
    },
  },
};

export const AlertRingingPane: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALERT_RINGING',

          todo: TODO_OFF,
        },
      ],
    },
  },
};

export const AlertRingingDoor: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
  play: async () => {
    await minimizeSelectedPane();
    primeByIndex([
      {
        status: 'ALERT_RINGING',

        todo: TODO_OFF,
      },
    ]);
    await wait(100);
  },
};

export const AlertModalOpen: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALERT_RINGING',

          todo: TODO_OFF,
        },
      ],
    },
  },
  play: openAlertDialog,
};

export const TodoAfterDismiss: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALERT_RINGING',

          todo: TODO_HARD,
        },
      ],
    },
  },
};

export const MinimizedRingingSession: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
  play: async () => {
    await minimizeSelectedPane();
    primeByIndex([
      {
        status: 'ALERT_RINGING',

        todo: TODO_HARD,
      },
      {
        status: 'NOTHING_TO_SHOW',

        todo: TODO_OFF,
      },
    ]);
    await wait(100);
  },
};

export const MultipleRingingSessions: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
  play: async () => {
    await splitPanes();
    primeByIndex([
      {
        status: 'ALERT_RINGING',

        todo: TODO_OFF,
      },
      {
        status: 'ALERT_RINGING',

        todo: TODO_HARD,
      },
      {
        status: 'NOTHING_TO_SHOW',

        todo: TODO_OFF,
      },
    ]);
    await wait(100);
  },
};
