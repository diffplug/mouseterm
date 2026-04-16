import type { Meta, StoryObj } from '@storybook/react';

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
        <div className={`bg-surface-raised border border-error/30 px-6 py-4 rounded-lg text-center shadow-lg${shaking ? ' animate-shake-x' : ''}`}>
          <h2 className="text-base font-bold mb-3 text-foreground">Kill Session?</h2>
          <div className="bg-black py-2 px-6 rounded border border-border inline-block mb-2">
            <span className="text-xl font-bold text-error">{char}</span>
          </div>
          <div className="text-xs text-muted uppercase tracking-widest leading-relaxed">
            <div>[{char}] to confirm</div>
            <button type="button" onClick={onCancel} className="uppercase hover:text-foreground transition-colors cursor-pointer">[ESC] to cancel</button>
          </div>
        </div>
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
