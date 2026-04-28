export type { MouseTermTheme, BundledOrigin, InstalledOrigin } from './types';
export { CONSUMED_VSCODE_KEYS, convertVscodeThemeColors, uiThemeToType } from './convert';
export { applyTheme, restoreActiveTheme } from './apply';
export { completeThemeVars, installVscodeThemeVarResolver } from './vscode-color-resolver';
export {
  getBundledThemes,
  getInstalledThemes,
  getAllThemes,
  getTheme,
  addInstalledTheme,
  removeInstalledTheme,
  getActiveThemeId,
  setActiveThemeId,
} from './store';
export { searchThemes, fetchExtensionThemes } from './openvsx';
export type { OpenVSXSearchResult, OpenVSXExtension } from './openvsx';
