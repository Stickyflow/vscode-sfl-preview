# SFL Preview

Live preview for SFL (`.sfl`) diagrams in VS Code. Renders the sticky-flow
board in a webview using [stickyflow.js](../stickyflow.js)'s
`<stickyflow-diagram>` web component — the same renderer used by the main
StickyFlow app.

This is a companion to [`vscode-sfl`](../vscode-sfl) (language support:
syntax highlighting, diagnostics, completion, etc.). It's kept as a separate
extension deliberately: language support activates on every `.sfl` file and
should stay small, while this one owns the heavier rendering runtime and only
does work when a preview is actually opened. Installing either extension
installs both (see `extensionPack` / `extensionDependencies` in each
`package.json`).

## Usage

Open an `.sfl` file, then run one of:

- **SFL: Open Preview** — replaces the active editor group.
- **SFL: Open Preview to the Side** — opens beside the editor (also available
  as the preview icon in the editor title bar).

The preview updates as you type (debounced ~150ms).

The toolbar in the top-right corner of the preview offers:

- **&minus; / + / Fit** — zoom out, zoom in, and fit the diagram to the
  panel. (Ctrl/Cmd+scroll and Ctrl/Cmd+drag also work directly on the canvas,
  same convention as the main app — the toolbar buttons are there because
  that's not obvious at a glance.)
- **Editing: Off/On** — toggles edit mode. When on, you can drag shapes to
  move or resize them, double-click to edit text, drag a link's endpoint to
  reconnect it, and press Delete/Backspace on a selection to remove it.
  Each change is turned into new SFL text (via stickyflow.js's
  `stickyflow/interaction` patchers) and written back into the real
  document as a normal edit — so it's on the undo stack (Ctrl+Z) like
  anything you'd type by hand. Off by default so panning/selecting in the
  preview never risks mutating the file.

  Not wired up yet: inserting new entities/links (quick-duplicate bubbles,
  drag-to-connect onto empty canvas) — those require inventing new ids and
  copying style/size, which is a host decision stickyflow.js deliberately
  leaves to the caller (see `insertEntity`/`insertLink` in
  `stickyflow/interaction`).

## Development

The webview loads a prebuilt copy of stickyflow.js's `dist/` output rather
than bundling the renderer itself — both the IIFE (`stickyflow-diagram.global.js`,
for the `<stickyflow-diagram>` element) and the ESM `interaction` tier
(edit-mode) are copied in wholesale by `scripts/copy-media.mjs`, so
`packages/stickyflow.js` must be built first:

```bash
cd ../stickyflow.js && npm run build
cd ../vscode-sfl-preview
npm install
npm run compile   # copies media/ then compiles the extension
```

Press F5 in VS Code (with this folder open) to launch an Extension
Development Host for manual testing.
