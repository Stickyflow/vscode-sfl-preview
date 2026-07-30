// Builds the webview's HTML shell. Loads the stickyflow.js IIFE bundle
// (media/stickyflow-diagram.global.js, copied in at build time — see
// scripts/copy-media.mjs) as a plain <script src>, which self-registers the
// <stickyflow-diagram> custom element. A second, nonced inline script wires
// the initial SFL source and listens for `sfl/update` messages from the
// extension host so edits in the text editor live-update the preview.
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialSource: string): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'stickyflow-diagram.global.js'));
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
  </style>
</head>
<body>
  <stickyflow-diagram id="diagram" interactive="true"></stickyflow-diagram>
  <script nonce="${nonce}" src="${scriptUri}"></script>
  <script nonce="${nonce}">
    const el = document.getElementById('diagram');
    el.source = ${initialSourceJson};
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'sfl/update') {
        el.source = message.source;
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
