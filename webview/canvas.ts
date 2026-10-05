// The canvas color a style template writes into the document. vscode-sfl's
// "Apply Style Template" adds a `Style tpl_canvas { fill: "..." }` that no
// block references; it only says what the page behind the diagram should
// look like. This preview paints it behind the viewer and uses it as the
// export background. Without one, the preview follows the VS Code theme.

import type { CoreApi } from './stickyflow.js';

export const CANVAS_STYLE = 'tpl_canvas';

type Block = ReturnType<CoreApi['parse']>['blocks'][number];

/** The `fill` of the document's `tpl_canvas` Style, or null. */
export function canvasColor(core: CoreApi, source: string): string | null {
  let blocks: Block[];
  try {
    blocks = core.parse(source).blocks;
  } catch {
    return null;
  }
  const style = findStyle(blocks);
  if (!style) return null;
  for (const entry of style.entries) {
    if (entry.type === 'property' && entry.property.key === 'fill' && entry.property.value.type === 'string') {
      return entry.property.value.value;
    }
  }
  return null;
}

/** Sets the page background the toolbar CSS reads (`--sf-canvas`). */
export function paintCanvas(color: string | null): void {
  if (color) document.documentElement.style.setProperty('--sf-canvas', color);
  else document.documentElement.style.removeProperty('--sf-canvas');
}

function findStyle(blocks: Block[]): Block | undefined {
  for (const block of blocks) {
    if (block.kind === 'Style' && block.name === CANVAS_STYLE) return block;
    const nested = findStyle(block.entries.flatMap((e) => (e.type === 'block' ? [e.block] : [])));
    if (nested) return nested;
  }
  return undefined;
}
