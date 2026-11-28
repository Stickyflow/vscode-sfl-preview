// The port to stickyflow.js: every type the webview modules use from it,
// taken straight from the .d.ts files in the copied dist (media/stickyflow/,
// see scripts/copy-media.mjs). Type-only, so nothing here is emitted and no
// module in webview/ loads stickyflow.js itself: the inline bootstrap in
// src/getWebviewHtml.ts imports the runtime modules and hands them to
// startPreview() (main.ts) as a `ViewerApi`, `InteractionApi` and `CoreApi`.
//
// The point is that a rename or signature change upstream is now a
// `tsc -p tsconfig.webview.json` error instead of a black preview panel.

import type * as Interaction from '../media/stickyflow/interaction/index.js';
import type * as Core from '../media/stickyflow/index.js';
import type * as ViewerModule from '../media/stickyflow/viewer/index.js';
import type { OwnerRef, Viewer } from '../media/stickyflow/viewer/index.js';

export type InteractionApi = typeof Interaction;
export type CoreApi = typeof Core;
export type ViewerApi = typeof ViewerModule;

export type { OwnerRef, Viewer };
export type EditingSession = ReturnType<InteractionApi['bindEditing']>;
export type CanvasObject = Core.SflCanvasObject;
export type Side = NonNullable<Interaction.InsertLinkOptions['fromSide']>;
export type IsometricFace = Interaction.InsertConnectionOptions['fromFace'];

/**
 * The element the diagram is drawn in. Same shape as the <stickyflow-diagram>
 * element it replaces: `viewer` is the live viewer (null while the text does
 * not render), `source` the text it was last mounted with, and `shadowRoot`
 * holds the viewer's own SVG, so the adopted stylesheets of edit mode and the
 * handle skin still apply to it.
 */
export type DiagramHost = HTMLElement & {
  source: string | null;
  viewer: Viewer | null;
};

export type {
  DeleteEvent,
  LinkToEvent,
  MoveChangeEvent,
  PropertyChangeEvent,
  QuickDuplicateEvent,
} from '../media/stickyflow/interaction/index.js';
