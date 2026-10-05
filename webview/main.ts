// Composition root of the preview webview. The inline bootstrap in
// src/getWebviewHtml.ts loads the stickyflow.js runtime and calls
// startPreview() with it; everything else is wired from here.

import { bindAddEntity } from './addEntity.js';
import { canvasColor, paintCanvas } from './canvas.js';
import { bindEditActions } from './editActions.js';
import { createEditMode } from './editMode.js';
import { exportDiagram } from './exportDiagram.js';
import { asHostMessage, createHostPort, type VsCodeApi } from './host.js';
import { bindLinkTool } from './linkTool.js';
import { bindPanControls } from './panControls.js';
import { bindRouteButton } from './routeButton.js';
import { bindSelectionSync } from './selectionSync.js';
import { createDocumentSession, type PreviewContext } from './session.js';
import type { CoreApi, InteractionApi, StickyflowDiagram, Viewer } from './stickyflow.js';

export interface PreviewOptions {
  el: StickyflowDiagram;
  initialSource: string;
  interaction: InteractionApi;
  core: CoreApi;
  vscodeApi: VsCodeApi;
}

export function startPreview({ el, initialSource, interaction, core, vscodeApi }: PreviewOptions): void {
  const host = createHostPort(vscodeApi);
  // The text before a viewer exists; afterwards the document session owns it.
  let source = initialSource;
  el.source = source;
  const currentSource = () => preview?.doc.source ?? source;
  const repaint = (text: string) => paintCanvas(canvasColor(core, text));
  repaint(source);

  // Export and templates work from the text alone, with or without a live viewer.
  const exportAs = (format: 'svg' | 'png') => exportDiagram(core, host, currentSource(), format, canvasColor(core, currentSource()));
  button('sf-export-svg').addEventListener('click', () => exportAs('svg'));
  button('sf-export-png').addEventListener('click', () => exportAs('png'));
  button('sf-pick-template').addEventListener('click', () => host.pickTemplate());

  // The web component has no viewer when the text it was given doesn't
  // render (it shows the error instead). Until a later update renders, keep
  // remounting through the `source` setter; once a viewer exists, wire the
  // interactive features to it and hand updates to the document session.
  let preview: ReturnType<typeof attach> | null = el.viewer ? attach(el.viewer) : null;

  window.addEventListener('message', (event) => {
    const message = asHostMessage(event.data);
    if (!message) return;
    if (message.type === 'sfl/update') {
      if (preview) {
        preview.doc.receive(message.source, !!message.likelyExternalRewrite);
      } else if (message.source !== source) {
        source = message.source;
        repaint(source);
        el.source = source;
        if (el.viewer) preview = attach(el.viewer);
      }
    } else if (message.type === 'sfl/select') {
      preview?.selectFromHost(message.id);
    }
  });

  function attach(viewer: Viewer) {
    const doc = createDocumentSession(viewer, core, host, source);
    const ctx: PreviewContext = { el, viewer, interaction, core, host, doc };
    doc.onChange(repaint);

    bindNavigation(viewer);
    const sync = bindSelectionSync(ctx);
    // Reported as a status-bar line (panel.ts): a plain signal that change
    // highlighting's diff fired, independent of whether the ring is visible.
    viewer.on('sceneDiff', (e) => host.sceneDiff(e));

    const editMode = createEditMode(ctx, button('sf-toggle-edit'), (session) => bindEditActions(ctx, session));
    bindAddEntity(ctx, editMode, button('sf-add-entity'));
    bindLinkTool(ctx, editMode, button('sf-add-link'));
    bindRouteButton(ctx, editMode, button('sf-link-route'));
    editMode.set(false);

    return { doc, selectFromHost: sync.selectFromHost };
  }
}

/** Pan and zoom. Independent of edit mode: navigation, not editing. */
function bindNavigation(viewer: Viewer): void {
  // Middle-drag or drag on empty background to pan, plain wheel to pan,
  // Ctrl/Cmd wheel still zooms (see panControls.ts).
  bindPanControls(viewer.svg);

  // The viewer only exposes fit(), so zoom by sending it the same ctrl+wheel
  // event a trackpad pinch would.
  const zoomBy = (factor: number) => {
    const rect = viewer.svg.getBoundingClientRect();
    viewer.svg.dispatchEvent(new WheelEvent('wheel', {
      deltaY: factor > 1 ? -100 : 100,
      ctrlKey: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true,
    }));
  };
  button('sf-zoom-in').addEventListener('click', () => zoomBy(1.2));
  button('sf-zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
  button('sf-zoom-fit').addEventListener('click', () => viewer.fit());
}

function button(id: string): HTMLButtonElement {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLButtonElement)) throw new Error(`preview toolbar: missing #${id}`);
  return el;
}
