// "Route:" cycles the selected link orthogonal -> curved -> straight. Shown
// only with editing on and exactly one link selected, the one thing it acts
// on; a visible button that silently does nothing is worse than none.

import type { EditMode } from './editMode.js';
import { applyRouteChange, nextRoute } from './linkRoute.js';
import type { PreviewContext } from './session.js';

export function bindRouteButton(ctx: PreviewContext, editMode: EditMode, button: HTMLButtonElement): void {
  const { doc, viewer } = ctx;
  let selectedLinkId: string | null = null;

  // The link's current routing, read off its rendered path (the renderer
  // sets data-sf-route). nextRoute() treats an unknown value as "start the
  // cycle", so a missing attribute is fine.
  const currentRoute = (linkId: string) => {
    const path = viewer.svg.querySelector(`[data-sf-id="${CSS.escape(linkId)}"][data-sf-primary]`);
    return path?.getAttribute('data-sf-route') || 'straight';
  };

  const refresh = () => {
    const show = !!editMode.session && !!selectedLinkId;
    button.hidden = !show;
    button.textContent = show && selectedLinkId ? `Route: ${currentRoute(selectedLinkId)}` : 'Route';
  };

  viewer.on('selectionChange', (e) => {
    selectedLinkId = e.selection.length === 1 && e.selection[0].role === 'link' ? e.selection[0].id : null;
    refresh();
  });

  editMode.onChange((on) => {
    if (!on) selectedLinkId = null;
    refresh();
  });

  button.addEventListener('click', () => {
    if (!editMode.session || !selectedLinkId) return;
    const id = selectedLinkId;
    const next = applyRouteChange(doc.source, id, nextRoute(currentRoute(id)));
    if (next === doc.source) {
      ctx.host.warn(`Couldn't change the route of "${id}". Set its \`route:\` in the SFL instead.`);
      return;
    }
    doc.commit(next);
    viewer.select([id]); // keep it selected so the button stays up, now showing the new route
    refresh();
  });
}
