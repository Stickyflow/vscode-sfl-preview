// Copies the stickyflow.js dist/ tree from the pinned `stickyflow` npm
// package (devDependency) into media/stickyflow/ so the
// webview can load it with no bundler of its own: the IIFE
// (stickyflow-diagram.global.js, a plain <script src>) for the
// <stickyflow-diagram> custom element, the ESM `interaction` tier
// (dist/interaction/index.js) for edit-mode, and the ESM core
// (dist/index.js, `render()`) used for SVG/PNG export — all loaded as
// <script type="module"> imports. The whole tree is copied (not just those
// files) because they import shared chunk-*.js siblings by relative path —
// cherry picking files would silently break those imports. The version is
// whatever package.json pins, so `npm install` is all a build needs.
import { cpSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..', 'node_modules', 'stickyflow');
const srcDir = path.join(pkgDir, 'dist');
const destDir = path.resolve(here, '..', 'media', 'stickyflow');

if (!existsSync(srcDir)) {
  console.error(`[vscode-sfl-preview] Missing ${srcDir}\n[vscode-sfl-preview] Run npm install first.`);
  process.exit(1);
}

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
cpSync(srcDir, destDir, { recursive: true });

// Which stickyflow.js this build was made from: it shows up in the build log,
// and media/stickyflow/SOURCE.json answers "which stickyflow.js is this .vsix
// running?" later.
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
const source = { version, from: 'npm' };
writeFileSync(path.join(destDir, 'SOURCE.json'), JSON.stringify(source, null, 2) + '\n');
console.log(`[vscode-sfl-preview] copied stickyflow ${version} (npm) dist -> media/stickyflow/`);

// Inter, the font every style template sets (and stickyflow.js's default
// fontFamily starts with). Bundled so the preview and its exports look the
// same on machines without Inter installed. Only the subsets
// src/getWebviewHtml.ts declares (INTER_FACES), plus the OFL license.
const interDir = path.resolve(here, '..', 'node_modules', '@fontsource-variable', 'inter');
const fontsDir = path.resolve(here, '..', 'media', 'fonts');
rmSync(fontsDir, { recursive: true, force: true });
mkdirSync(fontsDir, { recursive: true });
for (const file of ['inter-latin-wght-normal.woff2', 'inter-latin-ext-wght-normal.woff2']) {
  cpSync(path.join(interDir, 'files', file), path.join(fontsDir, file));
}
cpSync(path.join(interDir, 'LICENSE'), path.join(fontsDir, 'Inter-LICENSE.txt'));
console.log('[vscode-sfl-preview] copied Inter (latin, latin-ext) -> media/fonts/');
