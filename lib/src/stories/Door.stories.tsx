import type { Meta, StoryObj } from '@storybook/react';
import { Door } from '../components/Door';
import { TODO_OFF, TODO_HARD } from '../lib/terminal-registry';

function DoorStory({
  width = 260,
  reducedMotion = false,
  ...props
}: React.ComponentProps<typeof Door> & {
  width?: number;
  reducedMotion?: boolean;
}) {
  return (
    <div
      className={reducedMotion ? '[&_button]:!animate-none [&_*]:!transition-none' : undefined}
      style={{ width }}
    >
      <div className="bg-surface-alt flex h-16 items-end border-t border-border px-4">
        <Door {...props} />
      </div>
    </div>
  );
}

const meta: Meta<typeof DoorStory> = {
  title: 'Components/Door',
  component: DoorStory,
  args: {
    title: 'build-server',
    isActive: false,
    status: 'ALERT_DISABLED',
    todo: TODO_OFF,
    width: 260,
    reducedMotion: false,
  },
  argTypes: {
    title: { control: 'text' },
    isActive: { control: 'boolean' },
    status: { control: 'radio', options: ['ALERT_DISABLED', 'NOTHING_TO_SHOW', 'MIGHT_BE_BUSY', 'BUSY', 'MIGHT_NEED_ATTENTION', 'ALERT_RINGING'] },
    todo: { control: 'number' },
    width: { control: 'number' },
    reducedMotion: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<typeof DoorStory>;

export const AlertDisabled: Story = {};
export const AlertEnabled: Story = { args: { status: 'NOTHING_TO_SHOW' } };
export const AlertMightBeBusy: Story = { args: { status: 'MIGHT_BE_BUSY' } };
export const AlertBusy: Story = { args: { status: 'BUSY' } };
export const AlertMightNeedAttention: Story = { args: { status: 'MIGHT_NEED_ATTENTION' } };
export const AlertRinging: Story = { args: { status: 'ALERT_RINGING' } };
export const TodoOnly: Story = { args: { todo: TODO_HARD } };
export const TodoAndAlertEnabled: Story = { args: { todo: TODO_HARD, status: 'NOTHING_TO_SHOW' } };
export const TodoAndAlertRinging: Story = { args: { todo: TODO_HARD, status: 'ALERT_RINGING' } };
export const LongTitleWithIndicators: Story = {
  args: {
    title: 'my-extremely-long-running-background-process-with-a-very-descriptive-name',
    todo: TODO_HARD,
    status: 'NOTHING_TO_SHOW',
  },
};
export const ActiveDoorRinging: Story = { args: { isActive: true, status: 'ALERT_RINGING' } };
