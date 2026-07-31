// Builds the webview's HTML shell. Loads the stickyflow.js IIFE bundle
// (media/stickyflow/stickyflow-diagram.global.js, copied in at build time —
// see scripts/copy-media.mjs) as a plain <script src>, which self-registers
// the <stickyflow-diagram> custom element. A module script then:
//  - sets the initial SFL source and applies `sfl/update` messages from the
//    extension host (external text edits) via viewer.update() rather than
//    the element's `source` setter, so pan/zoom and any active edit-mode
//    bindings survive — the setter tears down and remounts the whole viewer.
//  - wires zoom in/out/fit buttons (dispatching synthetic ctrl+wheel events,
//    since `Viewer` only exposes `fit()` publicly — no direct zoom method).
//  - wires an edit-mode toggle that binds stickyflow.js's `interaction` tier
//    (drag-to-move/resize, double-click text edit, drag-to-reconnect links,
//    delete) on top of the existing viewer, turns each change event into
//    patched SFL text via that tier's pure `applyXChange` patchers, and
//    posts the result back to the extension host to write into the real
//    document (see panel.ts's `sfl/edit` handler).
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialSource: string): string {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'stickyflow');
  const diagramScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'stickyflow-diagram.global.js'));
  const interactionModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'interaction', 'index.js'));
  const nonce = getNonce();
  // Escape `<` so the JSON blob can't break out of the surrounding <script> tag.
  const initialSourceJson = JSON.stringify(initialSource).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; background: var(--vscode-editor-background); }
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
    .sf-toolbar button[aria-pressed="true"] {
      background: var(--vscode-button-background, #0e639c);
      color: var(--vscode-button-foreground, #fff);
    }
  </style>
</head>
<body>
  <stickyflow-diagram id="diagram" interactive="true"></stickyflow-diagram>
  <div class="sf-toolbar">
    <button id="sf-zoom-out" title="Zoom out">&minus;</button>
    <button id="sf-zoom-in" title="Zoom in">+</button>
    <button id="sf-zoom-fit" title="Fit to view">Fit</button>
    <button id="sf-toggle-edit" title="Toggle edit mode" aria-pressed="false">Editing: Off</button>
  </div>
  <script nonce="${nonce}" src="${diagramScriptUri}"></script>
  <script type="module" nonce="${nonce}">
    import { bindEditing, applyTextChange, applyMoveChange, applyResizeChange, applyLinkReconnectChange, removeEntity, removeLink }
      from '${interactionModuleUri}';

    const vscodeApi = acquireVsCodeApi();
    const el = document.getElementById('diagram');
    let currentSource = ${initialSourceJson};
    el.source = currentSource;

    let editing = null;

    function applyPatch(next) {
      if (next === currentSource) return;
      currentSource = next;
      el.viewer.update({ source: currentSource });
      vscodeApi.postMessage({ type: 'sfl/edit', source: currentSource });
    }

    function setEditMode(on) {
      const viewer = el.viewer;
      if (!viewer) return;
      if (on && !editing) {
        editing = bindEditing(viewer);
        editing.on('textChange', (e) => applyPatch(applyTextChange(currentSource, e)));
        editing.on('moveChange', (e) => applyPatch(applyMoveChange(currentSource, e)));
        editing.on('resizeChange', (e) => applyPatch(applyResizeChange(currentSource, e)));
        editing.on('linkReconnect', (e) => applyPatch(applyLinkReconnectChange(currentSource, e)));
        editing.on('delete', (e) => {
          let next = currentSource;
          for (const owner of e.owners) next = owner.role === 'link' ? removeLink(next, owner.id) : removeEntity(next, owner.id);
          applyPatch(next);
        });
      } else if (!on && editing) {
        editing.destroy();
        editing = null;
      }
      const btn = document.getElementById('sf-toggle-edit');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Editing: On' : 'Editing: Off';
    }

    function zoomBy(factor) {
      const svg = el.viewer && el.viewer.svg;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      svg.dispatchEvent(new WheelEvent('wheel', {
        deltaY: factor > 1 ? -100 : 100,
        ctrlKey: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      }));
    }

    document.getElementById('sf-zoom-in').addEventListener('click', () => zoomBy(1.2));
    document.getElementById('sf-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
    document.getElementById('sf-zoom-fit').addEventListener('click', () => el.viewer && el.viewer.fit());
    document.getElementById('sf-toggle-edit').addEventListener('click', () => setEditMode(!editing));

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'sfl/update' && message.source !== currentSource) {
        currentSource = message.source;
        el.viewer.update({ source: currentSource });
      }
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
