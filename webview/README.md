# `webview/` — preview webview client modules

Browser **ES modules** that run *inside* the preview webview (not the extension
host). Authored in TypeScript, compiled by `tsconfig.webview.json` to
`media/webview/*.js` (git-ignored, like `media/stickyflow/`), and loaded by the
inline module script in `src/getWebviewHtml.ts`.

Rules for anything in here:

- **No `vscode`, no Node built-ins, no `stickyflow` import.** These run in the
  webview sandbox. Talk to the host only via the `sfl/*` `postMessage`
  protocol, which the inline script owns.
- **Relative imports need the `.js` extension** (`./linkRoute.js`) — the
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
| `linkRoute.ts` | `applyRouteChange(sfl, linkId, route)` — pure SFL text patch that forces one link's `route:` (orthogonal / curved / straight); `nextRoute()` for the toolbar's cycle button. stickyflow.js exports the specific `apply*Change` patchers but no generic property setter, so this one lives here. |
| `panControls.ts` | `bindPanControls(svg)` — canvas panning the viewer doesn't offer: middle-button drag, left-drag on empty background, plain scroll wheel (Shift = horizontal; Ctrl/Cmd wheel still zooms), and a `grab`/`grabbing` cursor. Each gesture is fed to the viewer's own Ctrl-drag pan path as synthetic pointer events, so its `ViewportController` stays authoritative and zoom / `getViewport()` are unaffected. |
