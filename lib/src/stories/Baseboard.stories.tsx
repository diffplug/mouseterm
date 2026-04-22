import type { Meta, StoryObj } from '@storybook/react';
import { Baseboard } from '../components/Baseboard';
import type { DetachedItem } from '../components/Pond';
import { TODO_OFF, TODO_HARD } from '../lib/terminal-registry';

const makeItem = (id: string, title: string): DetachedItem => ({
  id,
  title,
  neighborId: null,
  direction: 'right',
  remainingPanelIds: [],
  restoreLayout: null,
  detachedLayoutSignature: '',
});

function withState(byId: Record<string, Record<string, unknown>>) {
  return {
    primedSessionState: {
      byId,
    },
  };
}

function BaseboardStory({ items, activeId = null }: { items: DetachedItem[]; activeId?: string | null }) {
  return (
    <div className="bg-surface" style={{ width: '100%' }}>
      <Baseboard
        items={items}
        activeId={activeId}
        onReattach={(item) => console.log('Reattach:', item.id)}
      />
    </div>
  );
}

const meta: Meta<typeof BaseboardStory> = {
  title: 'Components/Baseboard',
  component: BaseboardStory,
};

export default meta;
type Story = StoryObj<typeof BaseboardStory>;

export const OneRingingDoor: Story = {
  args: {
    items: [makeItem('p1', 'build-server')],
  },
  parameters: withState({
    p1: {
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    },
  }),
};

export const MixedDoorStates: Story = {
  args: {
    items: [
      makeItem('p1', 'dev-server'),
      makeItem('p2', 'test-runner'),
      makeItem('p3', 'logs'),
      makeItem('p4', 'notarization'),
    ],
    activeId: 'p3',
  },
  parameters: withState({
    p1: {
      status: 'NOTHING_TO_SHOW',

      todo: TODO_OFF,
    },
    p2: {
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    },
    p3: {
      status: 'ALERT_DISABLED',

      todo: TODO_HARD,
    },
    p4: {
      status: 'ALERT_RINGING',

      todo: TODO_HARD,
    },
  }),
};

export const OverflowWithRingingDoor: Story = {
  args: {
    items: [
      makeItem('p1', 'frontend-dev'),
      makeItem('p2', 'backend-api'),
      makeItem('p3', 'database-migrations'),
      makeItem('p4', 'test-runner'),
      makeItem('p5', 'log-aggregator'),
      makeItem('p6', 'build-pipeline'),
      makeItem('p7', 'monitoring'),
      makeItem('p8', 'linter'),
    ],
  },
  parameters: withState({
    p2: {
      status: 'NOTHING_TO_SHOW',

      todo: TODO_OFF,
    },
    p5: {
      status: 'ALERT_RINGING',

      todo: TODO_OFF,
    },
    p7: {
      status: 'ALERT_DISABLED',

      todo: TODO_HARD,
    },
  }),
  decorators: [
    (Story) => (
      <div style={{ width: 500 }}>
        <Story />
      </div>
    ),
  ],
};

export const ExtremeTitleWithBothIndicators: Story = {
  args: {
    items: [
      makeItem('p1', 'short'),
      makeItem('p2', 'my-extremely-long-running-background-process-with-a-very-descriptive-name'),
      makeItem('p3', 'another'),
    ],
  },
  parameters: withState({
    p2: {
      status: 'ALERT_RINGING',

      todo: TODO_HARD,
    },
  }),
  decorators: [
    (Story) => (
      <div style={{ width: 400 }}>
        <Story />
      </div>
    ),
  ],
};
