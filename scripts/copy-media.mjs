// Copies the prebuilt stickyflow.js web-component bundle (a self-contained
// IIFE that defines <stickyflow-diagram>) into media/ so the webview can load
// it as a plain <script src> with no bundler of its own. Requires
// packages/stickyflow.js to have been built first (`npm run build` there).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..', 'stickyflow.js', 'dist', 'stickyflow-diagram.global.js');
const destDir = path.resolve(here, '..', 'media');
const dest = path.join(destDir, 'stickyflow-diagram.global.js');

if (!existsSync(src)) {
  console.error(
    `[vscode-sfl-preview] Missing ${src}\n` +
    '[vscode-sfl-preview] Build stickyflow.js first: (cd ../stickyflow.js && npm run build)'
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[vscode-sfl-preview] copied stickyflow-diagram.global.js -> media/');
