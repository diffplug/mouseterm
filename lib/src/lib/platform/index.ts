import type { PlatformAdapter } from './types';
import { VSCodeAdapter } from './vscode-adapter';
import { FakePtyAdapter } from './fake-adapter';

export type { PlatformAdapter } from './types';
export type { PtyInfo } from './types';
export { FakePtyAdapter } from './fake-adapter';
export type { FakeScenario } from './fake-adapter';
export {
  flattenScenario,
  makeAlertScenario,
  SCENARIO_SHELL_PROMPT,
  SCENARIO_LS_OUTPUT,
  SCENARIO_ANSI_COLORS,
  SCENARIO_LONG_RUNNING,
  SCENARIO_FAST_OUTPUT,
} from './fake-scenarios';

/**
 * True when running on macOS. Used to pick native keyboard conventions
 * (Cmd vs Ctrl for copy/paste, etc.). Computed once at module load.
 */
export const IS_MAC: boolean = (() => {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '';
  return /Mac|iPhone|iPad/i.test(platform);
})();

let adapter: PlatformAdapter | null = null;

/** Set an externally-created platform adapter (e.g. TauriAdapter from standalone). */
export function setPlatform(a: PlatformAdapter): void {
  adapter = a;
}

export function getPlatform(): PlatformAdapter {
  if (!adapter) throw new Error('Platform not initialized — call initPlatform() or setPlatform() first');
  return adapter;
}

export function initPlatform(override: 'fake'): FakePtyAdapter;
export function initPlatform(): PlatformAdapter;
export function initPlatform(override?: 'fake'): PlatformAdapter {
  if (adapter) return adapter as PlatformAdapter;
  if (override === 'fake') {
    adapter = new FakePtyAdapter();
    return adapter;
  }
  if (typeof acquireVsCodeApi === 'function') {
    adapter = new VSCodeAdapter();
  } else {
    adapter = new FakePtyAdapter();
  }
  return adapter;
}
