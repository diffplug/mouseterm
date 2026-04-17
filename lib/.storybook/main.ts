import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias as Record<string, string> ?? {}),
      '@tauri-apps/api/window': new URL('./tauri-window-mock.ts', import.meta.url).pathname,
    };
    return config;
  },
};

export default config;
