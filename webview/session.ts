// The document as this webview knows it, and the context every feature
// module gets. There is one rule for changing the SFL text: canvas edits go
// through `commit()` (re-render without a highlight, send to the host), and
// edits from the host arrive through `receive()` (re-render with a highlight,
// don't echo back).

import type { HostPort } from './host.js';
import { nextId } from './ids.js';
import type { CanvasObject, CoreApi, InteractionApi, StickyflowDiagram, Viewer } from './stickyflow.js';

// Second change-highlight color, for updates the host's
// looksLikeExternalRewrite() flags as probably not ordinary in-editor typing
// (a whole-document replace, e.g. mcp-sfl writing the file directly). Same
// blue as NEW_ENTITY_STYLE's stroke. A guess at the edit's shape, not real
// provenance: a git checkout or a select-all + paste look identical.
const EXTERNAL_REWRITE_COLOR = '#2563eb';

export interface DocumentSession {
  /** The current SFL text. */
  readonly source: string;
  /** Applies a canvas edit. No-op when `next` is unchanged. */
  commit(next: string): void;
  /** Applies an edit from the host (text editor or the file on disk). */
  receive(next: string, likelyExternalRewrite: boolean): void;
  /** Canvas objects of the current text, or [] when it doesn't parse. */
  objects(): CanvasObject[];
  objectById(id: string): CanvasObject | undefined;
  /** A fresh `<prefix>_<n>` id, checked against `within` (default: the current text). */
  nextId(prefix: string, within?: string): string;
  /** Called after every commit or receive that changed the text. */
  onChange(listener: (source: string) => void): void;
}

export interface PreviewContext {
  el: StickyflowDiagram;
  viewer: Viewer;
  interaction: InteractionApi;
  core: CoreApi;
  host: HostPort;
  doc: DocumentSession;
}

export function createDocumentSession(viewer: Viewer, core: CoreApi, host: HostPort, initial: string): DocumentSession {
  let source = initial;
  const listeners: Array<(source: string) => void> = [];
  const changed = () => {
    for (const listener of listeners) listener(source);
  };

  const objects = (): CanvasObject[] => {
    try {
      return core.sflToCanvasState(source).canvasObjects;
    } catch {
      return [];
    }
  };

  return {
    get source() {
      return source;
    },
    commit(next) {
      if (next === source) return;
      source = next;
      viewer.update({ source });
      host.edit(source);
      changed();
    },
    receive(next, likelyExternalRewrite) {
      if (next === source) return;
      source = next;
      // highlightChanges only here, not in commit(): the user just watched
      // their own drag/resize/create happen and doesn't need it flashed back.
      viewer.update({ source, highlightChanges: likelyExternalRewrite ? { color: EXTERNAL_REWRITE_COLOR } : true });
      changed();
    },
    objects,
    objectById: (id) => objects().find((o) => o.id === id),
    nextId: (prefix, within) => nextId(prefix, within ?? source),
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
