import type { Meta, StoryObj } from '@storybook/react';
import { Baseboard } from '../components/Baseboard';
import type { DooredItem } from '../components/Pond';
const makeItem = (id: string, title: string): DooredItem => ({
  id,
  title,
  neighborId: null,
  direction: 'right',
  remainingPaneIds: [],
  layoutAtMinimize: null,
  layoutAtMinimizeSignature: '',
});

function withState(byId: Record<string, Record<string, unknown>>) {
  return {
    primedSessionState: {
      byId,
    },
  };
}

function BaseboardStory({ items }: { items: DooredItem[] }) {
  return (
    <div className="bg-app-bg" style={{ width: '100%' }}>
      <Baseboard
        items={items}
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

      todo: false,
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
  },
  parameters: withState({
    p1: {
      status: 'NOTHING_TO_SHOW',

      todo: false,
    },
    p2: {
      status: 'ALERT_RINGING',

      todo: false,
    },
    p3: {
      status: 'ALERT_DISABLED',

      todo: true,
    },
    p4: {
      status: 'ALERT_RINGING',

      todo: true,
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

      todo: false,
    },
    p5: {
      status: 'ALERT_RINGING',

      todo: false,
    },
    p7: {
      status: 'ALERT_DISABLED',

      todo: true,
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

      todo: true,
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
