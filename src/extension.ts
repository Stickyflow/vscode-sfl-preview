// packages/vscode-sfl-preview/src/extension.ts
//
// Activation entry for the preview extension. Kept deliberately separate
// from vscode-sfl (language support): this extension owns the webview and
// the stickyflow.js render runtime, so installing/activating the language
// server doesn't pull in the diagram renderer, and vice versa.
import * as vscode from 'vscode';
import { SflPreviewPanel } from './panel';

// Heuristic, not real provenance: VS Code's onDidChangeTextDocument carries
// no signal for *who* made an edit, so this guesses from the SHAPE of the
// change instead. A single contentChanges entry starting at the very top of
// the document and replacing/inserting a large chunk of text doesn't look
// like a human's own keystrokes (even fast typing or a paste-in-place lands
// mid-document, at the cursor) — it looks like a whole file being rewritten
// from outside the editor, e.g. mcp-sfl's direct `fs.writeFile` (see the
// vault's mcp-sfl notes) landing as a silent reload once VS Code notices the
// file changed on disk. False positives exist and are expected: a `git
// checkout`, a format-on-save, or a human doing Ctrl+A -> paste all produce
// the same shape and would be flagged the same way. This is deliberately
// cheap (no IPC, no change to mcp-sfl itself) — see the vault note this
// shipped alongside for the two heavier, more precise alternatives that were
// considered and not built.
const EXTERNAL_REWRITE_MIN_CHARS = 40;

function looksLikeExternalRewrite(event: vscode.TextDocumentChangeEvent): boolean {
  if (event.contentChanges.length !== 1) return false;
  const [change] = event.contentChanges;
  const startsAtTop = change.range.start.line === 0 && change.range.start.character === 0;
  const isLargeReplace = change.rangeLength >= EXTERNAL_REWRITE_MIN_CHARS || change.text.length >= EXTERNAL_REWRITE_MIN_CHARS;
  return startsAtTop && isLargeReplace;
}

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
        SflPreviewPanel.updateIfOpen(event.document, looksLikeExternalRewrite(event));
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
