import type { Meta, StoryObj } from '@storybook/react';
import { KillConfirmCard } from '../components/KillConfirm';

function KillModal({ char = 'G', onCancel, shaking }: { char?: string; onCancel?: () => void; shaking?: boolean }) {
  return (
    <div className="relative bg-surface" style={{ width: 600, height: 400 }}>
      {/* Simulated terminal content behind the overlay */}
      <div className="p-4 font-mono text-xs text-terminal-fg">
        <div>user@mouseterm:~$ npm run build</div>
        <div className="text-muted">Building project...</div>
      </div>
      {/* Kill confirmation overlay — positioned over the pane */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
        <KillConfirmCard char={char} onCancel={onCancel} shaking={shaking} />
      </div>
    </div>
  );
}

const meta: Meta<typeof KillModal> = {
  title: 'Components/KillModal',
  component: KillModal,
  argTypes: {
    char: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof KillModal>;

export const Default: Story = {
  args: { char: 'G' },
};

export const RandomChar: Story = {
  args: { char: 'W' },
};

export const Shaking: Story = {
  args: { char: 'G', shaking: true },
};
