# `webview/` — preview webview client modules

Browser **ES modules** that run *inside* the preview webview (not the extension
host). Authored in TypeScript, compiled by `tsconfig.webview.json` to
`media/webview/*.js` (git-ignored, like `media/stickyflow/`), and loaded by the
inline module script in `src/getWebviewHtml.ts`.

Rules for anything in here:

- **No `vscode`, no Node built-ins, no `stickyflow` import.** These run in the
  webview sandbox. Talk to the host only via the `sfl/*` `postMessage`
  protocol, which the inline script owns.
- **Relative imports need the `.js` extension** (`./ownerGesture.js`) — the
  browser loads these as-is; `tsconfig.webview.json` (`moduleResolution:
  bundler`) resolves the `.js` specifier back to the `.ts` source for
  type-checking but does not rewrite it.
- Keep the DOM glue thin and factor the real logic into pure functions — that
  is what the `webview/__tests__/` vitest suites cover (node env, no DOM).
  End-to-end wiring is checked by `npm run verify:webview` (real headless
  Chrome, driving the actual generated HTML).

## Modules

| File | Purpose |
| --- | --- |
| `ownerGesture.ts` | Shared primitives for the supplemental gestures: `SUPPLEMENTAL_OWNER_ROLES` (`frame` / `swimlane` / `table` / `chart` — the roles stickyflow.js's own move **and** resize sessions hard-gate out), `ownerElementAt`, `cssEscape`, `pastThreshold`, `clientToUser` (screen → SFL user space via `getScreenCTM().inverse()`). |
| `linkRoute.ts` | `applyRouteChange(sfl, linkId, route)` — pure SFL text patch that forces one link's `route:` (orthogonal / curved / straight); `nextRoute()` for the toolbar's cycle button. stickyflow.js exports the specific `apply*Change` patchers but no generic property setter, so this one lives here. |
| `ownerDrag.ts` | `bindOwnerDrag(svg, opts)` — drag-to-move for the supplemental roles. Reports `{ owner, dx, dy }` (the shape of `MoveChangeEvent`) so the host feeds it straight to `applyMoveChange`. A frame drag carries its child entities in the live preview. |
| `ownerResize.ts` | `bindOwnerResize(svg, opts)` — drag-to-resize for the supplemental roles, off the resize handles the viewer's selection overlay already paints for every non-link shape. `resizedBounds()` mirrors stickyflow.js's own entity-resize math (grabbed corner follows the pointer, opposite corner fixed, `MIN_SIZE` clamp). Reports absolute `{ owner, x, y, width, height, dx, dy, dWidth, dHeight }` (the shape of `ResizeChangeEvent`) for `applyResizeChange`. |
| `panControls.ts` | `bindPanControls(svg)` — canvas panning the viewer doesn't offer: middle-button drag, left-drag on empty background, plain scroll wheel (Shift = horizontal; Ctrl/Cmd wheel still zooms), and a `grab`/`grabbing` cursor. Each gesture is fed to the viewer's own Ctrl-drag pan path as synthetic pointer events, so its `ViewportController` stays authoritative and zoom / `getViewport()` are unaffected. |
