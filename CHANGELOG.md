# Changelog

All notable changes to the SFL Preview extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - Unreleased

First working version. Not yet published to the Marketplace (`publisher` in
`package.json` is a placeholder).

### Added

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
  already just watched those happen.
