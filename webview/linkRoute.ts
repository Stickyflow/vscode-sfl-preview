// Compiled to media/webview/linkRoute.js (tsconfig.webview.json) and loaded by
// the preview webview as a browser ES module. Runs in the webview sandbox, so
// it stays dependency-free — no `vscode`, no Node built-ins, no `stickyflow`
// import (the package exports the specific apply*Change patchers but no generic
// property setter, so the one below is written here).
//
// Pure SFL text patch: force a single link's routing style. Everything else in
// the document — comments, formatting, unrelated blocks, the link's other
// properties — is left byte-for-byte untouched, the same contract as
// stickyflow.js's own patchSfl functions.

/** SFL's three link routing styles, in the order the toolbar's Route button
 *  cycles them. Matches PATH_TYPES in stickyflow.js (renderInput/fromSfl). */
export const ROUTES = ['orthogonal', 'curved', 'straight'] as const;

export type Route = (typeof ROUTES)[number];

export function isRoute(value: string | null | undefined): value is Route {
  return value === 'orthogonal' || value === 'curved' || value === 'straight';
}

/** Next routing style after `current`, wrapping around. An unknown/absent
 *  current (a link inheriting its route from a Style, or none at all) starts
 *  the cycle at the first entry. */
export function nextRoute(current: string | null | undefined): Route {
  const index = ROUTES.indexOf(current as Route);
  return ROUTES[(index + 1) % ROUTES.length];
}

/** A copy of `sfl` with every `"…"` string body and `// …` line comment
 *  replaced by spaces. Same length as the input, so an index into the mask is
 *  also an index into the original — structural scanning happens on the mask,
 *  edits land on the original. */
function maskInert(sfl: string): string {
  let out = '';
  let inString = false;
  let inComment = false;
  for (let i = 0; i < sfl.length; i++) {
    const ch = sfl[i];
    if (inComment) {
      out += ch === '\n' ? '\n' : ' ';
      if (ch === '\n') inComment = false;
      continue;
    }
    if (inString) {
      if (ch === '\\' && i + 1 < sfl.length) {
        out += '  ';
        i++;
      } else if (ch === '"') {
        out += '"';
        inString = false;
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (ch === '"') {
      out += '"';
      inString = true;
    } else if (ch === '/' && sfl[i + 1] === '/') {
      out += '  ';
      i++;
      inComment = true;
    } else {
      out += ch;
    }
  }
  return out;
}

interface LinkSpan {
  /** index of the `{` that opens the block */
  open: number;
  /** index of the matching `}` */
  close: number;
  /** leading whitespace of the line the `Link` header sits on */
  indent: string;
  /** true when `{ … }` contains no newline */
  singleLine: boolean;
}

function findLinkSpan(masked: string, linkId: string): LinkSpan | null {
  const header = new RegExp(`(^|\\n)([ \\t]*)Link[ \\t]+${escapeId(linkId)}\\b`);
  const match = header.exec(masked);
  if (!match || match.index === undefined) {
    return null;
  }
  const indent = match[2];
  const open = masked.indexOf('{', match.index);
  if (open < 0) {
    return null;
  }
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') {
      depth++;
    } else if (masked[i] === '}') {
      depth--;
      if (depth === 0) {
        return { open, close: i, indent, singleLine: !masked.slice(open, i).includes('\n') };
      }
    }
  }
  return null;
}

function escapeId(id: string): string {
  return id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ROUTE_TOKEN = /route[ \t]*:[ \t]*([A-Za-z_][A-Za-z0-9_]*)/g;

/** Character range of the link's own `route: <value>` declaration (depth 1
 *  inside the block), or null if it has none. A `route:` nested in a
 *  `style { … }` sits at depth 2 and is skipped. */
function directRouteRange(masked: string, span: LinkSpan): { start: number; end: number } | null {
  let depth = 1;
  const depthAt: number[] = [];
  for (let i = span.open + 1; i < span.close; i++) {
    depthAt.push(depth);
    if (masked[i] === '{') depth++;
    else if (masked[i] === '}') depth--;
  }
  ROUTE_TOKEN.lastIndex = 0;
  for (let m = ROUTE_TOKEN.exec(masked); m; m = ROUTE_TOKEN.exec(masked)) {
    const start = m.index;
    const end = start + m[0].length;
    if (start <= span.open || end > span.close) {
      continue;
    }
    if (depthAt[start - (span.open + 1)] === 1) {
      return { start, end };
    }
  }
  return null;
}

/** Set `Link <id>`'s routing style to `route`. Returns the patched source, or
 *  the input unchanged if there is no such link or it already routes that way. */
export function applyRouteChange(sfl: string, linkId: string, route: Route): string {
  if (!isRoute(route)) {
    return sfl;
  }
  const masked = maskInert(sfl);
  const span = findLinkSpan(masked, linkId);
  if (!span) {
    return sfl;
  }

  const existing = directRouteRange(masked, span);
  let next: string;
  if (existing) {
    next = sfl.slice(0, existing.start) + `route: ${route}` + sfl.slice(existing.end);
  } else if (span.singleLine) {
    const head = sfl.slice(0, span.close).replace(/\s+$/, '');
    const separator = head.endsWith('{') ? ' ' : '; ';
    next = `${head}${separator}route: ${route} ${sfl.slice(span.close)}`;
  } else {
    const lineEnd = sfl.indexOf('\n', span.open);
    const at = lineEnd < 0 ? span.close : lineEnd + 1;
    // Match the existing siblings' indentation rather than assume a width —
    // SFL files in the wild mix 2- and 4-space nesting.
    const sibling = sfl.slice(at).match(/^([ \t]*)\S/);
    const childIndent = sibling ? sibling[1] : `${span.indent}  `;
    next = `${sfl.slice(0, at)}${childIndent}route: ${route}\n${sfl.slice(at)}`;
  }
  return next === sfl ? sfl : next;
}
