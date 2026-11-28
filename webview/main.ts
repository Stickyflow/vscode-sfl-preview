// Composition root of the preview webview. The inline bootstrap in
// src/getWebviewHtml.ts loads the stickyflow.js runtime and calls
// startPreview() with it; everything else is wired from here.

import { bindAddEntity } from './addEntity.js';
import { resolveAssetIn } from './assets.js';
import { canvasColor, paintCanvas } from './canvas.js';
import { bindEditActions } from './editActions.js';
import { createEditMode } from './editMode.js';
import { exportDiagram, type BundledFont } from './exportDiagram.js';
import { diagramToToon } from './toon.js';
import { asHostMessage, createHostPort, type VsCodeApi } from './host.js';
import { bindLinkTool } from './linkTool.js';
import { bindPanControls } from './panControls.js';
import { bindRouteButton } from './routeButton.js';
import { bindSelectionSync } from './selectionSync.js';
import { createDocumentSession, type PreviewContext } from './session.js';
import type { CoreApi, DiagramHost, InteractionApi, Viewer, ViewerApi } from './stickyflow.js';

export interface PreviewOptions {
  el: HTMLElement;
  initialSource: string;
  viewer: ViewerApi;
  interaction: InteractionApi;
  core: CoreApi;
  vscodeApi: VsCodeApi;
  /** Webview URI of the .sfl file's folder, ending in "/", or null when the
   *  document has no file. Mesh assets resolve against it. */
  documentFolder: string | null;
  /** The bundled Inter subsets, embedded into exports. */
  fonts: BundledFont[];
}

// The viewer's own look inside its shadow root, as the <stickyflow-diagram>
// element had it: the selection ring, pointer cursors on entities and links,
// and the error line a text that does not render shows.
const STAGE_STYLE = `
  :host { display: block; position: relative; }
  .sf-container { width: 100%; height: 100%; }
  svg { display: block; max-width: 100%; }
  .sf-error { color: #b91c1c; font: 13px/1.4 system-ui, sans-serif; padding: 8px; white-space: pre-wrap; }
  [data-sf-role="entity"], [data-sf-role="link"] { cursor: pointer; }
  [data-sf-selected] { stroke: #2563eb !important; stroke-width: 4 !important; }
`;

export function startPreview({
  el,
  initialSource,
  viewer: viewerApi,
  interaction,
  core,
  vscodeApi,
  documentFolder,
  fonts,
}: PreviewOptions): void {
  const host = createHostPort(vscodeApi);
  // The text before a viewer exists; afterwards the document session owns it.
  let source = initialSource;
  const currentSource = () => preview?.doc.source ?? source;
  const repaint = (text: string) => paintCanvas(canvasColor(core, text));
  repaint(source);

  // Export and templates work from the text alone, with or without a live viewer.
  const exportAs = (format: 'svg' | 'png') =>
    void exportDiagram(core, host, currentSource(), format, canvasColor(core, currentSource()), fonts);
  button('sf-export-svg').addEventListener('click', () => exportAs('svg'));
  button('sf-export-png').addEventListener('click', () => exportAs('png'));
  button('sf-export-md').addEventListener('click', () => host.export('md', currentSource()));
  button('sf-export-toon').addEventListener('click', () => {
    try {
      host.export('toon', diagramToToon(core.sflToCanvasState(currentSource())));
    } catch (err) {
      host.warn(`Could not export: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  button('sf-pick-template').addEventListener('click', () => host.pickTemplate());

  const { diagram, stage } = mountStage(el);
  // Webview URIs are absolute; resolving against the page keeps a relative one usable too.
  const folderUrl = documentFolder === null ? null : new URL(documentFolder, document.baseURI).toString();
  const resolveAsset = resolveAssetIn(folderUrl);

  // Draws `text` in the stage, replacing what was there. The viewer is null
  // when the text does not render (the stage shows the error instead). Until a
  // later update renders, every update remounts here; once a viewer exists,
  // the interactive features are wired to it and updates go to the document
  // session.
  const mount = (text: string): Viewer | null => {
    diagram.viewer?.destroy();
    diagram.viewer = null;
    diagram.source = text;
    stage.replaceChildren();
    try {
      const viewer = viewerApi.createViewer({
        container: stage,
        source: text,
        interactive: true,
        resolveAsset,
      });
      diagram.viewer = viewer;
      return viewer;
    } catch (error) {
      const box = document.createElement('div');
      box.className = 'sf-error';
      box.textContent = `stickyflow: ${error instanceof Error ? error.message : String(error)}`;
      stage.replaceChildren(box);
      return null;
    }
  };

  let preview: ReturnType<typeof attach> | null = null;
  {
    const viewer = mount(source);
    if (viewer) preview = attach(viewer);
  }

  window.addEventListener('message', (event) => {
    const message = asHostMessage(event.data);
    if (!message) return;
    if (message.type === 'sfl/update') {
      if (preview) {
        preview.doc.receive(message.source, !!message.likelyExternalRewrite);
      } else if (message.source !== source) {
        source = message.source;
        repaint(source);
        const viewer = mount(source);
        if (viewer) preview = attach(viewer);
      }
    } else if (message.type === 'sfl/transient') {
      preview?.doc.showTransient(message.source);
    } else if (message.type === 'sfl/select') {
      preview?.selectFromHost(message.id);
    }
  });

  function attach(viewer: Viewer) {
    const doc = createDocumentSession(viewer, core, host, source);
    const ctx: PreviewContext = { el: diagram, viewer, interaction, core, host, doc };
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

/** Gives the host element the shadow root and stage the viewer draws into,
 *  so the adopted stylesheets of edit mode and the handle skin apply to the
 *  viewer's SVG the way they did with the web component. */
function mountStage(el: HTMLElement): { diagram: DiagramHost; stage: HTMLElement } {
  const root = el.shadowRoot ?? el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = STAGE_STYLE;
  const stage = document.createElement('div');
  stage.className = 'sf-container';
  root.append(style, stage);
  const diagram = el as DiagramHost;
  diagram.source = null;
  diagram.viewer = null;
  return { diagram, stage };
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
