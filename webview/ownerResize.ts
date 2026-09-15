// Compiled to media/webview/ownerResize.js (tsconfig.webview.json) and loaded
// by the preview webview as a browser ES module. Dependency-free — runs in the
// webview sandbox.
//
// Supplemental drag-to-resize for the canvas owners stickyflow.js's interaction
// tier declines to resize. bindEditing()'s resize session bails unless the
// grabbed handle's owner resolves to role === 'entity' (see resize/selection.ts),
// so a frame (Container { kind: frame }), table, swimlane or chart shows resize
// handles in edit mode but they do nothing — even though the pure
// applyResizeChange patcher rewrites any block's `layout { position / size }` by
// id. This binds the missing gesture for exactly those roles
// (SUPPLEMENTAL_OWNER_ROLES) and reports a finished resize as absolute bounds
// { owner, x, y, width, height, dx, dy, dWidth, dHeight } — the same shape as
// ResizeChangeEvent — so the host feeds it straight to applyResizeChange.
//
// The resize handles themselves are drawn by the viewer's own selection
// overlay (shapeSelectionOverlay -> renderResizeHandles), for every non-link
// role, so there is nothing to render here — only the drag to wire up.

import { clientToUser, cssEscape, type OwnerRef, ownerElementAt, pastThreshold, SUPPLEMENTAL_OWNER_ROLES } from './ownerGesture.js';

/** Smallest side a supplemental resize will settle on, in SFL user units.
 *  Matches stickyflow.js's own MIN_SIZE for entity resize. */
export const MIN_SIZE = 10;

export type ResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Which edges each handle moves. Mirrors stickyflow.js's HANDLE_AXES. */
const HANDLE_AXES: Record<ResizeHandle, { x: 'left' | 'right' | 'none'; y: 'top' | 'bottom' | 'none' }> = {
  'top-left': { x: 'left', y: 'top' },
  top: { x: 'none', y: 'top' },
  'top-right': { x: 'right', y: 'top' },
  right: { x: 'right', y: 'none' },
  'bottom-right': { x: 'right', y: 'bottom' },
  bottom: { x: 'none', y: 'bottom' },
  'bottom-left': { x: 'left', y: 'bottom' },
  left: { x: 'left', y: 'none' },
};

/** New bounds for a resize: the grabbed edge/corner follows `pointer` (in user
 *  space), the opposite edge stays fixed, each axis clamped to MIN_SIZE. A pure
 *  copy of stickyflow.js's `resizedBounds` so frame/table resize matches entity
 *  resize exactly. */
export function resizedBounds(start: Rect, handle: ResizeHandle, pointer: { x: number; y: number }, minSize = MIN_SIZE): Rect {
  const axes = HANDLE_AXES[handle];
  let x = start.x;
  let width = start.width;
  if (axes.x !== 'none') {
    const fixedX = axes.x === 'left' ? start.x + start.width : start.x;
    const lo = Math.min(fixedX, pointer.x);
    const hi = Math.max(fixedX, pointer.x);
    x = lo;
    width = Math.max(minSize, hi - lo);
  }
  let y = start.y;
  let height = start.height;
  if (axes.y !== 'none') {
    const fixedY = axes.y === 'top' ? start.y + start.height : start.y;
    const lo = Math.min(fixedY, pointer.y);
    const hi = Math.max(fixedY, pointer.y);
    y = lo;
    height = Math.max(minSize, hi - lo);
  }
  return { x, y, width, height };
}

/** The eight [cx, cy, handle] positions around a rect. Mirrors stickyflow.js's
 *  resizeHandlePositions — used to keep the overlay's handles under the pointer
 *  during the live preview. */
export function resizeHandleCenters(b: Rect): Array<[number, number, ResizeHandle]> {
  const midX = b.x + b.width / 2;
  const midY = b.y + b.height / 2;
  return [
    [b.x, b.y, 'top-left'],
    [midX, b.y, 'top'],
    [b.x + b.width, b.y, 'top-right'],
    [b.x + b.width, midY, 'right'],
    [b.x + b.width, b.y + b.height, 'bottom-right'],
    [midX, b.y + b.height, 'bottom'],
    [b.x, b.y + b.height, 'bottom-left'],
    [b.x, midY, 'left'],
  ];
}

const HANDLE_HALF = 3; // renderResizeHandles: HANDLE_SIZE 6, centered

export interface OwnerResizeEvent extends Rect {
  owner: OwnerRef;
  dx: number;
  dy: number;
  dWidth: number;
  dHeight: number;
}

export interface OwnerResizeOptions {
  isActive(): boolean;
  onCommit(event: OwnerResizeEvent): void;
}

export interface OwnerResizeHandle {
  destroy(): void;
}

interface ResizeState {
  owner: OwnerRef;
  handle: ResizeHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: Rect;
  primary: SVGGraphicsElement | null;
  primaryIsRect: boolean;
  primaryBase: { x: string | null; y: string | null; width: string | null; height: string | null } | null;
  ring: SVGRectElement | null;
  handleRects: Map<ResizeHandle, SVGRectElement>;
  moved: boolean;
}

function resizeHandleUnder(target: EventTarget | null): { el: Element; handle: ResizeHandle } | null {
  const el = target instanceof Element ? target.closest('[data-sf-resize-handle]') : null;
  const handle = el?.getAttribute('data-sf-resize-handle') as ResizeHandle | null;
  return el && handle ? { el, handle } : null;
}

export function bindOwnerResize(svg: SVGSVGElement, options: OwnerResizeOptions): OwnerResizeHandle {
  let state: ResizeState | null = null;

  const previewRect = (b: Rect): void => {
    if (!state) {
      return;
    }
    if (state.ring) {
      state.ring.setAttribute('x', String(b.x - 1));
      state.ring.setAttribute('y', String(b.y - 1));
      state.ring.setAttribute('width', String(b.width + 2));
      state.ring.setAttribute('height', String(b.height + 2));
    }
    for (const [cx, cy, name] of resizeHandleCenters(b)) {
      const rect = state.handleRects.get(name);
      if (rect) {
        rect.setAttribute('x', String(cx - HANDLE_HALF));
        rect.setAttribute('y', String(cy - HANDLE_HALF));
      }
    }
    // A single-<rect> primary (frames, swimlanes, and the outer rect of tables
    // and charts) can be resized live with no distortion. Composite internals
    // (a frame's title tab, a table's grid, a chart's bars/axes) are left for
    // the re-render on commit.
    if (state.primary && state.primaryIsRect) {
      state.primary.setAttribute('x', String(b.x));
      state.primary.setAttribute('y', String(b.y));
      state.primary.setAttribute('width', String(b.width));
      state.primary.setAttribute('height', String(b.height));
    }
  };

  const restorePrimary = (): void => {
    if (!state?.primary || !state.primaryBase) {
      return;
    }
    for (const attr of ['x', 'y', 'width', 'height'] as const) {
      const value = state.primaryBase[attr];
      if (value === null) {
        state.primary.removeAttribute(attr);
      } else {
        state.primary.setAttribute(attr, value);
      }
    }
  };

  const cancel = (): void => {
    if (state && state.moved) {
      restorePrimary();
      // The overlay ring/handles are rebuilt wholesale by the next
      // paintSelectionOverlays (selection is preserved across viewer.update),
      // so they need no manual restore.
    }
    state = null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (state || event.button !== 0 || event.ctrlKey || event.metaKey || !options.isActive()) {
      return;
    }
    const grabbed = resizeHandleUnder(event.target);
    if (!grabbed) {
      return;
    }
    const overlay = grabbed.el.closest('[data-sf-selection-overlay]');
    const ownerId = overlay?.getAttribute('data-sf-selection-overlay');
    if (!ownerId) {
      return;
    }
    const primary = svg.querySelector<SVGGraphicsElement>(
      `[data-sf-id="${cssEscape(ownerId)}"][data-sf-primary]`,
    );
    const owner = primary && ownerElementAt(primary);
    if (!primary || !owner || !SUPPLEMENTAL_OWNER_ROLES.has(owner.role)) {
      return; // entity handles stay with bindEditing(); links/paths have no box resize
    }

    const box = primary.getBBox();
    const handleRects = new Map<ResizeHandle, SVGRectElement>();
    for (const rect of overlay?.querySelectorAll<SVGRectElement>('[data-sf-resize-handle]') ?? []) {
      const name = rect.getAttribute('data-sf-resize-handle') as ResizeHandle | null;
      if (name) {
        handleRects.set(name, rect);
      }
    }
    const primaryIsRect = primary.tagName.toLowerCase() === 'rect';

    grabbed.el.setPointerCapture?.(event.pointerId);
    state = {
      owner: { role: owner.role, id: owner.id },
      handle: grabbed.handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: { x: box.x, y: box.y, width: box.width, height: box.height },
      primary,
      primaryIsRect,
      primaryBase: primaryIsRect
        ? {
            x: primary.getAttribute('x'),
            y: primary.getAttribute('y'),
            width: primary.getAttribute('width'),
            height: primary.getAttribute('height'),
          }
        : null,
      ring: (overlay?.querySelector('rect:not([data-sf-resize-handle])') as SVGRectElement | null) ?? null,
      handleRects,
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }
    if (!state.moved && !pastThreshold(state.startClientX, state.startClientY, event.clientX, event.clientY)) {
      return;
    }
    state.moved = true;
    previewRect(resizedBounds(state.start, state.handle, clientToUser(svg, event.clientX, event.clientY)));
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }
    (event.target as Element | null)?.releasePointerCapture?.(state.pointerId);
    const s = state;
    let committed: OwnerResizeEvent | null = null;
    if (s.moved) {
      const b = resizedBounds(s.start, s.handle, clientToUser(svg, event.clientX, event.clientY));
      committed = {
        owner: s.owner,
        ...b,
        dx: b.x - s.start.x,
        dy: b.y - s.start.y,
        dWidth: b.width - s.start.width,
        dHeight: b.height - s.start.height,
      };
    }
    // Roll the live preview back first: the host answers a commit with a full
    // re-render at the real new bounds. If the patch no-ops, the rollback is
    // what leaves the shape at its original size.
    cancel();
    if (committed) {
      options.onCommit(committed);
    }
  };

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', cancel);

  return {
    destroy() {
      cancel();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', cancel);
    },
  };
}
