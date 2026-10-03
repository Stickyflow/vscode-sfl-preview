// Lightweight, read-only line/brace-depth scanner used only for selection
// sync (reveal-in-editor when a shape is clicked in the preview; select-in-
// canvas when the cursor moves in the editor). Deliberately NOT shared with
// stickyflow.js's own `patchSfl.ts`, which does the same kind of brace-depth
// walk to apply real text mutations: this extension's Node-side (extension
// host) code has no dependency on the `stickyflow` package today — the
// webview loads it as prebuilt static assets copied by
// scripts/copy-media.mjs, precisely so the extension host itself stays
// dependency-free — and an approximate reveal location doesn't carry the
// same correctness bar as a patch that rewrites the document, so a small
// self-contained scanner is a better fit here than adding a build-time
// dependency for it.
// `Shape` is the current leaf keyword; `Entity` is its still-accepted alias.
const OWNER_HEADER = /^\s*(Shape|Entity|Container|Table|Link)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;

function stripStringsAndComments(line: string): string {
  return line.replace(/\/\/.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

function blockEndLine(lines: string[], startLine: number): number {
  let depth = 0;
  for (let j = startLine; j < lines.length; j++) {
    for (const ch of stripStringsAndComments(lines[j])) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return j;
      }
    }
  }
  return lines.length - 1;
}

export interface LineRange {
  start: number;
  end: number;
}

interface OwnerBlock {
  id: string;
  range: LineRange;
}

function collectOwnerBlocks(lines: string[]): OwnerBlock[] {
  const blocks: OwnerBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OWNER_HEADER);
    if (!m) continue;
    blocks.push({ id: m[2], range: { start: i, end: blockEndLine(lines, i) } });
  }
  return blocks;
}

/** The full line range of the top-level Shape/Entity/Container/Table/Link block named `id`. */
export function findOwnerRange(lines: string[], id: string): LineRange | null {
  return collectOwnerBlocks(lines).find(b => b.id === id)?.range ?? null;
}

/** The id of the innermost Shape/Entity/Container/Table/Link block containing `line`
 *  — for nested blocks (e.g. an Entity inside a Container), the one with the
 *  latest start line among all enclosing ranges is the innermost. */
export function findEnclosingOwnerId(lines: string[], line: number): string | null {
  let best: OwnerBlock | null = null;
  for (const block of collectOwnerBlocks(lines)) {
    if (line < block.range.start || line > block.range.end) continue;
    if (!best || block.range.start > best.range.start) best = block;
  }
  return best?.id ?? null;
}
