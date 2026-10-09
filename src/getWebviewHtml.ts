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

/** The bundled Inter subsets (copied into media/fonts/ by
 *  scripts/copy-media.mjs), with fontsource's unicode ranges. The preview
 *  declares them as @font-face; exports embed the ones their text uses. */
const INTER_FACES = [
  {
    file: 'inter-latin-wght-normal.woff2',
    unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  },
  {
    file: 'inter-latin-ext-wght-normal.woff2',
    unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  },
];

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
  const fontsRoot = vscode.Uri.joinPath(extensionUri, 'media', 'fonts');
  const interFaces = INTER_FACES.map((face) => ({
    url: webview.asWebviewUri(vscode.Uri.joinPath(fontsRoot, face.file)).toString(),
    unicodeRange: face.unicodeRange,
  }));
  const interFontFaces = interFaces
    .map((face) => `@font-face { font-family: 'Inter'; font-style: normal; font-weight: 100 900; font-display: swap; src: url('${face.url}') format('woff2'); unicode-range: ${face.unicodeRange}; }`)
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- 'strict-dynamic': stickyflow.js's ESM build is code-split, so
       interaction/index.js and index.js each import sibling ../chunk-*.js
       files. A bare nonce authorises an element, not a fetch, so those
       transitive imports would be blocked and the whole module script — every
       edit-mode gesture — would fail to load while the diagram still renders.
       font-src / connect-src: the bundled Inter, as @font-face and fetched
       by exportDiagram.ts to embed into exports. -->
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; connect-src ${webview.cspSource}; script-src 'nonce-${nonce}' 'strict-dynamic';" />
  <style>
    ${interFontFaces}
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
    <button id="sf-export-md" title="Export the diagram as a Markdown note with a fenced sfl block">Export MD</button>
    <button id="sf-export-toon" title="Export the diagram's nodes and links as TOON, a compact format for LLM prompts">Export TOON</button>
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
      fonts: ${JSON.stringify(interFaces).replace(/</g, '\\u003c')},
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
