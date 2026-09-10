// Real-browser smoke test for the preview webview's edit-mode gestures.
//
// `npm test` covers the pure logic (webview/linkRoute, webview/ownerDrag
// helpers). This drives the *actual* generated webview HTML — real CSP, the
// real stickyflow.js bundle, the real inline script — in headless Chrome:
// toggle edit mode, drag a frame / entity / table, cycle a link's route, and
// check the sfl/edit messages the webview posts back to the extension host.
//
// Not wired into `npm test` (it needs a local Chrome and is slower). Run it by
// hand after touching getWebviewHtml.ts or the webview/ modules:
//
//   npm run compile && npm run verify:webview
//
// Exits 0 on success, 1 on failure, 2 if no Chrome was found (treated as skip).

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, existsSync, statSync, createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['chrome'], { encoding: 'utf8' });
  if (which.status === 0) return which.stdout.trim().split(/\r?\n/)[0];
  return null;
}

const CHROME = findChrome();
if (!CHROME) {
  console.log('verify-webview: no Chrome found — skipping (set CHROME_PATH to run).');
  process.exit(2);
}

// --- build the real webview HTML from the compiled extension code -------------
const outHtml = join(root, 'out', 'getWebviewHtml.js');
if (!existsSync(outHtml)) {
  console.error('verify-webview: out/getWebviewHtml.js missing — run `npm run compile` first.');
  process.exit(1);
}
// getWebviewHtml.js does `import * as vscode`; feed it a stub via the resolver.
const vscodeStub = {
  Uri: {
    joinPath: (base, ...seg) => ({ p: [base.p ?? String(base), ...seg].join('/'), toString() { return this.p; } }),
    file: (p) => ({ p, toString() { return p; } }),
  },
};
const Module = require('node:module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'vscode') return 'vscode-stub';
  return origResolve.call(this, req, ...rest);
};
require.cache['vscode-stub'] = { id: 'vscode-stub', filename: 'vscode-stub', loaded: true, exports: vscodeStub };

const { getWebviewHtml } = require(outHtml);

const SFL = `sfl 1.2

Style Box { shape: rounded_rectangle; fill: "#e0f2fe"; stroke: "#0369a1" }

Model M {
  Container grp {
    kind: frame
    text: "Group"
    layout { position: 40, 40; size: 360, 240 }
    Entity a : Box { kind: process; text: "A"; layout { position: 40, 60; size: 160, 70 } }
    Entity b : Box { kind: process; text: "B"; layout { position: 40, 150; size: 160, 70 } }
  }
  Entity solo : Box { kind: process; text: "S"; layout { position: 480, 60; size: 160, 70 } }
  Table tab { columns: ["x", "y"]; layout { position: 480, 240; size: 220, 120 } }
  Link e { from: a, right (0.5); to: solo, left (0.5) }
}
`;

const webview = {
  cspSource: 'http://127.0.0.1:*',
  asWebviewUri: (uri) => {
    const s = String(uri.p ?? uri).replace(/\\/g, '/');
    const i = s.indexOf('/media/');
    return { toString() { return i >= 0 ? s.slice(i) : s; } };
  },
};
let html = getWebviewHtml(webview, { p: root, toString() { return root; } }, SFL);
const nonce = (html.match(/nonce-([A-Za-z0-9]+)/) || [])[1];
html = html.replace(
  '</head>',
  `<script nonce="${nonce}">window.acquireVsCodeApi=()=>({postMessage:m=>{(window.__posted=window.__posted||[]).push(m)},getState(){},setState(){}})</script></head>`,
);

// --- serve media + html -----------------------------------------------------
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.map': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  const fsPath = join(root, url.slice(1));
  if (!fsPath.startsWith(join(root, 'media')) || !existsSync(fsPath) || !statSync(fsPath).isFile()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(fsPath)] || 'application/octet-stream' });
  createReadStream(fsPath).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// --- drive Chrome over the DevTools protocol -------------------------------
const profile = mkdtempSync(join(tmpdir(), 'sfl-verify-'));
const dport = 9200 + Math.floor(Math.random() * 700);
const chrome = spawn(
  CHROME,
  ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
const wsUrl = await (async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${dport}/json`)).json();
      const pageTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTarget) return pageTarget.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Chrome did not expose a page target');
})();

const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    logs.push('PAGE EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await new Promise((r) => setTimeout(r, 3000));

const probe = `(async () => {
  const el = document.getElementById('diagram');
  const svg = () => el.viewer.svg;
  const posted = () => window.__posted || [];
  const lastEdit = () => [...posted()].reverse().find(m => m && m.type === 'sfl/edit');
  const pos = (src, id) => {
    const m = src && src.match(new RegExp('(?:Entity|Container|Table)\\\\s+' + id + '\\\\b[\\\\s\\\\S]*?position:\\\\s*([\\\\-0-9.]+),\\\\s*([\\\\-0-9.]+)'));
    return m ? [+m[1], +m[2]] : null;
  };
  const size = (src, id) => {
    const m = src && src.match(new RegExp('(?:Entity|Container|Table)\\\\s+' + id + '\\\\b[\\\\s\\\\S]*?size:\\\\s*([\\\\-0-9.]+),\\\\s*([\\\\-0-9.]+)'));
    return m ? [+m[1], +m[2]] : null;
  };
  const o = (x, y) => ({ clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true });
  async function drag(id, tox, toy) {
    const s = svg();
    const n = s.querySelector('[data-sf-id="' + id + '"][data-sf-primary]');
    const r = n.getBoundingClientRect(), sr = s.getBoundingClientRect();
    n.dispatchEvent(new PointerEvent('pointerdown', o(r.left + r.width / 2, r.top + r.height / 2)));
    await new Promise(r => setTimeout(r, 15));
    n.dispatchEvent(new PointerEvent('pointermove', o(r.left + r.width / 2 + 12, r.top + r.height / 2 + 12)));
    await new Promise(r => setTimeout(r, 15));
    s.dispatchEvent(new PointerEvent('pointermove', o(sr.left + tox, sr.top + toy)));
    await new Promise(r => setTimeout(r, 15));
    s.dispatchEvent(new PointerEvent('pointerup', o(sr.left + tox, sr.top + toy)));
    await new Promise(r => setTimeout(r, 60));
  }
  // Grab a selected owner's bottom-right resize handle and drag it by (dx, dy)
  // screen px. Requires the owner to already be selected (handles are painted
  // by the selection overlay).
  async function resizeBR(id, dx, dy) {
    const s = svg();
    const handle = s.querySelector('[data-sf-selection-overlay="' + id + '"] [data-sf-resize-handle="bottom-right"]');
    if (!handle) return 'no bottom-right handle for ' + id;
    const r = handle.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    handle.dispatchEvent(new PointerEvent('pointerdown', o(cx, cy)));
    await new Promise(r => setTimeout(r, 15));
    handle.dispatchEvent(new PointerEvent('pointermove', o(cx + 8, cy + 8)));
    await new Promise(r => setTimeout(r, 15));
    s.dispatchEvent(new PointerEvent('pointermove', o(cx + dx, cy + dy)));
    await new Promise(r => setTimeout(r, 15));
    s.dispatchEvent(new PointerEvent('pointerup', o(cx + dx, cy + dy)));
    await new Promise(r => setTimeout(r, 60));
    return null;
  }

  // --- panning (works outside edit mode) --------------------------------
  const viewBox = () => (svg().getAttribute('viewBox') || '').split(/\\s+/).map(Number);
  const p = (x, y, button) => ({ clientX: x, clientY: y, button, buttons: button === 1 ? 4 : 1, bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true });
  async function panDrag(button, dx, dy) {
    const sr = svg().getBoundingClientRect();
    const x0 = sr.left + 8, y0 = sr.top + 8; // top-left corner: empty background
    svg().dispatchEvent(new PointerEvent('pointerdown', p(x0, y0, button)));
    await new Promise(r => setTimeout(r, 15));
    svg().dispatchEvent(new PointerEvent('pointermove', p(x0 + dx * 0.5, y0 + dy * 0.5, button)));
    await new Promise(r => setTimeout(r, 15));
    svg().dispatchEvent(new PointerEvent('pointermove', p(x0 + dx, y0 + dy, button)));
    await new Promise(r => setTimeout(r, 15));
    svg().dispatchEvent(new PointerEvent('pointerup', p(x0 + dx, y0 + dy, button)));
    await new Promise(r => setTimeout(r, 40));
  }
  const cursorIdle = svg().style.cursor;
  const vbBefore = viewBox();
  await panDrag(1, 120, 60); // middle-button drag
  const vbAfterMiddle = viewBox();
  await panDrag(0, -90, 40); // left-drag on empty background
  const vbAfterLeft = viewBox();
  const cursorAfterPan = svg().style.cursor;
  svg().dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 80, bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  await new Promise(r => setTimeout(r, 40));
  const vbAfterWheel = viewBox();
  // regression: after panning, a plain click still selects a shape
  const soloNode = svg().querySelector('[data-sf-id="solo"][data-sf-primary]');
  const snr = soloNode.getBoundingClientRect();
  soloNode.dispatchEvent(new PointerEvent('pointerdown', p(snr.left + snr.width / 2, snr.top + snr.height / 2, 0)));
  soloNode.dispatchEvent(new PointerEvent('pointerup', p(snr.left + snr.width / 2, snr.top + snr.height / 2, 0)));
  await new Promise(r => setTimeout(r, 40));
  const selectionAfterPan = el.viewer.getSelection().map(o => o.id);
  el.viewer.select([]);

  document.getElementById('sf-toggle-edit').click();
  await new Promise(r => setTimeout(r, 40));

  const start = {
    grp: pos(el.source, 'grp'), solo: pos(el.source, 'solo'), tab: pos(el.source, 'tab'),
    grpSize: size(el.source, 'grp'), tabSize: size(el.source, 'tab'),
  };
  await drag('grp', 520, 420);
  const afterFrame = { grp: pos(lastEdit()?.source, 'grp'), childA: pos(lastEdit()?.source, 'a') };
  await drag('solo', 720, 520);
  const afterEntity = pos(lastEdit()?.source, 'solo');
  await drag('tab', 250, 620);
  const afterTable = pos(lastEdit()?.source, 'tab');

  // Resize: select the frame, drag its bottom-right handle out; then the table.
  el.viewer.select(['grp']);
  await new Promise(r => setTimeout(r, 40));
  const resizeFrameErr = await resizeBR('grp', 120, 90);
  const afterFrameResize = size(lastEdit()?.source, 'grp');
  el.viewer.select(['tab']);
  await new Promise(r => setTimeout(r, 40));
  const resizeTableErr = await resizeBR('tab', 80, 60);
  const afterTableResize = size(lastEdit()?.source, 'tab');

  el.viewer.select(['e']);
  await new Promise(r => setTimeout(r, 40));
  const rb = document.getElementById('sf-link-route');
  const routeBtn = { hidden: rb.hidden, label: rb.textContent };
  rb.click();
  await new Promise(r => setTimeout(r, 60));
  const route1 = (lastEdit()?.source.match(/Link e \\{[^}]*\\}/) || [''])[0];
  rb.click();
  await new Promise(r => setTimeout(r, 60));
  const route2 = (lastEdit()?.source.match(/Link e \\{[^}]*\\}/) || [''])[0];

  return { start, afterFrame, afterEntity, afterTable,
    afterFrameResize, afterTableResize, resizeFrameErr, resizeTableErr,
    routeBtn, route1, route2,
    pan: { cursorIdle, cursorAfterPan, vbBefore, vbAfterMiddle, vbAfterLeft, vbAfterWheel, selectionAfterPan },
    edits: posted().filter(m => m && m.type === 'sfl/edit').length,
    warns: posted().filter(m => m && m.type === 'sfl/warn').map(m => m.message) };
})()`;

const evalResult = await send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true });
const out = evalResult.result?.value;
if (evalResult.exceptionDetails) {
  logs.push('PROBE THREW: ' + (evalResult.exceptionDetails.exception?.description || evalResult.exceptionDetails.text));
}

ws.close();
chrome.kill();
server.close();

console.log(JSON.stringify(out, null, 2));

const fail = [];
const moved = (a, b) => a && b && (a[0] !== b[0] || a[1] !== b[1]);
if (logs.length) fail.push('page errors: ' + logs.join(' | '));
if (!out || !out.start) {
  fail.push('no usable result from page');
} else {
  if (!moved(out.start.grp, out.afterFrame?.grp)) fail.push('frame did not move: ' + JSON.stringify(out.afterFrame?.grp));
  if (JSON.stringify(out.afterFrame?.childA) !== JSON.stringify([40, 60])) fail.push('frame child position changed in text (should be relative): ' + JSON.stringify(out.afterFrame?.childA));
  if (!moved(out.start.solo, out.afterEntity)) fail.push('entity did not move');
  if (!moved(out.start.tab, out.afterTable)) fail.push('table did not move');
  if (out.resizeFrameErr) fail.push('frame resize: ' + out.resizeFrameErr);
  if (!moved(out.start.grpSize, out.afterFrameResize)) fail.push('frame did not resize: ' + JSON.stringify(out.afterFrameResize));
  if (out.resizeTableErr) fail.push('table resize: ' + out.resizeTableErr);
  if (!moved(out.start.tabSize, out.afterTableResize)) fail.push('table did not resize: ' + JSON.stringify(out.afterTableResize));
  if (out.routeBtn?.hidden) fail.push('route button hidden with a link selected');
  if (!/route:\s*(orthogonal|curved|straight)/.test(out.route1 || '')) fail.push('route not patched on 1st click: ' + out.route1);
  if (out.route1 === out.route2) fail.push('route did not change on 2nd click');
  if (out.warns?.length) fail.push('unexpected warnings: ' + out.warns.join(' | '));
  if ((out.edits ?? 0) < 7) fail.push('expected >= 7 sfl/edit messages, got ' + out.edits);

  const pan = out.pan || {};
  const vbMoved = (a, b) => a && b && a.length === 4 && (a[0] !== b[0] || a[1] !== b[1]);
  if (pan.cursorIdle !== 'grab') fail.push('idle canvas cursor is "' + pan.cursorIdle + '", expected "grab"');
  if (!vbMoved(pan.vbBefore, pan.vbAfterMiddle)) fail.push('middle-drag did not pan: ' + JSON.stringify([pan.vbBefore, pan.vbAfterMiddle]));
  if (!vbMoved(pan.vbAfterMiddle, pan.vbAfterLeft)) fail.push('left-drag on background did not pan: ' + JSON.stringify([pan.vbAfterMiddle, pan.vbAfterLeft]));
  if (!vbMoved(pan.vbAfterLeft, pan.vbAfterWheel)) fail.push('scroll wheel did not pan: ' + JSON.stringify([pan.vbAfterLeft, pan.vbAfterWheel]));
  if (pan.cursorAfterPan !== 'grab') fail.push('cursor stuck at "' + pan.cursorAfterPan + '" after panning, expected "grab"');
  if (JSON.stringify(pan.selectionAfterPan) !== JSON.stringify(['solo'])) fail.push('click-to-select broken after panning: ' + JSON.stringify(pan.selectionAfterPan));
}
if (fail.length) {
  console.error('\nverify-webview FAILED:\n - ' + fail.join('\n - '));
  process.exit(1);
}
console.log('\nverify-webview: OK (pan: middle-drag / bg-drag / wheel + grab cursor; frame/entity/table drag; frame/table resize; link route cycle)');
process.exit(0);
