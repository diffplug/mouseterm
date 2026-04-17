import type { Meta, StoryObj } from '@storybook/react';
import { AppBar } from '../../../standalone/src/AppBar';

const DEFAULT_SHELLS = [
  { name: 'bash', path: '/bin/bash' },
  { name: 'zsh', path: '/bin/zsh' },
  { name: 'fish', path: '/usr/bin/fish' },
];

function AppBarStory(props: React.ComponentProps<typeof AppBar>) {
  return (
    <div style={{ width: '100%' }}>
      <AppBar {...props} />
    </div>
  );
}

const meta: Meta<typeof AppBarStory> = {
  title: 'Components/AppBar',
  component: AppBarStory,
  args: {
    projectDir: '/home/user/projects/mouseterm',
    homeDir: '/home/user',
    shells: DEFAULT_SHELLS,
  },
};

export default meta;
type Story = StoryObj<typeof AppBarStory>;

export const Default: Story = {};

export const HomeDirectory: Story = {
  args: {
    projectDir: '/home/user',
    homeDir: '/home/user',
  },
};

export const LongPath: Story = {
  args: {
    projectDir: '/home/user/projects/very-deep/nested/directory/structure/my-project',
    homeDir: '/home/user',
  },
};

export const SingleShell: Story = {
  args: {
    shells: [{ name: 'bash', path: '/bin/bash' }],
  },
};

export const ManyShells: Story = {
  args: {
    shells: [
      { name: 'bash', path: '/bin/bash' },
      { name: 'zsh', path: '/bin/zsh' },
      { name: 'fish', path: '/usr/bin/fish' },
      { name: 'sh', path: '/bin/sh' },
      { name: 'nu', path: '/usr/bin/nu' },
    ],
  },
};

export const AbsolutePathOutsideHome: Story = {
  args: {
    projectDir: '/var/www/my-site',
    homeDir: '/home/user',
  },
};
