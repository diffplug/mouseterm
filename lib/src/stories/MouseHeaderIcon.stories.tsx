import { useEffect } from 'react';
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
import {
  setMouseReporting,
  setOverride,
  type MouseTrackingMode,
  type OverrideState,
} from '../lib/mouse-selection';

const SESSION_ID = 'mouse-story';

const noopActions: PondActions = {
  onKill: () => {},
  onDetach: () => {},
  onAlertButton: () => 'noop',
  onToggleTodo: () => {},
  onSplitH: () => {},
  onSplitV: () => {},
  onZoom: () => {},
  onClickPanel: () => {},
  onStartRename: () => {},
  onFinishRename: () => {},
  onCancelRename: () => {},
};

function MouseIconStoryFrame({
  mouseReporting = 'none' as MouseTrackingMode,
  override = 'off' as OverrideState,
  title = 'build-server',
  mode = 'command' as PondMode,
  width = 360,
}: {
  mouseReporting?: MouseTrackingMode;
  override?: OverrideState;
  title?: string;
  mode?: PondMode;
  width?: number;
}) {
  useEffect(() => {
    setMouseReporting(SESSION_ID, mouseReporting);
    setOverride(SESSION_ID, override);
    return () => {
      setMouseReporting(SESSION_ID, 'none');
    };
  }, [mouseReporting, override]);

  const mockApi = { id: SESSION_ID, title } as unknown as Parameters<typeof TerminalPaneHeader>[0]['api'];

  return (
    <ModeContext.Provider value={mode}>
      <SelectedIdContext.Provider value={SESSION_ID}>
        <PondActionsContext.Provider value={noopActions}>
          <RenamingIdContext.Provider value={null}>
            <div style={{ width }}>
              <div className="bg-surface-alt" style={{ height: 26 }}>
                <TerminalPaneHeader
                  api={mockApi}
                  containerApi={{} as Parameters<typeof TerminalPaneHeader>[0]['containerApi']}
                  params={{}}
                  tabLocation={'header' as Parameters<typeof TerminalPaneHeader>[0]['tabLocation']}
                />
              </div>
            </div>
          </RenamingIdContext.Provider>
        </PondActionsContext.Provider>
      </SelectedIdContext.Provider>
    </ModeContext.Provider>
  );
}

const meta: Meta<typeof MouseIconStoryFrame> = {
  title: 'Components/MouseHeaderIcon',
  component: MouseIconStoryFrame,
  argTypes: {
    mouseReporting: { control: 'radio', options: ['none', 'x10', 'vt200', 'drag', 'any'] },
    override: { control: 'radio', options: ['off', 'temporary', 'permanent'] },
    mode: { control: 'radio', options: ['command', 'passthrough'] },
  },
};

export default meta;
type Story = StoryObj<typeof MouseIconStoryFrame>;

export const Hidden: Story = {
  args: { mouseReporting: 'none', override: 'off' },
};

export const ReportingOn: Story = {
  args: { mouseReporting: 'vt200', override: 'off' },
};

export const TemporaryOverride: Story = {
  args: { mouseReporting: 'vt200', override: 'temporary' },
};

export const PermanentOverride: Story = {
  args: { mouseReporting: 'any', override: 'permanent' },
};
