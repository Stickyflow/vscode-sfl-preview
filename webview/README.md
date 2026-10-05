# `webview/`: preview webview modules

Browser **ES modules** that run *inside* the preview webview (not the extension
host). Authored in TypeScript, compiled by `tsconfig.webview.json` to
`media/webview/*.js` (git-ignored, like `media/stickyflow/`). The only inline
script left in `src/getWebviewHtml.ts` is a bootstrap: it imports stickyflow.js's
`interaction` and core modules as namespaces and passes them to `startPreview()`
in `main.ts`.

Rules for anything in here:

- **No `vscode`, no Node built-ins, no runtime `stickyflow` import.** These run
  in the webview sandbox. stickyflow.js reaches the modules only as the
  `InteractionApi` / `CoreApi` objects `startPreview()` receives; its types come
  from `stickyflow.ts`, which re-exports them from the copied `.d.ts` files.
  That keeps a renamed or removed export a compile error.
- **Talk to the host only through `HostPort`** (`host.ts`), which owns the
  `sfl/*` message shapes. Never call `postMessage` directly.
- **Change the SFL text only through the document session** (`session.ts`):
  `commit()` for canvas edits, `receive()` for edits from the host.
- **Relative imports need the `.js` extension** (`./linkRoute.js`): the
  browser loads these as-is; `tsconfig.webview.json` (`moduleResolution:
  bundler`) resolves the `.js` specifier back to the `.ts` source for
  type-checking but does not rewrite it.
- Keep the DOM glue thin and factor the real logic into pure functions: that
  is what the `webview/__tests__/` vitest suites cover (node env, no DOM).
  End-to-end wiring is checked by `npm run verify:webview` (real headless
  Chrome, driving the actual generated HTML).

## Modules

| File | Purpose |
| --- | --- |
| `main.ts` | `startPreview()`: the composition root. Creates the host port and document session, binds every feature to the viewer, routes `sfl/update` / `sfl/select` from the host. Waits for a viewer if the first text didn't render. |
| `stickyflow.ts` | Type-only port to stickyflow.js (`InteractionApi`, `CoreApi`, `Viewer`, event types). |
| `host.ts` | `HostPort` and the `sfl/*` message types, both directions. |
| `session.ts` | `DocumentSession` (current text, `commit` / `receive`, canvas objects, fresh ids) and the `PreviewContext` every feature gets. |
| `editMode.ts` | The "Editing" toggle: owns the `bindEditing()` session, hides the edit-only canvas affordances while off, notifies the other features. |
| `editActions.ts` | Edit gestures to SFL patches: text, move (batched, nested moves dropped), resize, reconnect, properties, sankey, delete, the "+" bubbles (2D and isometric) and drag-a-bubble-onto-a-target links. |
| `addEntity.ts` | "+ Entity": a new shape linked below the selected one (or the last one added). |
| `linkTool.ts` | "+ Link": click source, click target. Links for 2D objects, face-attached Connections for cubes. |
| `routeButton.ts` | "Route:": cycles the selected link's routing. |
| `selectionSync.ts` | Canvas <-> editor selection sync without echo loops. |
| `exportDiagram.ts` | SVG / PNG export via stickyflow.js's static `render()`. |
| `placement.ts` | Pure: where new 2D objects land, their default size and style, which roles can be linked. |
| `isometric.ts` | Pure: isometric geometry for cube copies and Connection faces. |
| `moves.ts` | Pure: drop moves of children whose container moves too; batch a gesture's events into one edit. |
| `ids.ts` | Pure: fresh `<prefix>_<n>` block ids. |
| `linkRoute.ts` | `applyRouteChange(sfl, linkId, route)`: pure SFL text patch that forces one link's `route:`; `nextRoute()` for the toolbar's cycle button. stickyflow.js's `applyPropertyChange` could replace it once it indents a property it inserts into a multi-line block correctly. |
| `panControls.ts` | `bindPanControls(svg)`: canvas panning the viewer doesn't offer: middle-button drag, left-drag on empty background, plain scroll wheel (Shift = horizontal; Ctrl/Cmd wheel still zooms), and a `grab`/`grabbing` cursor. Each gesture is fed to the viewer's own Ctrl-drag pan path as synthetic pointer events, so its `ViewportController` stays authoritative and zoom / `getViewport()` are unaffected. |
