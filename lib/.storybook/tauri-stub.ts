// Stubs for @tauri-apps/* imports during Storybook builds. The real packages
// only run inside a Tauri webview; in Storybook we just need the named exports
// to evaluate without crashing. One shared file backs aliases for several
// Tauri packages — each import resolves the names it needs.

export const check = async () => null;
export const getVersion = async () => '0.0.0-storybook';
export const open = async (url: string) => {
  console.log('[storybook] tauri shell open:', url);
};
export const invoke = async (cmd: string) => {
  console.log('[storybook] tauri invoke:', cmd);
  return '';
};

export type Update = unknown;
