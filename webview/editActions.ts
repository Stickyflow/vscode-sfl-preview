// Turns the editing session's gesture events into SFL text patches. Each
// handler patches the current text with one of stickyflow.js's pure
// apply*/insert* functions and commits the result; nothing here touches the
// rendered SVG directly.

import { isIsometricDirection } from './isometric.js';
import { createBatcher } from './moves.js';
import { besideBox, isLinkable, NEW_ENTITY_STYLE } from './placement.js';
import type { PreviewContext } from './session.js';
import type { EditingSession, LinkToEvent, MoveChangeEvent, PropertyChangeEvent, QuickDuplicateEvent, Side } from './stickyflow.js';

/** Wires every edit gesture; returns a cleanup that drops pending batches. */
export function bindEditActions(ctx: PreviewContext, editing: EditingSession): () => void {
  const { doc, interaction: ix } = ctx;

  // One drag emits one moveChange per moved owner. applyMoveChanges writes
  // them in one pass and skips a child whose frame moves in the same drag.
  const moves = createBatcher<MoveChangeEvent>((events) => doc.commit(ix.applyMoveChanges(doc.source, events)));

  // A dragged isometric label emits labelOffsetX and labelOffsetY as two
  // synchronous propertyChange events: one drag, one edit.
  const properties = createBatcher<PropertyChangeEvent>((events) => {
    let next = doc.source;
    for (const change of events) next = ix.applyPropertyChange(next, change);
    doc.commit(next);
  });

  editing.on('textChange', (e) => doc.commit(ix.applyTextChange(doc.source, e)));
  editing.on('moveChange', (e) => moves.push(e));
  editing.on('resizeChange', (e) => doc.commit(ix.applyResizeChange(doc.source, e)));
  editing.on('linkReconnect', (e) => doc.commit(ix.applyLinkReconnectChange(doc.source, e)));
  editing.on('propertyChange', (e) => properties.push(e));
  editing.on('sankeyNodeMove', (e) => doc.commit(ix.applySankeyNodeMoveChange(doc.source, e)));
  editing.on('sankeyNodeRename', (e) => doc.commit(ix.applySankeyNodeRenameChange(doc.source, e)));
  editing.on('quickDuplicate', (e) => quickDuplicate(ctx, e));
  editing.on('linkTo', (e) => linkTo(ctx, e));
  editing.on('delete', (e) => {
    let next = doc.source;
    for (const owner of e.owners) next = owner.role === 'link' ? ix.removeLink(next, owner.id) : ix.removeCanvasObject(next, owner.id);
    doc.commit(next);
  });

  return () => {
    moves.clear();
    properties.clear();
  };
}

// The "+" bubbles around a selected object: a copy in the clicked direction,
// joined to it. stickyflow.js's applyQuickDuplicateChange does this the same
// way as Atlas: the copy keeps the text and look of the object, the new Link
// looks like the object's other links, and an isometric object gets a
// Connection between the touching faces. It copies any 2D object as a shape
// and always links it, so an object the canvas can't link cleanly (path,
// chart, text) still gets a plain new entity next to it and no link.
function quickDuplicate(ctx: PreviewContext, e: QuickDuplicateEvent): void {
  const { doc, interaction: ix } = ctx;
  const isometric = isIsometricDirection(e.direction);

  if (isometric || isLinkable(e.owner.role)) {
    const shapeId = doc.nextId(isometric ? 'object' : 'entity');
    const linkId = doc.nextId(isometric ? 'connection' : 'link');
    const next = ix.applyQuickDuplicateChange(doc.source, e, { shapeId, linkId });
    if (next === doc.source) return;
    doc.commit(next);
    ctx.viewer.select([shapeId]);
    return;
  }

  const source = doc.objectById(e.owner.id);
  if (!source) return;
  const side: Side = e.direction as Side;
  const id = doc.nextId('entity');
  const next = ix.insertCanvasObject(doc.source, { id, kind: 'shape', text: 'New entity', ...besideBox(source, side), body: NEW_ENTITY_STYLE });
  if (next === doc.source) return;
  doc.commit(next);
  ctx.viewer.select([id]);
}

// A "+" bubble dragged onto another object instead of into empty space: a new
// link from the bubble's side to the drop point on the target. Targets the
// canvas can't link cleanly (path/chart) are refused, so no half-made link is
// left on the board.
function linkTo(ctx: PreviewContext, e: LinkToEvent): void {
  const { doc, interaction: ix, host, viewer } = ctx;
  if (!isLinkable(e.target.role)) {
    host.warn(`Can't link to "${e.target.id}": it's a ${e.target.role}. Canvas links connect entities, containers and tables; link a ${e.target.role} by editing the SFL.`);
    viewer.update({ source: doc.source }); // clear the drag preview
    return;
  }
  const id = doc.nextId('link');
  const next = ix.insertLink(doc.source, { id, fromId: e.owner.id, toId: e.target.id, fromSide: e.direction, toSide: e.side, toFraction: e.fraction });
  if (next === doc.source) {
    host.warn(`Could not link "${e.owner.id}" to "${e.target.id}".`);
    viewer.update({ source: doc.source });
    return;
  }
  doc.commit(next);
  viewer.select([id]);
}
