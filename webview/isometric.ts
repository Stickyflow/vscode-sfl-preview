// Isometric geometry for canvas-created cubes and Connections. Pure, no DOM.
// Isometric objects connect only to each other, through a face-attached
// Connection block rather than a Link: stickyflow.js routes a Connection
// between cube faces, and a 2D side/fraction means nothing on a cube.

import type { CanvasObject, IsometricFace } from './stickyflow.js';

export const ISOMETRIC_ROLE = 'isometric';

// Screen-space unit vectors of the three isometric axes, matching
// isometricFaces() in stickyflow.js/src/model/isometricObject/geometry.ts
// (30° axes: width runs down-right, depth down-left, height straight down).
const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = Math.sin(Math.PI / 6);
const ISO_AXES = {
  width: { x: ISO_COS, y: ISO_SIN },
  depth: { x: -ISO_COS, y: ISO_SIN },
  height: { x: 0, y: 1 },
};

type Axis = keyof typeof ISO_AXES;

export type IsometricDirection =
  | 'iso-width-pos' | 'iso-width-neg'
  | 'iso-depth-pos' | 'iso-depth-neg'
  | 'iso-height-pos' | 'iso-height-neg';

// The six cube-face "+" bubbles: which axis the copy is pushed along, and
// which faces the new Connection joins (source face, then facing face).
const ISO_DUPLICATE: Record<IsometricDirection, { axis: Axis; sign: 1 | -1; fromFace: IsometricFace; toFace: IsometricFace }> = {
  'iso-width-pos': { axis: 'width', sign: 1, fromFace: 'right', toFace: 'left' },
  'iso-width-neg': { axis: 'width', sign: -1, fromFace: 'left', toFace: 'right' },
  'iso-depth-pos': { axis: 'depth', sign: 1, fromFace: 'front', toFace: 'back' },
  'iso-depth-neg': { axis: 'depth', sign: -1, fromFace: 'back', toFace: 'front' },
  'iso-height-pos': { axis: 'height', sign: 1, fromFace: 'bottom', toFace: 'top' },
  'iso-height-neg': { axis: 'height', sign: -1, fromFace: 'top', toFace: 'bottom' },
};

const DUPLICATE_GAP = 40;
const DEFAULT_DEPTH = 24;

export function isIsometricDirection(direction: string): direction is IsometricDirection {
  return direction in ISO_DUPLICATE;
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

export interface IsometricCopy {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  fromFace: IsometricFace;
  toFace: IsometricFace;
}

/** A cube-face "+" bubble: a copy of the cube pushed one full length (plus a
 *  gap) along that face's axis, and the faces the joining Connection uses. */
export function isometricCopy(source: CanvasObject, direction: IsometricDirection): IsometricCopy {
  const plan = ISO_DUPLICATE[direction];
  const depth = isometricDepth(source);
  const length = { width: source.width, depth, height: source.height }[plan.axis];
  const step = (length + DUPLICATE_GAP) * plan.sign;
  const axis = ISO_AXES[plan.axis];
  return {
    x: Math.round(source.x + axis.x * step),
    y: Math.round(source.y + axis.y * step),
    width: source.width,
    height: source.height,
    depth,
    fromFace: plan.fromFace,
    toFace: plan.toFace,
  };
}
