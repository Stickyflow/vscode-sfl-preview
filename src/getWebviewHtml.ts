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
//  - binds `webview/panControls.ts` for canvas panning the viewer itself
//    doesn't offer: middle-drag / drag-on-empty-background to pan, plain
//    scroll wheel to pan, and a grab cursor — each fed to the viewer's own
//    (ctrl-drag) pan path so its camera state stays authoritative.
//  - wires an edit-mode toggle that binds stickyflow.js's `interaction` tier
//    (drag-to-move/resize for entities, frames, swimlanes, tables and charts,
//    double-click text edit, drag-to-reconnect links, delete) on top of the existing viewer, turns each change event into
//    patched SFL text via that tier's pure `applyXChange` patchers, and
//    posts the result back to the extension host to write into the real
//    document (see panel.ts's `sfl/edit` handler).
//  - binds this extension's own `webview/` modules (compiled to
//    media/webview/): `applyRouteChange` backs a "Route:" toolbar button that cycles a
//    selected link's routing (orthogonal/curved/straight). All round-trip
//    through the same `applyPatch` -> `sfl/edit` path.
//  - wires the viewer's own (always-on, independent of edit mode)
//    `selectionChange` event to the extension host as `sfl/reveal`, and
//    applies incoming `sfl/select` messages via `viewer.select()` — the two
//    halves of canvas<->editor selection sync (see panel.ts).
//  - wires "+ Entity"/"+ Link" toolbar buttons to `insertCanvasObject`/
//    `insertLink`, the same pure patchers `applyXChange` uses, so canvas-side
//    creation round-trips into the document exactly like a drag-to-move does.
//  - wires "Export SVG"/"Export PNG" toolbar buttons to stickyflow.js's own
//    `render()` (the static, DOM-free core — same entry the non-interactive
//    <stickyflow-diagram> path and the main app's export use), re-rendering
//    `currentSource` at its natural bounds rather than reading the live
//    viewer's `<svg>` — that element's viewBox tracks the reader's current
//    pan/zoom, so serializing it directly would export whatever's currently
//    in view (and cropped to it) instead of the whole diagram, and would
//    disturb the camera if reset first. PNG rasterizes that SVG through an
//    offscreen <canvas> (an Image() load + drawImage, at 2x for a crisp
//    result independent of the host display's own DPI). Either way the
//    finished payload is posted to the extension host as `sfl/export` — a
//    webview can't open a native save dialog or write files itself, so the
//    host owns that half (see panel.ts's `sfl/export` handler).
import * as vscode from 'vscode';

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialSource: string): string {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'stickyflow');
  const diagramScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'stickyflow-diagram.global.js'));
  const interactionModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'interaction', 'index.js'));
  const coreModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'index.js'));
  // This extension's own webview-client modules (compiled from webview/ by
  // tsconfig.webview.json). Same media/ resource root, so no CSP change: the
  // trusted inline module below statically imports them and 'strict-dynamic'
  // propagates trust.
  const webviewRoot = vscode.Uri.joinPath(extensionUri, 'media', 'webview');
  const panControlsModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'panControls.js'));
  const linkRouteModuleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'linkRoute.js'));
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
    <button id="sf-link-route" title="Cycle the selected link's routing: orthogonal → curved → straight" hidden>Route: &mdash;</button>
    <button id="sf-toggle-edit" title="Toggle edit mode" aria-pressed="false">Editing: Off</button>
    <span class="sf-sep"></span>
    <button id="sf-export-svg" title="Export the diagram as an SVG file">Export SVG</button>
    <button id="sf-export-png" title="Export the diagram as a PNG image">Export PNG</button>
  </div>
  <script nonce="${nonce}" src="${diagramScriptUri}"></script>
  <script type="module" nonce="${nonce}">
    import {
      bindEditing, applyTextChange, applyMoveChange, applyResizeChange, applyLinkReconnectChange,
      insertCanvasObject, removeCanvasObject, insertLink, removeLink,
    } from '${interactionModuleUri}';
    import { render, sflToCanvasState } from '${coreModuleUri}';
    import { bindPanControls } from '${panControlsModuleUri}';
    import { applyRouteChange, nextRoute } from '${linkRouteModuleUri}';

    const vscodeApi = acquireVsCodeApi();
    const el = document.getElementById('diagram');

    // Roles a canvas-drawn link may connect. Narrower than SFL's own linkable
    // set on purpose: Path and Chart are valid \`to:\` targets in the language,
    // but the link router only draws a clean edge to a rectangular owner, so
    // linking to one from the canvas leaves a stub ending mid-shape — link
    // those by editing the SFL. Frame/swimlane are Container render roles.
    const LINKABLE_ROLES = ['entity', 'frame', 'swimlane', 'table'];
    let currentSource = ${initialSourceJson};
    el.source = currentSource;

    // The viewer draws resize handles and the "+" quick-add bubbles around any
    // singly-selected entity straight from selection state — it has no notion
    // of this preview's edit mode, and selection stays live even with editing
    // off (it drives editor<->canvas sync). With editing off those affordances
    // are inert (their interaction events have no listener), so gate them on a
    // class the "Editing" toggle puts on the host. The rule lives in a sheet
    // adopted into the diagram's shadow root — adoptedStyleSheets survives the
    // web component clearing its shadow DOM, a <style> child would not. The
    // plain selection ring is left alone; it's the sync cue.
    if (el.shadowRoot && 'adoptedStyleSheets' in el.shadowRoot) {
      const gate = new CSSStyleSheet();
      gate.replaceSync(
        ':host(:not(.sf-editing)) [data-sf-resize-handle],' +
        ':host(:not(.sf-editing)) [data-sf-quick-duplicate],' +
        ':host(:not(.sf-editing)) [data-sf-quick-duplicate] + path { display: none; }',
      );
      el.shadowRoot.adoptedStyleSheets = [...el.shadowRoot.adoptedStyleSheets, gate];
    }

    let editing = null;
    // moveChange events of the drag in progress, flushed as one patch (see
    // flushMoves).
    let pendingMoves = [];
    // The single selected link's id, or null. Drives the "Route:" toolbar
    // button's visibility and label (see the selectionChange handler).
    let selectedLinkId = null;
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

    // Second change-highlight color, for updates extension.ts's
    // looksLikeExternalRewrite() flags as probably NOT ordinary in-editor
    // typing (a whole-document replace, e.g. from mcp-sfl writing the file
    // directly — see the sfl/update handler below). Reuses the same blue as
    // NEW_ENTITY_STYLE's stroke above rather than inventing a third color in
    // this file's palette. This is a heuristic guess at the edit's shape,
    // not confirmed provenance — a git checkout or a manual select-all+paste
    // in the text editor look identical and get the same color.
    const EXTERNAL_REWRITE_COLOR = '#2563eb';

    function applyPatch(next) {
      if (next === currentSource) return;
      currentSource = next;
      el.viewer.update({ source: currentSource });
      vscodeApi.postMessage({ type: 'sfl/edit', source: currentSource });
    }

    // bindEditing() emits one moveChange per moved owner, synchronously, and
    // a dragged frame/swimlane brings its contained children along with the
    // same delta. Child positions are relative to the parent's origin, so
    // once the parent moves the children already follow it: patching them
    // too would move them twice. Drop every move whose ancestor moves in the
    // same gesture, then commit the rest as a single edit.
    function flushMoves() {
      const moves = pendingMoves;
      pendingMoves = [];
      if (moves.length === 0) return;
      const moving = new Set(moves.map((m) => m.owner.id));
      let parentOf = () => undefined;
      try {
        const objects = sflToCanvasState(currentSource).canvasObjects;
        const parents = new Map(objects.map((o) => [o.id, o.parentFrameId]));
        parentOf = (id) => parents.get(id);
      } catch (_) {
        // Unparseable source: no hierarchy to consult, apply every move as is.
      }
      const hasMovingAncestor = (id) => {
        const seen = new Set();
        for (let p = parentOf(id); p && !seen.has(p); p = parentOf(p)) {
          if (moving.has(p)) return true;
          seen.add(p);
        }
        return false;
      };
      let next = currentSource;
      for (const move of moves) {
        if (!hasMovingAncestor(move.owner.id)) next = applyMoveChange(next, move);
      }
      applyPatch(next);
    }

    // A fresh <prefix>_<n> id not already declared anywhere in \`src\` (the live
    // document by default). insertCanvasObject/insertLink themselves silently no-op
    // on a collision (see patchSfl.ts), so this only needs to be a good-faith
    // pick, not a guaranteed-unique one. Pass an explicit \`src\` to pick a
    // second id against a document already patched but not yet committed.
    function nextId(prefix, src) {
      const text = src || currentSource;
      const taken = new Set(
        [...text.matchAll(/\\b(?:Shape|Entity|Container|Table|Link|Isometric|Connection)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b/g)].map((m) => m[1]),
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
        editing.on('moveChange', (e) => {
          if (pendingMoves.length === 0) queueMicrotask(flushMoves);
          pendingMoves.push(e);
        });
        editing.on('resizeChange', (e) => applyPatch(applyResizeChange(currentSource, e)));
        editing.on('linkReconnect', (e) => applyPatch(applyLinkReconnectChange(currentSource, e)));
        // The "+" bubbles around a selected shape. stickyflow.js has no pure
        // patcher for this, so it's built here: a duplicate of the shape,
        // offset in the clicked direction, plus a link from the shape into it
        // — the bubble is an "add connected next step" affordance, not a plain
        // copy. Falls back to a bare duplicate if the source isn't linkable.
        editing.on('quickDuplicate', (e) => {
          const source = sflToCanvasState(currentSource).canvasObjects.find((en) => en.id === e.owner.id);
          if (!source) return;
          const w = source.width || NEW_ENTITY_SIZE.width;
          const h = source.height || NEW_ENTITY_SIZE.height;
          const gap = 40;
          let x = source.x;
          let y = source.y;
          if (e.direction === 'right') x = source.x + w + gap;
          else if (e.direction === 'left') x = source.x - w - gap;
          else if (e.direction === 'bottom') y = source.y + h + gap;
          else if (e.direction === 'top') y = source.y - h - gap;
          const id = nextId('entity');
          let next = insertCanvasObject(currentSource, { id, kind: 'shape', text: 'New entity', x, y, width: w, height: h, body: NEW_ENTITY_STYLE });
          if (next === currentSource) return;
          if (LINKABLE_ROLES.includes(e.owner.role)) {
            const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[e.direction];
            const linked = insertLink(next, { id: nextId('link', next), fromId: e.owner.id, toId: id, fromSide: e.direction, toSide: opposite });
            if (linked !== next) next = linked;
          }
          applyPatch(next);
          el.viewer.select([id]);
        });
        // Drag a "+" bubble onto another shape (instead of into empty space):
        // resolved as a new link rather than a duplicate. The bubble's side is
        // the from-endpoint; the drop point on the target gives the to-side +
        // fraction. Non-connectable targets (path/chart) are rejected — no
        // half-made link left on the board.
        editing.on('linkTo', (e) => {
          if (!LINKABLE_ROLES.includes(e.target.role)) {
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Can't link to "\${e.target.id}" — it's a \${e.target.role}. Canvas links connect entities, containers and tables; link a \${e.target.role} by editing the SFL.\` });
            el.viewer.update({ source: currentSource }); // clear the drag preview
            return;
          }
          const id = nextId('link');
          const next = insertLink(currentSource, { id, fromId: e.owner.id, toId: e.target.id, fromSide: e.direction, toSide: e.side, toFraction: e.fraction });
          if (next === currentSource) {
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not link "\${e.owner.id}" → "\${e.target.id}".\` });
            el.viewer.update({ source: currentSource });
            return;
          }
          applyPatch(next);
          el.viewer.select([id]);
        });
        editing.on('delete', (e) => {
          let next = currentSource;
          for (const owner of e.owners) next = owner.role === 'link' ? removeLink(next, owner.id) : removeCanvasObject(next, owner.id);
          applyPatch(next);
        });
      } else if (!on && editing) {
        editing.destroy();
        editing = null;
        pendingMoves = [];
      }
      if (!on) cancelLinking(); // turning editing off must also drop a pending "+ Link" gesture, not leave it armed
      const btn = document.getElementById('sf-toggle-edit');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Editing: On' : 'Editing: Off';
      // "+ Entity" / "+ Link" only do anything while editing is on — every
      // mutation path is gated on the editing flag — and a visible button that
      // silently no-ops is worse than no button. So they're shown only in edit
      // mode; the "Editing" toggle stays put as the one way in.
      document.getElementById('sf-add-entity').hidden = !on;
      document.getElementById('sf-add-link').hidden = !on;
      if (!on) selectedLinkId = null;
      refreshRouteButton();
      // Same reasoning for the on-canvas resize handles / "+" bubbles the
      // viewer paints around a selected entity (see the adopted sheet above).
      el.classList.toggle('sf-editing', on);
    }

    // Current routing of a link, read straight off its rendered path
    // (data-sf-route, set by the renderer). Falls back to 'straight' only if
    // the attribute is missing entirely — nextRoute() treats an unknown value
    // as "start the cycle" anyway.
    function currentRouteOf(linkId) {
      const svg = el.viewer && el.viewer.svg;
      const path = svg && svg.querySelector('[data-sf-id="' + (window.CSS ? CSS.escape(linkId) : linkId) + '"][data-sf-primary]');
      return (path && path.getAttribute('data-sf-route')) || 'straight';
    }

    // The "Route:" button is shown only with edit mode on AND exactly one link
    // selected — the one thing it acts on. Otherwise a visible button that
    // silently does nothing (same rule as "+ Entity"/"+ Link").
    function refreshRouteButton() {
      const btn = document.getElementById('sf-link-route');
      const show = !!editing && !!selectedLinkId;
      btn.hidden = !show;
      btn.textContent = show ? 'Route: ' + currentRouteOf(selectedLinkId) : 'Route: \\u2014';
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

    // Last non-empty canvas selection — a durable anchor for "+ Entity", since
    // reading getSelection() the moment the toolbar button is clicked can come
    // back empty when focus shifts to the button.
    let lastSelectionOwners = [];

    if (el.viewer) {
      // Better canvas panning: middle-drag or drag-on-empty-background to pan,
      // plain scroll wheel to pan (Ctrl/Cmd wheel still zooms), and a grab
      // cursor over the background. Independent of edit mode — panning is
      // navigation. Feeds the viewer's own pan path (see webview/panControls.ts).
      bindPanControls(el.viewer.svg);

      el.viewer.on('selectionChange', (e) => {
        if (e.selection.length > 0) lastSelectionOwners = e.selection;
        selectedLinkId = e.selection.length === 1 && e.selection[0].role === 'link' ? e.selection[0].id : null;
        refreshRouteButton();
        syncSelectionToHost(e.selection);
      });
      // Reports every scene diff to the host as a status-bar line (see
      // panel.ts's sfl/sceneDiff handler) — a plain-text, unambiguous signal
      // that change-highlighting's underlying diff actually fired, decoupled
      // from whether the amber/blue ring itself is visible or obscured by
      // the (separate, always-on) selection overlay. Fires on EVERY
      // update() call, including this webview's own self-caused edits
      // (drag/resize/create) — those don't get flashed, but they're still
      // real diffs, so they're reported too rather than filtered out.
      el.viewer.on('sceneDiff', (e) => vscodeApi.postMessage({ type: 'sfl/sceneDiff', added: e.added, removed: e.removed, changed: e.changed }));
    }

    // "+ Entity" — adds a *connected* next step, not a floating orphan. Only
    // shown in edit mode (see setEditMode). The anchor is the one selected
    // shape, or (nothing selected) the entity the previous "+ Entity" click
    // added, so repeated clicks build a chain. The first click with no anchor
    // drops a lone entity centered on the viewport. The new entity lands just
    // below its anchor and is linked from it.
    let lastAddedEntityId = null;
    // Snapshot the selection on pointerdown, before the button takes focus.
    let addEntityPdAnchor = null;
    document.getElementById('sf-add-entity').addEventListener('pointerdown', () => {
      const sel = el.viewer ? el.viewer.getSelection() : [];
      addEntityPdAnchor = sel.length === 1 ? sel[0] : null;
    });
    document.getElementById('sf-add-entity').addEventListener('click', () => {
      const viewer = el.viewer;
      if (!viewer || !editing) return; // button is hidden while editing is off — guard the handler too

      const pd = addEntityPdAnchor;
      addEntityPdAnchor = null;
      const clickSel = viewer.getSelection();
      const selAnchor =
        pd ||
        (clickSel.length === 1 ? clickSel[0] : null) ||
        (lastSelectionOwners.length === 1 ? lastSelectionOwners[0] : null);

      const entities = sflToCanvasState(currentSource).canvasObjects;
      let anchorShape = null;
      if (selAnchor && LINKABLE_ROLES.includes(selAnchor.role)) {
        anchorShape = entities.find((en) => en.id === selAnchor.id) || null;
      }
      if (!anchorShape && lastAddedEntityId) {
        anchorShape = entities.find((en) => en.id === lastAddedEntityId) || null;
      }

      let x;
      let y;
      if (anchorShape) {
        x = anchorShape.x + (anchorShape.width || NEW_ENTITY_SIZE.width) / 2 - NEW_ENTITY_SIZE.width / 2;
        y = anchorShape.y + (anchorShape.height || NEW_ENTITY_SIZE.height) + 60;
      } else {
        const viewport = viewer.getViewport();
        x = viewport.x + viewport.w / 2 - NEW_ENTITY_SIZE.width / 2;
        y = viewport.y + viewport.h / 2 - NEW_ENTITY_SIZE.height / 2;
      }

      const id = nextId('entity');
      let next = insertCanvasObject(currentSource, {
        id,
        kind: 'shape',
        text: 'New entity',
        x,
        y,
        width: NEW_ENTITY_SIZE.width,
        height: NEW_ENTITY_SIZE.height,
        body: NEW_ENTITY_STYLE,
      });
      if (next === currentSource) {
        // insertCanvasObject no-ops (never throws) on an id collision or a document
        // with no top-level Model block — surfaced rather than left silent.
        vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not add entity "\${id}" — check that the document has a top-level Model block and that id isn't already used.\` });
        return;
      }
      if (anchorShape) {
        const linked = insertLink(next, { id: nextId('link', next), fromId: anchorShape.id, toId: id, fromSide: 'bottom', toSide: 'top' });
        if (linked !== next) next = linked;
      }

      lastAddedEntityId = id;
      applyPatch(next);
      viewer.select([id]);
    });

    // "+ Link" — a two-click gesture: arm it, click a source entity, click a
    // target entity. Listens on the viewer's own canvasObjectClick (fires
    // alongside selectionChange on every click, which the reveal sync
    // above already handles on its own) rather than re-deriving clicks from
    // selectionChange, so this stays a simple additive listener with no
    // interaction with normal click-to-select/reveal behavior. The button is
    // only visible in edit mode (see setEditMode), and both this click handler
    // and the canvasObjectClick handler below re-check the editing flag, so a link
    // can never be armed or created while edit mode is off.
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
      if (!editing) return; // button is hidden while editing is off — guard the handler too
      linkState = linkState === null ? 'from' : null;
      setLinkButtonLabel();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && linkState !== null) cancelLinking();
    });

    if (el.viewer) {
      el.viewer.on('canvasObjectClick', (e) => {
        if (!editing) return; // belt-and-suspenders: mutation only proceeds while edit mode is actually on
        if (linkState === 'from') {
          if (!LINKABLE_ROLES.includes(e.owner.role)) {
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Can't link from "\${e.owner.id}" — it's a \${e.owner.role}. Canvas links connect entities, containers and tables.\` });
            cancelLinking();
            return;
          }
          linkState = { from: e.owner };
          setLinkButtonLabel();
          return;
        }
        if (linkState && linkState.from) {
          if (e.owner.id === linkState.from.id) { cancelLinking(); return; } // clicked the same entity twice — cancel, not a self-link
          const fromId = linkState.from.id;
          cancelLinking();
          if (!LINKABLE_ROLES.includes(e.owner.role)) {
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Can't link to "\${e.owner.id}" — it's a \${e.owner.role}. Canvas links connect entities, containers and tables.\` });
            return;
          }
          const id = nextId('link');
          const next = insertLink(currentSource, { id, fromId, toId: e.owner.id });
          if (next === currentSource) {
            vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not create link "\${fromId}" → "\${e.owner.id}".\` });
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

    // "Route:" cycles the selected link orthogonal -> curved -> straight,
    // patched into its SFL like every other edit-mode change. Guarded on
    // \`editing\` + a live selection even though the button is hidden otherwise.
    document.getElementById('sf-link-route').addEventListener('click', () => {
      if (!editing || !selectedLinkId) return;
      const id = selectedLinkId;
      const next = applyRouteChange(currentSource, id, nextRoute(currentRouteOf(id)));
      if (next === currentSource) {
        vscodeApi.postMessage({ type: 'sfl/warn', message: \`Couldn't change the route of "\${id}" — set its \\\`route:\\\` in the SFL instead.\` });
        return;
      }
      applyPatch(next);
      el.viewer.select([id]); // keep it selected so the button stays up, now showing the new route
      refreshRouteButton();
    });

    // PNG export is rasterized at this fixed multiple of the diagram's
    // natural (SFL user-space) size, independent of the host display's own
    // DPI — the reader's screen shouldn't decide the resolution of a file
    // they're taking out of the editor.
    const PNG_EXPORT_SCALE = 2;

    function exportDiagram(format) {
      let result;
      try {
        result = render(currentSource, { padding: 16 });
      } catch (err) {
        vscodeApi.postMessage({ type: 'sfl/warn', message: \`Could not export: \${err && err.message ? err.message : err}\` });
        return;
      }
      if (format === 'svg') {
        vscodeApi.postMessage({ type: 'sfl/export', format: 'svg', data: result.svg });
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(result.width * PNG_EXPORT_SCALE));
        canvas.height = Math.max(1, Math.round(result.height * PNG_EXPORT_SCALE));
        const ctx = canvas.getContext('2d');
        // The rendered SVG itself has no background rect (transparent by
        // design, so it composites into any page) — fill white here so text
        // tuned for a light canvas doesn't disappear when the PNG lands on a
        // dark surface elsewhere.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        vscodeApi.postMessage({ type: 'sfl/export', format: 'png', data: canvas.toDataURL('image/png') });
      };
      img.onerror = () => {
        vscodeApi.postMessage({ type: 'sfl/warn', message: 'Could not rasterize the diagram for PNG export.' });
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(result.svg);
    }

    document.getElementById('sf-export-svg').addEventListener('click', () => exportDiagram('svg'));
    document.getElementById('sf-export-png').addEventListener('click', () => exportDiagram('png'));

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message && message.type === 'sfl/update' && message.source !== currentSource) {
        currentSource = message.source;
        // highlightChanges only here, not in applyPatch() above — this path
        // is external edits (typed in the text editor, or the file changed
        // outside this webview entirely); applyPatch() is this webview's own
        // drag/resize/create actions, which the user already just watched
        // happen and doesn't need flashed back at them.
        //
        // message.likelyExternalRewrite (see extension.ts's
        // looksLikeExternalRewrite) picks which color flashes: the default
        // amber for an update that looks like ordinary in-editor typing, or
        // EXTERNAL_REWRITE_COLOR for one that looks like a whole-document
        // rewrite from outside the editor (e.g. mcp-sfl). A guess at the
        // edit's shape, not real provenance — see that function's own
        // comment for known false positives.
        el.viewer.update({
          source: currentSource,
          highlightChanges: message.likelyExternalRewrite ? { color: EXTERNAL_REWRITE_COLOR } : true,
        });
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
