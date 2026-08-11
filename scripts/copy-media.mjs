// Copies the prebuilt stickyflow.js dist/ tree into media/stickyflow/ so the
// webview can load it with no bundler of its own: the IIFE
// (stickyflow-diagram.global.js, a plain <script src>) for the
// <stickyflow-diagram> custom element, the ESM `interaction` tier
// (dist/interaction/index.js) for edit-mode, and the ESM core
// (dist/index.js, `render()`) used for SVG/PNG export — all loaded as
// <script type="module"> imports. The whole tree is copied (not just those
// files) because they import shared chunk-*.js siblings by relative path —
// cherry picking files would silently break those imports. Requires
// stickyflow.js (repo root, sibling of vscode-extensions/) to have been
// built first (`npm run build` there).
import { cpSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> vscode-sfl-preview/ -> vscode-extensions/ -> repo root -> stickyflow.js/dist
const srcDir = path.resolve(here, '..', '..', '..', 'stickyflow.js', 'dist');
const destDir = path.resolve(here, '..', 'media', 'stickyflow');

if (!existsSync(srcDir)) {
  console.error(
    `[vscode-sfl-preview] Missing ${srcDir}\n` +
    '[vscode-sfl-preview] Build stickyflow.js first: (cd ../../stickyflow.js && npm run build)'
  );
  process.exit(1);
}

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });
console.log('[vscode-sfl-preview] copied stickyflow.js/dist -> media/stickyflow/');
