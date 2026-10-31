// Where canvas-created 2D objects land, and what they look like. Pure, no DOM.

import type { CanvasObject, Side } from './stickyflow.js';

/** Roles a canvas-drawn link may connect. Narrower than SFL's own linkable
 *  set on purpose: Path and Chart are valid `to:` targets in the language,
 *  but the link router only draws a clean edge to a rectangular owner, so
 *  linking to one from the canvas leaves a stub ending mid-shape. Link those
 *  by editing the SFL. Frame/swimlane are Container render roles. */
export const LINKABLE_ROLES: readonly string[] = ['shape', 'frame', 'swimlane', 'table'];

export const isLinkable = (role: string): boolean => LINKABLE_ROLES.includes(role);

/** Default new-entity footprint. stickyflow.js has no shared constant for
 *  it, so this is a generic size in the same ballpark as rendered shapes. */
export const NEW_ENTITY_SIZE = { width: 160, height: 80 };

/** A new entity has no Style reference, and the renderer leaves an unset
 *  fill/stroke transparent with near-black text: an invisible box on VS
 *  Code's dark theme. White fill, the selection blue as stroke, dark text
 *  keeps it readable on either theme. */
export const NEW_ENTITY_STYLE = [
  'style {',
  '    fill: "#FFFFFF"',
  '    stroke: "#2563eb"',
  '    textColor: "#111827"',
  '}',
].join('\n');

/** Gap between an object and the copy a "+" bubble creates next to it. */
export const DUPLICATE_GAP = 40;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A copy of `source` placed one full length plus a gap away on `side`. */
export function besideBox(source: CanvasObject, side: Side): Box {
  const width = source.width || NEW_ENTITY_SIZE.width;
  const height = source.height || NEW_ENTITY_SIZE.height;
  let { x, y } = source;
  if (side === 'right') x += width + DUPLICATE_GAP;
  else if (side === 'left') x -= width + DUPLICATE_GAP;
  else if (side === 'bottom') y += height + DUPLICATE_GAP;
  else y -= height + DUPLICATE_GAP;
  return { x, y, width, height };
}

/** "+ Entity" below an anchor: horizontally centered under it. */
export function belowBox(anchor: CanvasObject): Box {
  const anchorWidth = anchor.width || NEW_ENTITY_SIZE.width;
  const anchorHeight = anchor.height || NEW_ENTITY_SIZE.height;
  return {
    x: anchor.x + anchorWidth / 2 - NEW_ENTITY_SIZE.width / 2,
    y: anchor.y + anchorHeight + 60,
    ...NEW_ENTITY_SIZE,
  };
}

/** "+ Entity" with nothing to anchor to: centered in the visible viewport. */
export function centeredBox(viewport: { x: number; y: number; w: number; h: number }): Box {
  return {
    x: viewport.x + viewport.w / 2 - NEW_ENTITY_SIZE.width / 2,
    y: viewport.y + viewport.h / 2 - NEW_ENTITY_SIZE.height / 2,
    ...NEW_ENTITY_SIZE,
  };
}
