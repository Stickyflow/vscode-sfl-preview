// One webview panel per previewed .sfl document (keyed by URI, not a single
// global panel) — opening preview for two different files gives two
// independent panels; re-invoking preview on the same file just reveals its
// existing panel, same as VS Code's built-in Markdown preview.
import * as vscode from 'vscode';
import { getWebviewHtml } from './getWebviewHtml';

const VIEW_TYPE = 'sfl.preview';
const UPDATE_DEBOUNCE_MS = 150;

export class SflPreviewPanel {
  private static readonly panels = new Map<string, SflPreviewPanel>();

  static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument, column: vscode.ViewColumn): void {
    const key = document.uri.toString();
    const existing = SflPreviewPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      `Preview: ${baseName(document.fileName)}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    SflPreviewPanel.panels.set(key, new SflPreviewPanel(panel, extensionUri, document));
  }

  static updateIfOpen(document: vscode.TextDocument): void {
    SflPreviewPanel.panels.get(document.uri.toString())?.scheduleUpdate(document.getText());
  }

  private readonly key: string;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    document: vscode.TextDocument,
  ) {
    this.key = document.uri.toString();
    this.panel.webview.html = getWebviewHtml(this.panel.webview, extensionUri, document.getText());
    this.panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'sfl/edit' && typeof message.source === 'string') {
        void applyEditToDocument(document.uri, message.source);
      }
    });
    this.panel.onDidDispose(() => {
      this.disposed = true;
      clearTimeout(this.updateTimer);
      SflPreviewPanel.panels.delete(this.key);
    });
  }

  private scheduleUpdate(source: string): void {
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => {
      if (this.disposed) return;
      void this.panel.webview.postMessage({ type: 'sfl/update', source });
    }, UPDATE_DEBOUNCE_MS);
  }
}

function baseName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

// Writes an edit-mode change (drag-to-move/resize, text edit, link
// reconnect, delete — already turned into full new SFL text by the
// webview's `applyXChange` patchers) back into the real document as a
// standard WorkspaceEdit, so it lands on the normal undo stack like any
// other edit. Whole-document replace is deliberate, not a diff: the
// patchers already preserve everything untouched (comments, formatting,
// unrelated blocks — see stickyflow.js's patchSfl.ts), so there's no
// narrower range to compute that would be worth the complexity.
async function applyEditToDocument(uri: vscode.Uri, newSource: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  if (document.getText() === newSource) return;
  const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, fullRange, newSource);
  await vscode.workspace.applyEdit(edit);
}
