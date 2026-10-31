// Isometric geometry for canvas-created cubes and Connections. Pure, no DOM.
// Isometric objects connect only to each other, through a face-attached
// Connection block rather than a Link: stickyflow.js routes a Connection
// between cube faces, and a 2D side/fraction means nothing on a cube.

import type { CanvasObject, IsometricFace } from './stickyflow.js';

export const ISOMETRIC_ROLE = 'isometric';

// Screen-space angle of the width and depth axes, matching
// isometricFaces() in stickyflow.js/src/model/isometricObject/geometry.ts
// (30° axes: width runs down-right, depth down-left).
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);

export type IsometricDirection =
  | 'iso-width-pos' | 'iso-width-neg'
  | 'iso-depth-pos' | 'iso-depth-neg'
  | 'iso-height-pos' | 'iso-height-neg';

const DEFAULT_DEPTH = 24;

/** One of the six cube-face "+" bubbles, as opposed to a 2D side. */
export function isIsometricDirection(direction: string): direction is IsometricDirection {
  return direction.startsWith('iso-');
}

export function isometricDepth(object: CanvasObject): number {
  return object.isometric?.depth || DEFAULT_DEPTH;
}

/** Visual center of an isometric object's projected bounding box (see
 *  isometricBounds() in stickyflow.js). */
export function isometricCenter(object: CanvasObject): { x: number; y: number } {
  const span = object.width + isometricDepth(object);
  return { x: object.x + (span * ISO_COS) / 2, y: object.y + (object.height + span * ISO_SIN) / 2 };
}

/** Faces for a canvas-drawn Connection: decompose the center-to-center
 *  offset into the width and depth axes and attach along whichever
 *  dominates, so the line leaves the face that actually points at the target. */
export function connectionFaces(from: CanvasObject, to: CanvasObject): { fromFace: IsometricFace; toFace: IsometricFace } {
  const a = isometricCenter(from);
  const b = isometricCenter(to);
  const dx = (b.x - a.x) / ISO_COS;
  const dy = (b.y - a.y) / ISO_SIN;
  const alongWidth = (dx + dy) / 2;
  const alongDepth = (dy - dx) / 2;
  if (Math.abs(alongWidth) >= Math.abs(alongDepth)) {
    return alongWidth >= 0 ? { fromFace: 'right', toFace: 'left' } : { fromFace: 'left', toFace: 'right' };
  }
  return alongDepth >= 0 ? { fromFace: 'front', toFace: 'back' } : { fromFace: 'back', toFace: 'front' };
}
