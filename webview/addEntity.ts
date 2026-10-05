// "+ Entity": adds a connected next step, not a floating orphan. The anchor
// is the one selected shape, or (nothing selected) the entity the previous
// click added, so repeated clicks build a chain. With no anchor at all the
// new entity lands in the middle of the viewport.

import type { EditMode } from './editMode.js';
import { belowBox, centeredBox, isLinkable, NEW_ENTITY_STYLE } from './placement.js';
import type { PreviewContext } from './session.js';
import type { CanvasObject, OwnerRef } from './stickyflow.js';

export function bindAddEntity(ctx: PreviewContext, editMode: EditMode, button: HTMLButtonElement): void {
  const { doc, viewer } = ctx;
  let lastAddedId: string | null = null;
  // Reading getSelection() on click can come back empty once focus moves to
  // the button, so keep two fallbacks: the selection at pointerdown, and the
  // last non-empty selection.
  let pointerDownAnchor: OwnerRef | null = null;
  let lastSelection: OwnerRef[] = [];

  editMode.onChange((on) => {
    button.hidden = !on;
  });

  viewer.on('selectionChange', (e) => {
    if (e.selection.length > 0) lastSelection = e.selection;
  });

  button.addEventListener('pointerdown', () => {
    const selection = viewer.getSelection();
    pointerDownAnchor = selection.length === 1 ? selection[0] : null;
  });

  button.addEventListener('click', () => {
    if (!editMode.session) return; // hidden while editing is off; guard the handler too

    const clickSelection = viewer.getSelection();
    const selected =
      pointerDownAnchor ??
      (clickSelection.length === 1 ? clickSelection[0] : null) ??
      (lastSelection.length === 1 ? lastSelection[0] : null);
    pointerDownAnchor = null;

    let anchor: CanvasObject | undefined;
    if (selected && isLinkable(selected.role)) anchor = doc.objectById(selected.id);
    if (!anchor && lastAddedId) anchor = doc.objectById(lastAddedId);

    const id = doc.nextId('entity');
    const box = anchor ? belowBox(anchor) : centeredBox(viewer.getViewport());
    let next = ctx.interaction.insertCanvasObject(doc.source, { id, kind: 'shape', text: 'New entity', ...box, body: NEW_ENTITY_STYLE });
    if (next === doc.source) {
      // insertCanvasObject no-ops on an id collision or a document without a
      // top-level Model block; say so instead of doing nothing.
      ctx.host.warn(`Could not add entity "${id}". Check that the document has a top-level Model block and that the id isn't already used.`);
      return;
    }
    if (anchor) {
      next = ctx.interaction.insertLink(next, { id: doc.nextId('link', next), fromId: anchor.id, toId: id, fromSide: 'bottom', toSide: 'top' });
    }

    lastAddedId = id;
    doc.commit(next);
    viewer.select([id]);
  });
}
