# `webview/` — preview webview client modules

Browser **ES modules** that run *inside* the preview webview (not the extension
host). Authored in TypeScript, compiled by `tsconfig.webview.json` to
`media/webview/*.js` (git-ignored, like `media/stickyflow/`), and loaded by the
inline module script in `src/getWebviewHtml.ts`.

Rules for anything in here:

- **No `vscode`, no Node built-ins, no `stickyflow` import.** These run in the
  webview sandbox. Talk to the host only via the `sfl/*` `postMessage`
  protocol, which the inline script owns.
- Keep the DOM glue thin and factor the real logic into pure functions — that
  is what the `webview/__tests__/` vitest suites cover (node env, no DOM).
  End-to-end wiring is checked by `npm run verify:webview` (real headless
  Chrome, driving the actual generated HTML).

## Modules

| File | Purpose |
| --- | --- |
| `linkRoute.ts` | `applyRouteChange(sfl, linkId, route)` — pure SFL text patch that forces one link's `route:` (orthogonal / curved / straight); `nextRoute()` for the toolbar's cycle button. stickyflow.js exports the specific `apply*Change` patchers but no generic property setter, so this one lives here. |
| `ownerDrag.ts` | `bindOwnerDrag(svg, opts)` — drag-to-move for `frame` / `swimlane` / `table` / `chart`. stickyflow.js's `bindEditing()` move session bails unless the grabbed element is `role === 'entity'`, yet its pure `applyMoveChange` patcher rewrites any block's `layout { position }` by id. This binds the missing gesture for exactly those roles and reports it as `{ owner, dx, dy }` — the same shape as `MoveChangeEvent` — so the host feeds it straight to `applyMoveChange`. |
