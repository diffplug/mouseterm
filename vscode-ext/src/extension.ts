import * as vscode from 'vscode';
import * as path from 'path';
import * as ptyManager from './pty-manager';
import { MouseTermViewProvider } from './webview-view-provider';
import { attachRouter, flushAllSessions, getAlarmStates } from './message-router';
import { getWebviewHtml } from './webview-html';
import { log } from './log';
import { getSavedSessionState, isPersistedSession, mergeAlarmStates, refreshSavedSessionStateFromPtys, saveSessionState } from './session-state';

let extensionContext: vscode.ExtensionContext | null = null;

/**
 * Wire up a WebviewPanel with session state, routing, and alarm persistence.
 *
 * @param savedState Per-panel state. For `deserializeWebviewPanel` this is the
 *   state VS Code preserved from the panel's `vscode.setState()`; for a fresh
 *   panel opened via `mouseterm.open` this is `undefined`.
 */
function setupPanel(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel,
  savedState?: unknown,
) {
  const mediaPath = path.join(context.extensionPath, 'media');

  // Ensure webview options are set — critical for deserialized panels where
  // VS Code recreates the panel shell but we must configure the webview.
  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.file(mediaPath)],
  };

  // Merge in current alarm states so the webview starts with correct alarm data
  const initialState = savedState
    ? mergeAlarmStates(savedState, getAlarmStates())
    : undefined;

  panel.iconPath = {
    light: vscode.Uri.file(path.join(context.extensionPath, 'icon-tiny-light.png')),
    dark: vscode.Uri.file(path.join(context.extensionPath, 'icon-tiny-dark.png')),
  };
  panel.webview.html = getWebviewHtml(panel.webview, mediaPath, initialState);

  const router = attachRouter(panel.webview, {
    reconnect: !!savedState,
    killOnDispose: true,
    savedSession: isPersistedSession(initialState) ? initialState : null,
    // Panels persist via vscode.setState() (per-panel, managed by VS Code).
    // Don't write to workspaceState — that's for the WebviewView only.
  });
  panel.onDidDispose(() => router.dispose());
}

export function activate(context: vscode.ExtensionContext) {
  log.init();
  extensionContext = context;
  ptyManager.setExtensionPath(context.extensionPath);

  const provider = new MouseTermViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mouseterm.view', provider),
    vscode.window.registerWebviewPanelSerializer('mouseterm', {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        setupPanel(context, panel, state);
      },
    }),
    vscode.commands.registerCommand('mouseterm.focus', () => {
      vscode.commands.executeCommand('mouseterm.view.focus');
    }),
    vscode.commands.registerCommand('mouseterm.open', () => {
      const mediaPath = path.join(context.extensionPath, 'media');
      const panel = vscode.window.createWebviewPanel(
        'mouseterm',
        'MouseTerm',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(mediaPath)],
        },
      );
      setupPanel(context, panel);
    }),
  );
}

export async function deactivate() {
  if (!extensionContext) return;
  log.info('[deactivate] starting');
  // Save session state while PTYs are still alive — CWD and scrollback
  // queries need live processes. Must happen before gracefulKillAll.
  log.info('[deactivate] flushing sessions from webview');
  await flushAllSessions(1000);
  log.info('[deactivate] refreshing session state from live PTYs');
  await refreshSavedSessionStateFromPtys(extensionContext, getAlarmStates());
  log.info('[deactivate] graceful kill');
  // Now give PTYs time to print resume commands (SIGTERM instead of SIGHUP)
  await ptyManager.gracefulKillAll(2000);
  // Force kill anything still alive and clean up
  ptyManager.killAll();
  log.info('[deactivate] done');
}
