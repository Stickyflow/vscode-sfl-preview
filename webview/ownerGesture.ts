// Compiled to media/webview/ownerGesture.js (tsconfig.webview.json). Shared
// primitives for the supplemental edit-mode gestures (ownerDrag.ts,
// ownerResize.ts). Dependency-free — runs in the webview sandbox.

export interface OwnerRef {
  role: string;
  id: string;
}

/** Canvas roles stickyflow.js's own `interaction` tier refuses to move or
 *  resize — its move session and resize selection both hard-gate to
 *  role === 'entity' — even though the pure `applyMoveChange` / `applyResizeChange`
 *  patchers rewrite any block's `layout { position / size }` by id. These are
 *  the roles the `webview/owner*` modules pick up. 'link' and 'path' are left
 *  out on purpose: they're reshaped by their endpoints / points, not dragged
 *  or box-resized as a rigid body. */
export const SUPPLEMENTAL_OWNER_ROLES: ReadonlySet<string> = new Set(['frame', 'swimlane', 'table', 'chart']);

export const DRAG_THRESHOLD_PX = 3;

/** Movement past which a pointer press counts as a drag rather than a click. */
export function pastThreshold(ax: number, ay: number, bx: number, by: number, px = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(bx - ax, by - ay) >= px;
}

/** The nearest ancestor that carries both a `data-sf-id` and a `data-sf-role`,
 *  i.e. a real canvas owner — not a selection-overlay control, which carries
 *  neither. */
export function ownerElementAt(target: EventTarget | null): { el: Element; role: string; id: string } | null {
  const el = target instanceof Element ? target.closest('[data-sf-id][data-sf-role]') : null;
  if (!el) {
    return null;
  }
  const role = el.getAttribute('data-sf-role');
  const id = el.getAttribute('data-sf-id');
  return role && id ? { el, role, id } : null;
}

export function cssEscape(value: string): string {
  const g = globalThis as unknown as { CSS?: { escape(v: string): string } };
  return g.CSS?.escape ? g.CSS.escape(value) : value.replace(/["\\\]]/g, '\\$&');
}

/** A client-space point mapped into the SVG's user (SFL) coordinate space —
 *  the same `getScreenCTM().inverse()` transform stickyflow.js's own gesture
 *  code uses. Returns the raw point unchanged if the CTM is unavailable
 *  (detached / not yet laid out). */
export function clientToUser(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm || typeof DOMPoint === 'undefined') {
    return { x: clientX, y: clientY };
  }
  const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: point.x, y: point.y };
}
