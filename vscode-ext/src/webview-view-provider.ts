import * as vscode from 'vscode';
import * as path from 'path';
import { attachRouter, getAlarmStates } from './message-router';
import { getWebviewHtml } from './webview-html';
import { getSavedSessionState, saveSessionState, mergeAlarmStates } from './session-state';
import type { ExtensionMessage } from './message-types';

export class MouseTermViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private routerDisposable: vscode.Disposable | undefined;
  private description: string | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  postMessage(msg: ExtensionMessage): Thenable<boolean> {
    return this.view?.webview.postMessage(msg) ?? Promise.resolve(false);
  }

  setDescription(text: string | undefined): void {
    this.description = text;
    if (this.view) this.view.description = text;
  }

  resolveWebviewView(
    view: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = view;
    if (this.description !== undefined) view.description = this.description;

    const mediaPath = path.join(this.context.extensionPath, 'media');

    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(mediaPath)],
    };

    const savedSession = getSavedSessionState(this.context);
    view.webview.html = getWebviewHtml(view.webview, mediaPath, savedSession);

    this.routerDisposable?.dispose();
    this.routerDisposable = attachRouter(view.webview, {
      reconnect: true,
      savedSession,
      onSaveState: (state) => {
        void saveSessionState(this.context, mergeAlarmStates(state, getAlarmStates()));
      },
    });

    view.onDidDispose(() => {
      this.routerDisposable?.dispose();
      this.routerDisposable = undefined;
      this.view = undefined;
    });
  }

  focus(): void {
    this.view?.show?.(true);
  }
}
