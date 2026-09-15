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
  panel. Ctrl/Cmd+scroll also zooms directly on the canvas — the toolbar
  buttons are there because that's not obvious at a glance.
- **Panning** — middle-button drag, drag on an empty part of the canvas, or
  just scroll the wheel (Shift for horizontal). A grab cursor shows over the
  background. Ctrl/Cmd+drag still pans too. Works whether or not edit mode
  is on.
- **Editing: Off/On** — toggles edit mode. When on, you can drag any shape to
  move it — entities, and also **frames, swimlanes, tables and charts**
  (dragging a frame carries its contents) — select a shape and drag a corner
  handle to **resize** it (entities *and* frames/swimlanes/tables/charts),
  double-click to edit text, drag a link's endpoint to reconnect it, and press
  Delete/Backspace on a selection to remove it.
  Each change is turned into new SFL text (via stickyflow.js's
  `stickyflow/interaction` patchers — plus this extension's `webview/`
  modules for moving and resizing frames/tables/charts) and written back into
  the real document as a normal edit — so it's on the undo stack (Ctrl+Z)
  like anything you'd type by hand. Off by default so panning/selecting in
  the preview never risks mutating the file.
- **+ Entity / + Link** — insert a new entity centered on the current
  viewport, or connect two existing entities with a new link (arm the
  button, click a source, click a target; Escape cancels). Both use
  `insertEntity`/`insertLink` from `stickyflow/interaction` and switch edit
  mode on automatically, so a new entity/link is immediately draggable and
  its text editable the same way as anything else on the canvas.
- **Route:** *(edit mode, with a link selected)* — cycles that link's routing
  style: orthogonal → curved → straight. Writes a `route:` on the link's own
  SFL block, overriding whatever it inherits from a `Style`.
- **Export SVG / Export PNG** — save the diagram to a file. Both re-render
  the current document at its natural bounds (via stickyflow.js's `render()`
  core), not a snapshot of whatever's currently panned/zoomed into view, so
  the export always captures the whole diagram. PNG is rasterized client-side
  through an offscreen canvas at 2x for a crisp result. A native save dialog
  opens, defaulting to the `.sfl` file's own folder and name.

Clicking a shape or link also reveals/selects its block in the text editor
(and moving the cursor in the editor selects the corresponding shape on the
canvas) — selection stays in sync in both directions, independent of edit
mode.

When an update arrives from outside this webview — you typed an edit in the
text editor, or the file changed on disk some other way — the shapes that
were actually added or changed briefly flash an amber outline, so it's
visually obvious exactly what an edit touched (and, just as importantly,
what it didn't). This is deliberately scoped to *incoming* changes only:
your own drags/resizes/creates in edit mode never flash, since you already
just watched those happen.

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
npm run compile   # copy-media, then tsc (extension host), then tsc (webview/ -> media/webview/)
```

`npm run compile` does three things: copy stickyflow.js's `dist/` into
`media/stickyflow/`, compile the extension host (`src/` -> `out/`), and
compile the webview client modules (`webview/` -> `media/webview/`, via
`tsconfig.webview.json`). `npm run watch` does the first two once and then
watches the host; re-run `npm run compile` (or `npm run watch:webview`) after
editing anything under `webview/`.

Press F5 in VS Code (with this folder open) to launch an Extension
Development Host for manual testing.

### Tests

- `npm test` — vitest, pure logic: the SFL text patchers and the
  drag/resize-geometry helpers (`src/**/__tests__`, `webview/__tests__`). No
  browser needed.
- `npm run verify:webview` — end-to-end smoke test in real headless Chrome:
  builds the actual webview HTML, then pans (middle-drag, background-drag,
  wheel) and checks the grab cursor, toggles edit mode, drags a frame /
  entity / table, resizes the frame and table off their handles, cycles a
  link's route, and checks the `sfl/edit` messages posted back. Needs a local
  Chrome (`CHROME_PATH` to point at a non-standard one); exits 2 (skip) if
  none is found. Run it after touching `getWebviewHtml.ts` or `webview/`.
