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
//  - wires the viewer's own (always-on, independent of edit mode)
//    `selectionChange` event to the extension host as `sfl/reveal`, and
//    applies incoming `sfl/select` messages via `viewer.select()` — the two
//    halves of canvas<->editor selection sync (see panel.ts).
//  - wires "+ Entity"/"+ Link" toolbar buttons to `insertEntity`/
//    `insertLink`, the same pure patchers `applyXChange` uses, so canvas-side
//    creation round-trips into the document exactly like a drag-to-move does.
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
    <button id="sf-add-entity" title="Add a new entity">+ Entity</button>
    <button id="sf-add-link" title="Link two entities" aria-pressed="false">+ Link</button>
    <button id="sf-toggle-edit" title="Toggle edit mode" aria-pressed="false">Editing: Off</button>
  </div>
  <script nonce="${nonce}" src="${diagramScriptUri}"></script>
  <script type="module" nonce="${nonce}">
    import {
      bindEditing, applyTextChange, applyMoveChange, applyResizeChange, applyLinkReconnectChange,
      insertEntity, removeEntity, insertLink, removeLink,
    } from '${interactionModuleUri}';

    const vscodeApi = acquireVsCodeApi();
    const el = document.getElementById('diagram');
    let currentSource = ${initialSourceJson};
    el.source = currentSource;

    let editing = null;
    // Default new-entity footprint — no shared constant exists to reuse (see
    // stickyflow.js/src/model), so this picks a generic size in the same
    // ballpark as the rendered shapes a doc already has.
    const NEW_ENTITY_SIZE = { width: 160, height: 80 };
    // A newly created entity has no Style reference and no local style{} —
    // the renderer leaves an unset fill/stroke fully transparent on purpose
    // (matches the interactive canvas: an unstyled shape isn't secretly
    // opaque white), and the default text color (#111827, near-black) is
    // tuned for a light canvas. Combined, a bare new entity was an invisible
    // box with barely-visible text — effectively unreadable on VS Code's dark
    // theme. This default style keeps it visible against either theme: white
    // fill so it never blends into a dark webview background, a blue stroke
    // (matching the existing selection-highlight color) so its bounds are
    // always legible, dark text on the white fill.
    const NEW_ENTITY_STYLE = [
      'style {',
      '    fill: "#FFFFFF"',
      '    stroke: "#2563eb"',
      '    textColor: "#111827"',
      '}',
    ].join('\\n');

    function applyPatch(next) {
      if (next === currentSource) return;
      currentSource = next;
      el.viewer.update({ source: currentSource });
      vscodeApi.postMessage({ type: 'sfl/edit', source: currentSource });
    }

    // A fresh <prefix>_<n> id not already declared anywhere in the current
    // document. insertEntity/insertLink themselves silently no-op on a
    // collision (see patchSfl.ts), so this only needs to be a good-faith
    // pick, not a guaranteed-unique one.
    function nextId(prefix) {
      const taken = new Set(
        [...currentSource.matchAll(/\\b(?:Entity|Container|Table|Link)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b/g)].map((m) => m[1]),
      );
      let n = taken.size + 1;
      while (taken.has(\`\${prefix}_\${n}\`)) n++;
      return \`\${prefix}_\${n}\`;
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
      if (!on) cancelLinking(); // turning editing off must also drop a pending "+ Link" gesture, not leave it armed
      const btn = document.getElementById('sf-toggle-edit');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Editing: On' : 'Editing: Off';
    }

    // Canvas -> editor selection sync: always on, independent of edit mode.
    // lastSyncedOwnerId is this SIDE's own record of the last id it sent or
    // applied — not shared with panel.ts's own field of the same name across
    // the postMessage boundary. Each side independently skips re-announcing
    // an id it just received, which is enough on its own to break the loop
    // where selecting in the canvas moves the editor's cursor, which then
    // reports a selection change right back (see the sfl/select handler
    // below, and panel.ts's matching field for the other half).
    let lastSyncedOwnerId = null;

    function syncSelectionToHost(selection) {
      const id = selection.length === 1 ? selection[0].id : null; // no single text location for a multi-selection
      if (id === lastSyncedOwnerId) return;
      lastSyncedOwnerId = id;
      vscodeApi.postMessage({ type: 'sfl/reveal', id });
    }

    if (el.viewer) {
      el.viewer.on('selectionChange', (e) => syncSelectionToHost(e.selection));
    }

    // "+ Entity" — inserts a default-labeled entity centered on whatever the
    // reader is currently looking at (getViewport(), not a fixed spot the
    // reader would then have to go find), switches edit mode on so it's
    // immediately draggable/renamable, and selects it — which also reveals
    // it in the text editor via the selection-sync wiring above.
    document.getElementById('sf-add-entity').addEventListener('click', () => {
      const viewer = el.viewer;
      if (!viewer) return;
      const viewport = viewer.getViewport();
      const id = nextId('entity');
      const next = insertEntity(currentSource, {
        id,
        kind: 'shape',
        text: 'New entity',
        x: viewport.x + viewport.w / 2 - NEW_ENTITY_SIZE.width / 2,
        y: viewport.y + viewport.h / 2 - NEW_ENTITY_SIZE.height / 2,
        width: NEW_ENTITY_SIZE.width,
        height: NEW_ENTITY_SIZE.height,
        body: NEW_ENTITY_STYLE,
      });
      if (next === currentSource) {
        // insertEntity no-ops (rather than throwing) on an id collision or a
        // document with no top-level Model block — silently doing nothing
        // left no way to tell "it worked" from "it didn't", so this reports
        // it explicitly instead of failing invisibly.
        vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not add entity "\${id}" — check that the document has a top-level Model block and that id isn't already used.\` });
        return;
      }
      setEditMode(true);
      applyPatch(next);
      viewer.select([id]);
    });

    // "+ Link" — a two-click gesture: arm it, click a source entity, click a
    // target entity. Listens on the viewer's own entityClick (fires
    // alongside selectionChange on every click, which the reveal sync
    // above already handles on its own) rather than re-deriving clicks from
    // selectionChange, so this stays a simple additive listener with no
    // interaction with normal click-to-select/reveal behavior. Requires edit
    // mode the same way every other mutation does — arming it switches edit
    // mode on (same pattern as "+ Entity"), and the entityClick handler below
    // re-checks the editing flag itself so a link can never be created while
    // it's off, even if edit mode gets toggled off mid-gesture some other way.
    let linkState = null; // null (off) | 'from' (armed, waiting for source) | { from } (waiting for target)

    function setLinkButtonLabel() {
      const btn = document.getElementById('sf-add-link');
      btn.setAttribute('aria-pressed', String(linkState !== null));
      btn.textContent = linkState === null ? '+ Link' : linkState === 'from' ? 'Click source…' : 'Click target…';
    }

    function cancelLinking() {
      linkState = null;
      setLinkButtonLabel();
    }

    document.getElementById('sf-add-link').addEventListener('click', () => {
      if (linkState === null) {
        setEditMode(true);
        linkState = 'from';
      } else {
        linkState = null;
      }
      setLinkButtonLabel();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && linkState !== null) cancelLinking();
    });

    if (el.viewer) {
      el.viewer.on('entityClick', (e) => {
        if (!editing) return; // belt-and-suspenders: mutation only proceeds while edit mode is actually on
        if (linkState === 'from') {
          linkState = { from: e.owner };
          setLinkButtonLabel();
          return;
        }
        if (linkState && linkState.from) {
          if (e.owner.id === linkState.from.id) { cancelLinking(); return; } // clicked the same entity twice — cancel, not a self-link
          const id = nextId('link');
          const next = insertLink(currentSource, { id, fromId: linkState.from.id, toId: e.owner.id });
          cancelLinking();
          if (next === currentSource) {
            // insertLink no-ops (rather than throwing) on an id collision —
            // reported explicitly rather than failing invisibly, same as "+ Entity".
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not create link "\${id}" — that id may already be taken.\` });
            return;
          }
          applyPatch(next);
          el.viewer.select([id]);
        }
      });
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
      } else if (message && message.type === 'sfl/select') {
        // Editor -> canvas half of selection sync (see panel.ts's
        // selectFromEditor). lastSyncedOwnerId is set BEFORE calling
        // select() so the selectionChange it synchronously re-emits is
        // recognized by syncSelectionToHost above as already-in-sync and
        // doesn't bounce right back to the host.
        if (message.id === lastSyncedOwnerId) return;
        lastSyncedOwnerId = message.id;
        if (el.viewer) el.viewer.select(message.id ? [message.id] : []);
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
