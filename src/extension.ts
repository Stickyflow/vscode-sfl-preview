// packages/vscode-sfl-preview/src/extension.ts
//
// Activation entry for the preview extension. Kept deliberately separate
// from vscode-sfl (language support): this extension owns the webview and
// the stickyflow.js render runtime, so installing/activating the language
// server doesn't pull in the diagram renderer, and vice versa.
import * as vscode from 'vscode';
import { SflPreviewPanel } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  const openPreview = (column: vscode.ViewColumn) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'sfl') {
      void vscode.window.showWarningMessage('Open an .sfl file to preview it.');
      return;
    }
    SflPreviewPanel.createOrShow(context.extensionUri, editor.document, column);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('sfl.showPreview', () => openPreview(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('sfl.showPreviewToSide', () => openPreview(vscode.ViewColumn.Beside)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'sfl') {
        SflPreviewPanel.updateIfOpen(event.document);
      }
    }),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor.document.languageId === 'sfl') {
        SflPreviewPanel.syncSelectionIfOpen(event.textEditor);
      }
    }),
  );
}

export function deactivate(): void {}
