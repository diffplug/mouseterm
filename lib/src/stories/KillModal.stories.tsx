import type { Meta, StoryObj } from '@storybook/react';

function KillModal({ char = 'G' }: { char?: string }) {
  return (
    <div className="relative bg-surface" style={{ width: 600, height: 400 }}>
      {/* Simulated terminal content behind the overlay */}
      <div className="p-4 font-mono text-[11px] text-terminal-fg">
        <div>user@mouseterm:~$ npm run build</div>
        <div className="text-muted">Building project...</div>
      </div>
      {/* Kill confirmation overlay — positioned over the pane */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded">
        <div className="bg-surface-raised border border-error/30 px-6 py-4 rounded-lg text-center shadow-lg">
          <h2 className="text-sm font-bold mb-2 text-foreground">Kill Session?</h2>
          <div className="bg-black py-2 px-6 rounded border border-border inline-block mb-2">
            <span className="text-2xl font-black text-error">{char}</span>
          </div>
          <div className="text-[9px] text-muted uppercase tracking-widest leading-relaxed">
            <div>[{char}] to confirm</div>
            <div>[ESC] to cancel</div>
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
