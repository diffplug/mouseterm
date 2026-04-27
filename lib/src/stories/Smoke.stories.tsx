import type { Meta, StoryObj } from '@storybook/react';

function ThemeCheck() {
  return (
    <div className="p-8 bg-app text-on-app min-h-screen">
      <h1 className="text-lg font-bold mb-2">Storybook Smoke Test</h1>
      <p className="text-muted mb-4">Theme tokens are working if you see colored squares below.</p>
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-header-active-bg" />
          <span className="text-sm text-muted">header-active-bg</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-header-inactive-bg" />
          <span className="text-sm text-muted">header-inactive-bg</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded bg-app" />
          <span className="text-sm text-muted">surface</span>
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
