// Canvas <-> editor selection sync, always on, independent of edit mode.
// Canvas -> editor: a single selected owner is sent as `sfl/reveal`.
// Editor -> canvas: `sfl/select` from the host selects that owner.
//
// lastSyncedId is this side's own record of the last id it sent or applied
// (panel.ts keeps its own). Skipping an id it just received is what breaks
// the loop where a canvas click moves the editor cursor, which reports a
// selection change right back.

import type { PreviewContext } from './session.js';

export interface SelectionSync {
  /** Applies an `sfl/select` from the host. */
  selectFromHost(id: string | null): void;
}

export function bindSelectionSync(ctx: PreviewContext): SelectionSync {
  let lastSyncedId: string | null = null;

  ctx.viewer.on('selectionChange', (e) => {
    const id = e.selection.length === 1 ? e.selection[0].id : null; // a multi-selection has no single text location
    if (id === lastSyncedId) return;
    lastSyncedId = id;
    ctx.host.reveal(id);
  });

  return {
    selectFromHost(id) {
      if (id === lastSyncedId) return;
      // Set before select(): the selectionChange it emits synchronously is
      // then recognized as already in sync and not sent back.
      lastSyncedId = id;
      ctx.viewer.select(id ? [id] : []);
    },
  };
}
