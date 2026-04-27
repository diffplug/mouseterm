export type { MouseTermTheme, BundledOrigin, InstalledOrigin } from './types';
export { CONSUMED_VSCODE_KEYS, convertVscodeThemeColors, uiThemeToType } from './convert';
export { applyTheme, getAppliedThemeSnapshot, restoreActiveTheme } from './apply';
export type { AppliedThemeSnapshot } from './apply';
export { pickDynamicPalette } from './dynamic-palette';
export type { DynamicPaletteSnapshot, DynamicDoorPick, DynamicFocusRingPick } from './dynamic-palette';
export { captureThemeDiagnostics } from './diagnostics';
export type {
  ThemeDiagnosticSnapshot,
  ThemeMetadataSnapshot,
  VisibleVscodeVarSnapshot,
  SemanticTokenSnapshot,
  TerminalColorSnapshot,
} from './diagnostics';
export {
  completeThemeVars,
  getMaterializedVscodeThemeVars,
  inferVscodeThemeKind,
  installVscodeThemeVarResolver,
  traceThemeVars,
} from './vscode-color-resolver';
export type {
  VscodeThemeKind,
  VscodeThemeResolverTrace,
  VscodeThemeVarTrace,
  VscodeThemeVarTraceOrigin,
} from './vscode-color-resolver';
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
