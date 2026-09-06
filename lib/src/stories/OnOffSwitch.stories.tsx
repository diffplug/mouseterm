import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { OnOffSwitch, UNDER_SWITCH_INDENT } from '../components/design';

function SwitchExample({ label, initialOn, disabled = false }: { label: string; initialOn: boolean; disabled?: boolean }) {
  const [on, setOn] = useState(initialOn);
  return <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
    <div className="flex items-center gap-3">
      <OnOffSwitch on={on} onEnable={() => setOn(true)} onDisable={() => setOn(false)} label={label} />
      <span>{label}</span>
    </div>
    <div className={`${UNDER_SWITCH_INDENT} text-xs text-muted`}>{disabled ? 'Disabled by the containing fieldset.' : 'Click, Space, or Enter to toggle.'}</div>
  </fieldset>;
}

function SwitchStates() {
  return <div className="space-y-4 bg-surface-raised p-5 font-mono text-sm text-foreground">
    <SwitchExample label="Watch commands" initialOn={false} />
    <SwitchExample label="Speak alerts" initialOn={true} />
    <SwitchExample label="Disabled off" initialOn={false} disabled />
    <SwitchExample label="Disabled on" initialOn={true} disabled />
  </div>;
}

const meta = {
  title: 'Components/OnOffSwitch',
  component: SwitchStates,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SwitchStates>;
export default meta;
type Story = StoryObj<typeof meta>;
export const States: Story = {};
