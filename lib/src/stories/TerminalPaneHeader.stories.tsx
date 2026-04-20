import type { Meta, StoryObj } from '@storybook/react';
import {
  TerminalPaneHeader,
  ModeContext,
  SelectedIdContext,
  PondActionsContext,
  RenamingIdContext,
  type PondMode,
  type PondActions,
} from '../components/Pond';
import { TODO_OFF, TODO_SOFT_FULL, TODO_HARD } from '../lib/terminal-registry';

const SESSION_ID = 'tab-story';

const noopActions: PondActions = {
  onKill: () => {},
  onDetach: () => {},
  onAlarmButton: () => 'noop',
  onToggleTodo: () => {},
  onSplitH: () => {},
  onSplitV: () => {},
  onZoom: () => {},
  onClickPanel: () => {},
  onStartRename: () => {},
  onFinishRename: () => {},
  onCancelRename: () => {},
};

function primedState(state: Record<string, unknown>) {
  return {
    primedSessionState: {
      byId: {
        [SESSION_ID]: state,
      },
    },
  };
}

function TabStory({
  title = 'my-terminal',
  mode = 'command' as PondMode,
  isSelected = true,
  isRenaming = false,
  width = 360,
  reducedMotion = false,
}: {
  title?: string;
  mode?: PondMode;
  isSelected?: boolean;
  isRenaming?: boolean;
  width?: number;
  reducedMotion?: boolean;
}) {
  const mockApi = { id: SESSION_ID, title } as any;

  return (
    <ModeContext.Provider value={mode}>
      <SelectedIdContext.Provider value={isSelected ? SESSION_ID : null}>
        <PondActionsContext.Provider value={noopActions}>
          <RenamingIdContext.Provider value={isRenaming ? SESSION_ID : null}>
            <div
              className={reducedMotion ? '[&_button]:!animate-none [&_*]:!transition-none' : undefined}
              style={{ width }}
            >
              <div className="bg-surface-alt" style={{ height: 26 }}>
                <TerminalPaneHeader api={mockApi} containerApi={{} as any} params={{}} tabLocation={'header' as any} />
              </div>
            </div>
          </RenamingIdContext.Provider>
        </PondActionsContext.Provider>
      </SelectedIdContext.Provider>
    </ModeContext.Provider>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openAlarmRightClickDialog() {
  await wait(100);
  const alarmButton = document.querySelector<HTMLButtonElement>(`[data-alarm-button-for="${SESSION_ID}"]`);
  if (!alarmButton) return;

  const rect = alarmButton.getBoundingClientRect();
  alarmButton.dispatchEvent(new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }));
  await wait(100);
}

async function clickSoftTodo() {
  await wait(100);
  const todoButton = document.querySelector<HTMLButtonElement>(`[data-session-todo-for="${SESSION_ID}"]`);
  todoButton?.click();
  await wait(100);
}

const meta: Meta<typeof TabStory> = {
  title: 'Components/TerminalPaneHeader',
  component: TabStory,
  argTypes: {
    mode: { control: 'radio', options: ['command', 'passthrough'] },
    isSelected: { control: 'boolean' },
    isRenaming: { control: 'boolean' },
    title: { control: 'text' },
    width: { control: 'number' },
    reducedMotion: { control: 'boolean' },
  },
  args: {
    title: 'build-server',
    mode: 'command',
    isSelected: true,
    isRenaming: false,
    width: 360,
    reducedMotion: false,
  },
};

export default meta;
type Story = StoryObj<typeof TabStory>;

export const AlarmDisabled: Story = {
  parameters: primedState({
    status: 'ALARM_DISABLED',

    todo: TODO_OFF,
  }),
};

export const AlarmEnabled: Story = {
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',

    todo: TODO_OFF,
  }),
};

export const AlarmMightBeBusy: Story = {
  parameters: primedState({
    status: 'MIGHT_BE_BUSY',

    todo: TODO_OFF,
  }),
};

export const AlarmBusy: Story = {
  parameters: primedState({
    status: 'BUSY',

    todo: TODO_OFF,
  }),
};

export const AlarmMightNeedAttention: Story = {
  parameters: primedState({
    status: 'MIGHT_NEED_ATTENTION',

    todo: TODO_OFF,
  }),
};

export const AlarmRinging: Story = {
  parameters: primedState({
    status: 'ALARM_RINGING',

    todo: TODO_OFF,
  }),
};

export const SoftTodo: Story = {
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',
    todo: TODO_SOFT_FULL,
  }),
};

export const AlarmRightClickDialog: Story = {
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',
    todo: TODO_OFF,
  }),
  play: openAlarmRightClickDialog,
};

export const SoftTodoPrompt: Story = {
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',
    todo: TODO_SOFT_FULL,
  }),
  play: clickSoftTodo,
};

export const TodoOnly: Story = {
  parameters: primedState({
    status: 'ALARM_DISABLED',
    todo: TODO_HARD,
  }),
};

export const TodoAndAlarmEnabled: Story = {
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',

    todo: TODO_HARD,
  }),
};

export const TodoAndAlarmRinging: Story = {
  parameters: primedState({
    status: 'ALARM_RINGING',

    todo: TODO_HARD,
  }),
};

export const CompactWidthWithAlarm: Story = {
  args: {
    width: 220,
  },
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',

    todo: TODO_OFF,
  }),
};

export const MinimalWidthWithAlarm: Story = {
  args: {
    width: 150,
  },
  parameters: primedState({
    status: 'NOTHING_TO_SHOW',

    todo: TODO_OFF,
  }),
};

export const LongTitleWithAlarmAndTodo: Story = {
  args: {
    title: 'my-extremely-long-running-background-process-with-a-very-descriptive-name',
    width: 360,
  },
  parameters: primedState({
    status: 'ALARM_RINGING',

    todo: TODO_HARD,
  }),
};

export const ReducedMotionRinging: Story = {
  args: {
    reducedMotion: true,
  },
  parameters: primedState({
    status: 'ALARM_RINGING',

    todo: TODO_OFF,
  }),
};
