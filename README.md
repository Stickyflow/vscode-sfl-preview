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

## Development

The webview loads a prebuilt copy of stickyflow.js's IIFE bundle rather than
bundling the renderer itself, so `packages/stickyflow.js` must be built
first:

```bash
cd ../stickyflow.js && npm run build
cd ../vscode-sfl-preview
npm install
npm run compile   # copies media/ then compiles the extension
```

Press F5 in VS Code (with this folder open) to launch an Extension
Development Host for manual testing.
