# Changelog

All notable changes to the SFL Preview extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.1] - 2026-10-17

### Changed

- Published as **StickyFlow SFL Preview** under the `StickyFlowLab` publisher. The README
  links to the Marketplace and uses the new names.
- New README banner, matching the artwork on stickyflow.org.

## [0.1.0] - 2026-10-17

First release on the VS Code Marketplace.

### Changed

- The webview script is now typed modules under `webview/` (edit mode, edit
  actions, "+ Entity", "+ Link", Route, selection sync, export, host
  messaging). `getWebviewHtml.ts` keeps only the HTML and a short bootstrap
  that hands stickyflow.js to `startPreview()`. The modules use stickyflow.js
  through the types in `webview/stickyflow.ts`, so a renamed or removed export
  (like the `insertEntity` rename that blanked the panel) now fails
  `npm run compile`.
- `copy-media` records the stickyflow.js version and commit it copied in
  `media/stickyflow/SOURCE.json` and prints it.
- `npm run check` runs compile, the unit tests and `verify:webview` in one go.
- Built against stickyflow.js `main` after its Publishing-Refactoring merge
  (#12). Frames, swimlanes, tables and charts are now moved and resized by
  stickyflow.js's own edit mode, so the preview's supplemental
  `webview/ownerDrag.ts` / `ownerResize.ts` / `ownerGesture.ts` gestures are
  removed (running both moved a dragged frame twice).
- A frame/swimlane drag commits as one edit, and only the container's own
  `layout { position }` is rewritten: its children's positions are relative to
  it, so they no longer jump inside the frame.
- Selection sync and the "+ Entity" name check recognise `Shape` blocks
  (stickyflow.js's new keyword for `Entity`, which stays an alias).

### Fixed

- A preview opened on a file that didn't render (a syntax error, say) stayed
  on the error message even after the file was fixed: every update hit the
  missing viewer and threw. It now re-renders and wires up the toolbar as soon
  as the text renders.
- "+ Entity", the "+" bubbles and frame-drag previews read
  `sflToCanvasState().canvasObjects` (renamed from `entities` in
  stickyflow.js); with the old name "+ Entity" threw and did nothing.

### Added

- "Style" toolbar button: runs vscode-sfl's *Apply Style Template* for the
  previewed document. The template highlighted in the picker is shown live
  (internal `sfl.preview.showTransientSource` command) without editing the
  document; dismissing the picker shows the document again.
- The canvas color from a style template (`Style tpl_canvas { fill }`) is
  painted behind the diagram and used as the SVG and PNG export background.
- Bundled Inter (`@fontsource-variable/inter`, latin and latin-ext, OFL,
  copied to `media/fonts/` by `copy-media`): the preview loads it as
  `@font-face`, and SVG/PNG exports embed the subsets their text uses, so
  diagrams no longer fall back to another font where Inter isn't installed.
- `SFL: Open Preview` / `SFL: Open Preview to the Side` commands, plus an
  editor-title icon, mirroring VS Code's built-in Markdown preview UX.
- Webview rendering via stickyflow.js's `<stickyflow-diagram>` web component,
  loaded from a prebuilt IIFE bundle copied in at build time
  (`scripts/copy-media.mjs`).
- Live update on document edits (debounced ~150ms), one independent preview
  panel per source file.
- Bundled with `vscode-sfl` via `extensionPack` / `extensionDependencies` so
  installing either extension installs both.
- Toolbar zoom controls (&minus; / + / Fit), since Ctrl/Cmd+scroll-to-zoom
  isn't discoverable inside a webview panel.
- Edit mode (toggle button): drag-to-move, drag-to-resize, double-click
  text edit, drag-to-reconnect link endpoints, and delete — wired to
  stickyflow.js's `stickyflow/interaction` tier, patched into SFL text, and
  written back to the document as a normal (undoable) edit. Off by default.
- Edit mode now also **moves and resizes frames, swimlanes, tables and
  charts**, not just entities. stickyflow.js's own move and resize gestures
  are entity-only; small `webview/ownerDrag.ts` / `webview/ownerResize.ts`
  modules bind the missing gestures for those roles and commit through the
  package's existing `applyMoveChange` / `applyResizeChange` patchers. Resize
  works off the handles the selection overlay already draws for every non-link
  shape (select the shape, drag a corner). Dragging a frame carries its child
  entities in the live preview; their final layout is settled by the
  re-render on drop (child positions are relative to the frame's own
  `layout { position }`).
- **Route:** toolbar button (edit mode, one link selected) cycles that link's
  routing style orthogonal → curved → straight, via a new
  `webview/linkRoute.ts` patcher that sets a `route:` on the link's own SFL
  block.
- Better canvas panning (`webview/panControls.ts`): middle-button drag,
  left-drag on empty background, and plain scroll wheel (Shift for
  horizontal) all pan now — previously only Ctrl/Cmd-drag did, and a plain
  wheel did nothing. A grab / grabbing cursor shows over the background.
  Ctrl/Cmd-wheel still zooms. Works in and out of edit mode; the viewer's
  own camera stays the source of truth, so zoom is unaffected.
- Canvas-side create: `+ Entity` / `+ Link` toolbar buttons, using the same
  `stickyflow/interaction` patchers as edit mode.
- Bidirectional selection sync: clicking a shape reveals its block in the
  text editor, and moving the editor cursor selects the corresponding shape
  on the canvas.
- `Export SVG` / `Export PNG` toolbar buttons — re-renders the current
  document at its natural bounds via stickyflow.js's `render()` (independent
  of the preview's current pan/zoom), then opens a native save dialog
  defaulting next to the `.sfl` file. PNG is rasterized client-side at 2x.
- Change-highlighting: shapes touched by an externally-arriving update
  (typed in the text editor, or the file changed outside this webview) get a
  brief amber outline, using stickyflow.js's `sceneDiff`/`highlightChanges`.
  Self-caused edits (drag/resize/create in edit mode) never flash — you
  already just watched those happen. Updates that look like a whole-document
  external rewrite (e.g. an agent/tool writing the file directly, such as
  `mcp-sfl`) flash a distinct blue instead of amber — a heuristic guess at
  the edit's shape, not confirmed authorship; see `extension.ts`'s
  `looksLikeExternalRewrite` for the exact rule and its known false
  positives (a `git checkout`, a format-on-save, a manual select-all+paste).
- A status-bar line (`SFL: N changed, N added, N removed`, ~3s) fires on
  every scene diff, self-caused or external — a plain-text confirmation
  that the diff engine ran at all, independent of whether the ring itself
  is visible (it renders alongside, and can look similar to, the separate,
  always-on selection overlay with its own ring + resize handles).
