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
  /** Shows `next` instead of the document until the next receive() or
   *  commit(), or the document again with `null`. Nothing is sent to the host. */
  showTransient(next: string | null): void;
  /** Called with the text on screen whenever it changes. */
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
  // Text on screen in place of `source` (see showTransient), or null.
  let transient: string | null = null;
  const listeners: Array<(source: string) => void> = [];
  const changed = (shown = source) => {
    for (const listener of listeners) listener(shown);
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
      if (next === source && transient === null) return;
      transient = null;
      if (next !== source) host.edit(next);
      source = next;
      viewer.update({ source });
      changed();
    },
    receive(next, likelyExternalRewrite) {
      const shown = transient;
      transient = null;
      if (next === shown) {
        // The previewed template was applied: it's already on screen, so
        // adopt the text without re-rendering or flashing every block.
        source = next;
        return;
      }
      if (next === source) {
        if (shown !== null) {
          viewer.update({ source });
          changed();
        }
        return;
      }
      source = next;
      // highlightChanges only here, not in commit(): the user just watched
      // their own drag/resize/create happen and doesn't need it flashed back.
      viewer.update({ source, highlightChanges: likelyExternalRewrite ? { color: EXTERNAL_REWRITE_COLOR } : true });
      changed();
    },
    showTransient(next) {
      const target = next === source ? null : next;
      if (target === transient) return;
      transient = target;
      const shown = transient ?? source;
      viewer.update({ source: shown });
      changed(shown);
    },
    objects,
    objectById: (id) => objects().find((o) => o.id === id),
    nextId: (prefix, within) => nextId(prefix, within ?? source),
    onChange: (listener) => {
      listeners.push(listener);
    },
  };
}
