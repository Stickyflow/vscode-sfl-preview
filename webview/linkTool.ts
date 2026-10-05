// "+ Link": a two-click gesture. Arm it, click a source, click a target. Two
// 2D objects get a Link, two isometric objects get a face-attached
// Connection, and mixing the two is refused. Listens on the viewer's own
// canvasObjectClick, which fires alongside selectionChange, so normal
// click-to-select and editor reveal keep working underneath it.

import type { EditMode } from './editMode.js';
import { connectionFaces, ISOMETRIC_ROLE } from './isometric.js';
import { isLinkable } from './placement.js';
import type { PreviewContext } from './session.js';
import type { OwnerRef } from './stickyflow.js';

type LinkState = null | 'from' | { from: OwnerRef };

export function bindLinkTool(ctx: PreviewContext, editMode: EditMode, button: HTMLButtonElement): void {
  let state: LinkState = null;

  const setState = (next: LinkState) => {
    state = next;
    button.setAttribute('aria-pressed', String(state !== null));
    button.textContent = state === null ? '+ Link' : state === 'from' ? 'Click source…' : 'Click target…';
  };

  button.addEventListener('click', () => {
    if (!editMode.session) return; // hidden while editing is off; guard the handler too
    setState(state === null ? 'from' : null);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state !== null) setState(null);
  });

  // Only usable while editing; turning editing off also drops an armed gesture.
  editMode.onChange((on) => {
    button.hidden = !on;
    if (!on) setState(null);
  });

  ctx.viewer.on('canvasObjectClick', (e) => {
    if (!editMode.session || state === null) return;
    if (state === 'from') {
      if (!isLinkable(e.owner.role) && e.owner.role !== ISOMETRIC_ROLE) {
        ctx.host.warn(`Can't link from "${e.owner.id}": it's a ${e.owner.role}. Canvas links connect entities, containers and tables.`);
        setState(null);
        return;
      }
      setState({ from: e.owner });
      return;
    }
    const from = state.from;
    setState(null);
    if (e.owner.id === from.id) return; // same object twice cancels, it's not a self-link
    if (from.role === ISOMETRIC_ROLE || e.owner.role === ISOMETRIC_ROLE) connectCubes(ctx, from, e.owner);
    else linkShapes(ctx, from, e.owner);
  });
}

function connectCubes(ctx: PreviewContext, fromRef: OwnerRef, toRef: OwnerRef): void {
  const { doc, host } = ctx;
  if (fromRef.role !== ISOMETRIC_ROLE || toRef.role !== ISOMETRIC_ROLE) {
    host.warn('Isometric objects connect only to other isometric objects.');
    return;
  }
  const from = doc.objectById(fromRef.id);
  const to = doc.objectById(toRef.id);
  if (!from || !to) return;
  const id = doc.nextId('connection');
  const next = ctx.interaction.insertConnection(doc.source, { id, fromId: from.id, toId: to.id, ...connectionFaces(from, to) });
  if (next === doc.source) {
    host.warn(`Could not connect "${from.id}" to "${to.id}".`);
    return;
  }
  doc.commit(next);
  ctx.viewer.select([id]);
}

function linkShapes(ctx: PreviewContext, from: OwnerRef, to: OwnerRef): void {
  const { doc, host } = ctx;
  if (!isLinkable(to.role)) {
    host.warn(`Can't link to "${to.id}": it's a ${to.role}. Canvas links connect entities, containers and tables.`);
    return;
  }
  const id = doc.nextId('link');
  const next = ctx.interaction.insertLink(doc.source, { id, fromId: from.id, toId: to.id });
  if (next === doc.source) {
    host.warn(`Could not create link "${from.id}" to "${to.id}".`);
    return;
  }
  doc.commit(next);
  ctx.viewer.select([id]);
}
