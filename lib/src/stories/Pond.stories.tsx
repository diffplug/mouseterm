import type { Meta, StoryObj } from '@storybook/react';
import { Pond } from '../components/Pond';
import {
  flattenScenario,
  SCENARIO_SHELL_PROMPT,
  SCENARIO_LS_OUTPUT,
  SCENARIO_ANSI_COLORS,
  SCENARIO_LONG_RUNNING,
} from '../lib/platform';
import { getSessionStateSnapshot, primeSessionState, type SessionUiState, TODO_OFF, TODO_HARD } from '../lib/terminal-registry';

const meta: Meta<typeof Pond> = {
  title: 'App/Pond',
  component: Pond,
};

export default meta;
type Story = StoryObj<typeof Pond>;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function primeByIndex(states: Partial<SessionUiState>[]) {
  const ids = [...getSessionStateSnapshot().keys()];
  states.forEach((state, index) => {
    const id = ids[index];
    if (id) {
      primeSessionState(id, state);
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

async function detachSelectedPane() {
  await wait(200);
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
  await wait(150);
}

async function openAlarmDialog() {
  await wait(250);
  const alarmButton = document.querySelector<HTMLButtonElement>('[data-alarm-button-for]');
  alarmButton?.click();
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

export const WithDetached: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_LS_OUTPUT) } },
  play: async () => {
    await splitPanes();
    await detachSelectedPane();
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

export const AlarmEnabledIdlePane: Story = {
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

export const AlarmRingingPane: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALARM_RINGING',

          todo: TODO_OFF,
        },
      ],
    },
  },
};

export const AlarmRingingDoor: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
  play: async () => {
    await detachSelectedPane();
    primeByIndex([
      {
        status: 'ALARM_RINGING',

        todo: TODO_OFF,
      },
    ]);
    await wait(100);
  },
};

export const AlarmModalOpen: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALARM_RINGING',

          todo: TODO_OFF,
        },
      ],
    },
  },
  play: openAlarmDialog,
};

export const TodoAfterDismiss: Story = {
  parameters: {
    fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) },
    primedSessionState: {
      byIndex: [
        {
          status: 'ALARM_RINGING',

          todo: TODO_HARD,
        },
      ],
    },
  },
};

export const DetachedRingingSession: Story = {
  parameters: { fakePty: { scenario: flattenScenario(SCENARIO_SHELL_PROMPT) } },
  play: async () => {
    await detachSelectedPane();
    primeByIndex([
      {
        status: 'ALARM_RINGING',

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
        status: 'ALARM_RINGING',

        todo: TODO_OFF,
      },
      {
        status: 'ALARM_RINGING',

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
