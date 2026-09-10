// Compiled to media/webview/ownerDrag.js (tsconfig.webview.json) and loaded by
// the preview webview as a browser ES module. Dependency-free — runs in the
// webview sandbox.
//
// Supplemental drag-to-move for the canvas owners stickyflow.js's interaction
// tier declines to move. bindEditing()'s move session bails unless the grabbed
// element resolves to role === 'entity' (see move/state.ts), so a frame
// (Container { kind: frame }), table, swimlane or chart can't be repositioned
// from the canvas — even though the package's pure applyMoveChange patcher
// happily rewrites any block's `layout { position }` by id. This binds the
// missing gesture for exactly those roles (see SUPPLEMENTAL_OWNER_ROLES) and
// nothing else; entities and link endpoints stay owned by bindEditing().
//
// It reports a finished drag as { owner, dx, dy } — the same shape as
// MoveChangeEvent — so the host can feed it straight to applyMoveChange and
// re-render, identical to how it already handles the entity 'moveChange' event.

import {
  cssEscape,
  type OwnerRef,
  ownerElementAt,
  pastThreshold,
  SUPPLEMENTAL_OWNER_ROLES,
} from './ownerGesture.js';

export type { OwnerRef } from './ownerGesture.js';
export { SUPPLEMENTAL_OWNER_ROLES } from './ownerGesture.js';

export interface OwnerMove {
  owner: OwnerRef;
  dx: number;
  dy: number;
}

export interface OwnerDragOptions {
  /** Whether edit mode is currently on. Checked on every pointerdown so the
   *  gesture is inert while editing is off, matching the rest of the toolbar. */
  isActive(): boolean;
  /** A finished drag (past the movement threshold), in SFL user units. */
  onCommit(move: OwnerMove): void;
  /** Ids whose nodes should ride along with `ownerId` during the drag preview —
   *  e.g. a frame's child entities. Their final position is settled by the
   *  host's re-render on commit; this only keeps the preview coherent. */
  descendantIds?(ownerId: string): string[];
}

export interface OwnerDragHandle {
  destroy(): void;
}

/** SFL user-space delta for a pointer move, given the SVG's on-screen scale.
 *  The viewer never rotates or skews the root, so axis-independent scale
 *  division is exact; a zero/absent scale falls back to 1:1. */
export function userDelta(
  scaleX: number,
  scaleY: number,
  screenDx: number,
  screenDy: number,
): { dx: number; dy: number } {
  return {
    dx: screenDx / (scaleX || 1),
    dy: screenDy / (scaleY || 1),
  };
}

/** Prepend a translate to whatever transform a node already carries. */
export function withTranslate(base: string | null, dx: number, dy: number): string {
  return base ? `translate(${dx} ${dy}) ${base}` : `translate(${dx} ${dy})`;
}

interface DragState {
  owner: OwnerRef;
  pointerId: number;
  startX: number;
  startY: number;
  scaleX: number;
  scaleY: number;
  nodes: Element[];
  bases: (string | null)[];
  moved: boolean;
}

function collectNodes(svg: SVGSVGElement, ids: string[]): Element[] {
  const selector = ids
    .flatMap((id) => [`[data-sf-id="${cssEscape(id)}"]`, `[data-sf-selection-overlay="${cssEscape(id)}"]`])
    .join(',');
  const own = selector ? Array.from(svg.querySelectorAll(selector)) : [];
  const idSet = new Set(ids);
  // Internal links — both ends inside the moving set — ride along rigidly.
  const links = Array.from(svg.querySelectorAll('[data-sf-from][data-sf-to]')).filter(
    (path) => idSet.has(path.getAttribute('data-sf-from') ?? '') && idSet.has(path.getAttribute('data-sf-to') ?? ''),
  );
  return [...own, ...links];
}

export function bindOwnerDrag(svg: SVGSVGElement, options: OwnerDragOptions): OwnerDragHandle {
  let drag: DragState | null = null;

  const reset = (): void => {
    if (!drag) {
      return;
    }
    for (let i = 0; i < drag.nodes.length; i++) {
      const node = drag.nodes[i];
      if (!node.isConnected) {
        continue;
      }
      const base = drag.bases[i];
      if (base === null) {
        node.removeAttribute('transform');
      } else {
        node.setAttribute('transform', base);
      }
    }
    drag = null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (drag || event.button !== 0 || event.ctrlKey || event.metaKey || !options.isActive()) {
      return;
    }
    const hit = ownerElementAt(event.target);
    if (!hit || !SUPPLEMENTAL_OWNER_ROLES.has(hit.role)) {
      return; // entities, links, empty canvas, selection-overlay controls — not ours
    }
    const ctm = svg.getScreenCTM();
    const ids = [hit.id, ...(options.descendantIds?.(hit.id) ?? [])];
    const nodes = collectNodes(svg, ids);
    hit.el.setPointerCapture?.(event.pointerId);
    drag = {
      owner: { role: hit.role, id: hit.id },
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scaleX: ctm?.a ?? 1,
      scaleY: ctm?.d ?? 1,
      nodes,
      bases: nodes.map((node) => node.getAttribute('transform')),
      moved: false,
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.moved && !pastThreshold(drag.startX, drag.startY, event.clientX, event.clientY)) {
      return;
    }
    drag.moved = true;
    const { dx, dy } = userDelta(drag.scaleX, drag.scaleY, event.clientX - drag.startX, event.clientY - drag.startY);
    for (let i = 0; i < drag.nodes.length; i++) {
      drag.nodes[i].setAttribute('transform', withTranslate(drag.bases[i], dx, dy));
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    (event.target as Element | null)?.releasePointerCapture?.(drag.pointerId);
    const committed = drag.moved
      ? { owner: drag.owner, ...userDelta(drag.scaleX, drag.scaleY, event.clientX - drag.startX, event.clientY - drag.startY) }
      : null;
    // Roll the preview transforms back before committing: the host answers a
    // commit with a full re-render from patched SFL, which is the real new
    // position. If the patch turns out to be a no-op, the rollback is what
    // keeps the shape where it started instead of stuck at the dragged offset.
    reset();
    if (committed) {
      options.onCommit(committed);
    }
  };

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', reset);

  return {
    destroy() {
      reset();
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', reset);
    },
  };
}
