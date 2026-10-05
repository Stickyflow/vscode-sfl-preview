// Builds the webview's HTML shell: the toolbar, the <stickyflow-diagram>
// element, and a short module bootstrap. All behavior lives in the typed
// modules under webview/ (compiled to media/webview/, see webview/README.md).
//
// Script loading:
//  - stickyflow-diagram.global.js (the IIFE from stickyflow.js's dist, copied
//    into media/stickyflow/ by scripts/copy-media.mjs) is a plain <script src>
//    that self-registers the <stickyflow-diagram> custom element.
//  - the bootstrap imports stickyflow.js's ESM `interaction` tier and core as
//    whole namespaces and hands them to startPreview() (webview/main.ts). The
//    webview modules only see them through the types in webview/stickyflow.ts,
//    so a renamed or removed export upstream fails `npm run compile` instead
//    of breaking the panel at runtime.
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialSource: string): string {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'stickyflow');
  const diagramScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'stickyflow-diagram.global.js'));
  const interactionModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'interaction', 'index.js'));
  const coreModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'index.js'));
  // This extension's own webview modules (compiled from webview/ by
  // tsconfig.webview.json). Same media/ resource root, so no CSP change: the
  // trusted inline module imports main.js and 'strict-dynamic' extends that
  // trust to the modules it imports in turn.
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'media', 'webview');
  const mainModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'main.js'));
  const nonce = getNonce();
  // Escape `<` so the JSON blob can't break out of the surrounding <script> tag.
  const initialSourceJson = JSON.stringify(initialSource).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- 'strict-dynamic': stickyflow.js's ESM build is code-split, so
       interaction/index.js and index.js each import sibling ../chunk-*.js
       files. A bare nonce authorises an element, not a fetch, so those
       transitive imports would be blocked and the whole module script — every
       edit-mode gesture — would fail to load while the diagram still renders. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'strict-dynamic';" />
  <style>
    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--sf-canvas, var(--vscode-editor-background)); }
    stickyflow-diagram { width: 100%; height: 100%; display: block; }
    .sf-toolbar {
      position: fixed; top: 8px; right: 8px; z-index: 10;
      display: flex; gap: 4px;
      font-family: var(--vscode-font-family, sans-serif);
    }
    .sf-toolbar button {
      font-size: 13px;
      line-height: 1;
      background: var(--vscode-button-secondaryBackground, #3a3d41);
      color: var(--vscode-button-secondaryForeground, #fff);
      border: 1px solid var(--vscode-contrastBorder, transparent);
      border-radius: 4px;
      padding: 5px 9px;
      cursor: pointer;
    }
    .sf-toolbar button:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
    .sf-toolbar button[hidden] { display: none; }
    .sf-toolbar button[aria-pressed="true"] {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
    .sf-toolbar .sf-sep {
      width: 1px;
      align-self: stretch;
      background: var(--vscode-contrastBorder, rgba(128, 128, 128, 0.4));
      margin: 2px 2px;
    }
  </style>
</head>
<body>
  <stickyflow-diagram id="diagram" interactive="true"></stickyflow-diagram>
  <div class="sf-toolbar">
    <button id="sf-zoom-out" title="Zoom out">&minus;</button>
    <button id="sf-zoom-in" title="Zoom in">+</button>
    <button id="sf-zoom-fit" title="Fit to view">Fit</button>
    <span class="sf-sep"></span>
    <button id="sf-add-entity" title="Add a new entity" hidden>+ Entity</button>
    <button id="sf-add-link" title="Link two entities" aria-pressed="false" hidden>+ Link</button>
    <button id="sf-link-route" title="Cycle the selected link's routing: orthogonal, curved, straight" hidden>Route</button>
    <button id="sf-toggle-edit" title="Toggle edit mode" aria-pressed="false">Editing: Off</button>
    <span class="sf-sep"></span>
    <button id="sf-pick-template" title="Apply a style template to this file">Style</button>
    <span class="sf-sep"></span>
    <button id="sf-export-svg" title="Export the diagram as an SVG file">Export SVG</button>
    <button id="sf-export-png" title="Export the diagram as a PNG image">Export PNG</button>
  </div>
  <script nonce="${nonce}" src="${diagramScriptUri}"></script>
  <script type="module" nonce="${nonce}">
    import * as interaction from '${interactionModuleUri}';
    import * as core from '${coreModuleUri}';
    import { startPreview } from '${mainModuleUri}';

    startPreview({
      el: document.getElementById('diagram'),
      initialSource: ${initialSourceJson},
      interaction,
      core,
      vscodeApi: acquireVsCodeApi(),
    });
  </script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
