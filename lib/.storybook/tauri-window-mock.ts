const mockWindow = {
  isMaximized: () => Promise.resolve(false),
  onResized: (_callback: () => void) => Promise.resolve(() => {}),
  isFocused: () => Promise.resolve(true),
  onFocusChanged: (_callback: (event: { payload: boolean }) => void) =>
    Promise.resolve(() => {}),
  minimize: () => Promise.resolve(),
  toggleMaximize: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

export function getCurrentWindow() {
  return mockWindow;
}
