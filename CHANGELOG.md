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
  Inserting new entities/links isn't wired up yet.
