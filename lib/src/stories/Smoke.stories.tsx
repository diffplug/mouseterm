import type { Meta, StoryObj } from '@storybook/react';

function ThemeCheck() {
  return (
    <div className="p-8 bg-surface text-foreground min-h-screen">
      <h1 className="text-lg font-bold mb-2">Storybook Smoke Test</h1>
      <p className="text-muted mb-4">Theme tokens are working if you see colored squares below.</p>
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-accent" />
          <span className="text-sm text-muted">accent</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-surface-alt" />
          <span className="text-sm text-muted">surface-alt</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-surface-raised" />
          <span className="text-sm text-muted">surface-raised</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-error" />
          <span className="text-sm text-muted">error</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-tab-active-bg border border-border" />
          <span className="text-sm text-muted">tab-active</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-terminal-bg border border-border" />
          <span className="text-sm text-muted">terminal-bg</span>
        </div>
      </div>
    </div>
  );
}

const meta: Meta<typeof ThemeCheck> = {
  title: 'Smoke Test',
  component: ThemeCheck,
};

export default meta;

type Story = StoryObj<typeof ThemeCheck>;

export const Default: Story = {};
