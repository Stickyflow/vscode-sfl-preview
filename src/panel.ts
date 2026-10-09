// One webview panel per previewed .sfl document (keyed by URI, not a single
// global panel) — opening preview for two different files gives two
// independent panels; re-invoking preview on the same file just reveals its
// existing panel, same as VS Code's built-in Markdown preview.
import * as path from 'node:path';
import * as vscode from 'vscode';
import { getWebviewHtml } from './getWebviewHtml';
import { sflToMarkdown } from './markdownExport';
import { findOwnerRange, findEnclosingOwnerId } from './sflOwnerBlocks';

export const VIEW_TYPE = 'sfl.preview';
/** Internal command (not in the palette): `(uri, source | null)`, see showTransientIfOpen. */
export const TRANSIENT_SOURCE_COMMAND = 'sfl.preview.showTransientSource';
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
    // Same logo vscode-sfl uses for the .sfl file icon (icons/sfl-icon-theme.json,
    // copied in here — see icons/sfl-file.svg) — without this the tab falls back
    // to VS Code's generic webview icon instead of matching the file it previews.
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'icons', 'sfl-file.svg');
    SflPreviewPanel.panels.set(key, new SflPreviewPanel(panel, extensionUri, document));
  }

  static updateIfOpen(document: vscode.TextDocument, likelyExternalRewrite = false): void {
    SflPreviewPanel.panels.get(document.uri.toString())?.scheduleUpdate(document.getText(), likelyExternalRewrite);
  }

  /** Shows `source` in the document's preview without editing the document,
   *  or with `null` goes back to the document's own text. vscode-sfl's style
   *  template picker calls this (through TRANSIENT_SOURCE_COMMAND) for every
   *  template the user highlights. A no-op without an open panel. */
  static showTransientIfOpen(uri: vscode.Uri, source: string | null): void {
    SflPreviewPanel.panels.get(uri.toString())?.postTransient(source);
  }

  /** Called on every text-editor selection change (see extension.ts) so the
   *  preview's canvas selection can follow the cursor — the editor-to-canvas
   *  half of selection sync. A no-op for any document without an open panel. */
  static syncSelectionIfOpen(editor: vscode.TextEditor): void {
    SflPreviewPanel.panels.get(editor.document.uri.toString())?.selectFromEditor(editor);
  }

  private readonly key: string;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  // OR-accumulated across every onDidChangeTextDocument event coalesced into
  // the pending debounce window — a burst of several small edits plus one
  // big external one within the same 150ms should still flag the whole
  // batch as "external", not silently drop the flag if the burst happens to
  // end on a small edit. Reset once the batch is actually sent.
  private pendingLikelyExternal = false;
  private disposed = false;
  // The last owner id either pushed to the webview (editor -> canvas) or
  // received from it (canvas -> editor). Selection sync is naturally
  // bidirectional and each direction's own action re-triggers the event the
  // OTHER direction listens for (selecting in the canvas moves the editor's
  // cursor, which fires onDidChangeTextEditorSelection right back) — tracking
  // just this one id and skipping a sync that would just restate it is
  // enough to break that loop without any separate "programmatic" flag.
  private lastSyncedOwnerId: string | null = null;

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
      } else if (message?.type === 'sfl/reveal') {
        this.revealInEditor(typeof message.id === 'string' ? message.id : null);
      } else if (
        message?.type === 'sfl/sceneDiff' &&
        Array.isArray(message.added) && Array.isArray(message.removed) && Array.isArray(message.changed)
      ) {
        reportSceneDiff(message.added.length, message.removed.length, message.changed.length);
      } else if (message?.type === 'sfl/warn' && typeof message.message === 'string') {
        // A canvas-side mutation (currently "+ Entity"/"+ Link") no-op'd
        // instead of applying — surfaced here rather than left silent, so
        // "nothing visibly happened" always comes with a reason.
        void vscode.window.showWarningMessage(`SFL Preview: ${message.message}`);
      } else if (
        message?.type === 'sfl/export' &&
        isExportFormat(message.format) &&
        typeof message.data === 'string'
      ) {
        void exportDiagram(document.uri, message.format, message.data);
      } else if (message?.type === 'sfl/pickTemplate') {
        // The template logic lives in vscode-sfl (a dependency of this
        // extension); its command shows the picker and writes the edit.
        void vscode.commands.executeCommand('sfl.applyStyleTemplate', document.uri);
      }
    });
    this.panel.onDidDispose(() => {
      this.disposed = true;
      clearTimeout(this.updateTimer);
      SflPreviewPanel.panels.delete(this.key);
    });
  }

  private scheduleUpdate(source: string, likelyExternalRewrite: boolean): void {
    clearTimeout(this.updateTimer);
    this.pendingLikelyExternal = this.pendingLikelyExternal || likelyExternalRewrite;
    this.updateTimer = setTimeout(() => {
      if (this.disposed) return;
      void this.panel.webview.postMessage({ type: 'sfl/update', source, likelyExternalRewrite: this.pendingLikelyExternal });
      this.pendingLikelyExternal = false;
    }, UPDATE_DEBOUNCE_MS);
  }

  // Not debounced like scheduleUpdate: the picker sends one per highlighted
  // item, and a late "back to the document" would undo a newer preview.
  private postTransient(source: string | null): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage({ type: 'sfl/transient', source });
  }

  // Canvas -> editor: a shape/link was clicked (or selection cleared) in the
  // webview. Moves the visible editor's own selection/scroll to match —
  // deliberately not `vscode.window.showTextDocument`, so clicking around the
  // diagram never steals focus away from the canvas.
  private revealInEditor(id: string | null): void {
    if (id === this.lastSyncedOwnerId) return;
    this.lastSyncedOwnerId = id;
    if (!id) return;
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === this.key);
    if (!editor) return;
    const range = findOwnerRange(editor.document.getText().split('\n'), id);
    if (!range) return;
    const start = new vscode.Position(range.start, 0);
    const end = new vscode.Position(range.start, editor.document.lineAt(range.start).text.length);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  // Editor -> canvas: the cursor moved to a new line. Finds the innermost
  // owner block enclosing it and tells the webview to select it (or clear
  // selection, past the last owner block).
  private selectFromEditor(editor: vscode.TextEditor): void {
    const id = findEnclosingOwnerId(editor.document.getText().split('\n'), editor.selection.active.line);
    if (id === this.lastSyncedOwnerId) return;
    this.lastSyncedOwnerId = id;
    void this.panel.webview.postMessage({ type: 'sfl/select', id });
  }
}

function baseName(fileName: string): string {
  return fileName.split(/[\\/]/).pop() ?? fileName;
}

// Plain-text, unambiguous confirmation that change-highlighting's diff
// engine actually ran, independent of whether the ring itself is visible on
// screen (it can be obscured by, or hard to tell apart from, the separate
// always-on selection overlay — see the vault note this shipped alongside).
// A transient status-bar message rather than an information toast: this can
// fire on every debounced document edit while typing, and a toast would
// stack up or steal focus at that rate.
function reportSceneDiff(added: number, removed: number, changed: number): void {
  if (added === 0 && removed === 0 && changed === 0) return; // a no-op update (e.g. only whitespace/comment reordering) — nothing to report
  const parts: string[] = [];
  if (changed) parts.push(`${changed} changed`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  vscode.window.setStatusBarMessage(`SFL: ${parts.join(', ')}`, 3000);
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

// Same folder as the .sfl document, same base name, new extension — e.g.
// checkout-flow.sfl -> checkout-flow.svg. Just the *starting point* for the
// save dialog below, not a forced destination: the dialog lets the reader
// browse anywhere and rename before writing.
type ExportFormat = 'svg' | 'png' | 'md' | 'toon';

// Save dialog wording per format; the format is also the file extension.
const EXPORT_FORMATS: Record<ExportFormat, { label: string; filter: string }> = {
  svg: { label: 'SVG', filter: 'SVG Image' },
  png: { label: 'PNG', filter: 'PNG Image' },
  md: { label: 'Markdown', filter: 'Markdown' },
  toon: { label: 'TOON', filter: 'TOON' },
};

function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && Object.hasOwn(EXPORT_FORMATS, value);
}

function defaultExportUri(documentUri: vscode.Uri, ext: ExportFormat): vscode.Uri {
  const base = baseName(documentUri.fsPath).replace(/\.sfl$/i, '');
  const dir = vscode.Uri.file(path.dirname(documentUri.fsPath));
  return vscode.Uri.joinPath(dir, `${base}.${ext}`);
}

// The webview already did the actual export work (render() to SVG, and for
// PNG, rasterizing that SVG through an offscreen <canvas> — see
// getWebviewHtml.ts's exportDiagram()) and handed back a finished payload:
// an SVG string, or a PNG `data:` URL. This just owns the one thing the
// webview sandbox can't do itself — a native save dialog and a filesystem
// write.
async function exportDiagram(documentUri: vscode.Uri, format: ExportFormat, data: string): Promise<void> {
  const { label, filter } = EXPORT_FORMATS[format];
  const uri = await vscode.window.showSaveDialog({
    defaultUri: defaultExportUri(documentUri, format),
    filters: { [filter]: [format] },
    title: `Export SFL Preview as ${label}`,
  });
  if (!uri) return;
  let contents: Buffer;
  if (format === 'png') {
    contents = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
  } else if (format === 'md') {
    // The webview sends the source; the heading comes from the file name.
    contents = Buffer.from(sflToMarkdown(baseName(documentUri.fsPath).replace(/\.sfl$/i, ''), data), 'utf8');
  } else {
    contents = Buffer.from(data, 'utf8');
  }
  await vscode.workspace.fs.writeFile(uri, contents);
  const reveal = 'Reveal in Explorer';
  const choice = await vscode.window.showInformationMessage(`Exported ${baseName(uri.fsPath)}.`, reveal);
  if (choice === reveal) void vscode.commands.executeCommand('revealFileInOS', uri);
}
