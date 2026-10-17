// The "Editing: On/Off" toggle. Owns the stickyflow.js editing session
// (bindEditing) and tells the other toolbar features when it flips, so each
// of them shows or hides its own buttons.

import { applyHandleSkin } from './handleSkin.js';
import type { PreviewContext } from './session.js';
import type { EditingSession } from './stickyflow.js';

export interface EditMode {
  /** The live editing session, or null while editing is off. */
  readonly session: EditingSession | null;
  set(on: boolean): void;
  onChange(listener: (on: boolean) => void): void;
}

/** `bind` wires a fresh editing session and returns a cleanup for its state. */
export function createEditMode(
  ctx: PreviewContext,
  button: HTMLButtonElement,
  bind: (session: EditingSession) => () => void,
): EditMode {
  let session: EditingSession | null = null;
  let unbind: (() => void) | null = null;
  const listeners: Array<(on: boolean) => void> = [];

  gateEditAffordances(ctx.el);
  applyHandleSkin(ctx.el);

  const mode: EditMode = {
    get session() {
      return session;
    },
    set(on) {
      if (on && !session) {
        session = ctx.interaction.bindEditing(ctx.viewer);
        unbind = bind(session);
      } else if (!on && session) {
        session.destroy();
        unbind?.();
        session = null;
        unbind = null;
      }
      button.setAttribute('aria-pressed', String(on));
      button.textContent = on ? 'Editing: On' : 'Editing: Off';
      ctx.el.classList.toggle('sf-editing', on);
      for (const listener of listeners) listener(on);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };

  button.addEventListener('click', () => mode.set(!session));
  return mode;
}

// The viewer draws resize handles and the "+" quick-add bubbles around any
// singly-selected object straight from selection state. It has no notion of
// this preview's edit mode, and selection stays live with editing off (it
// drives editor<->canvas sync), so those affordances would be visible but
// inert. Hide them unless the host carries `sf-editing`. The rule lives in an
// adopted sheet because it survives the web component clearing its shadow
// DOM, a <style> child would not. The plain selection ring stays: it's the
// sync cue.
function gateEditAffordances(el: HTMLElement): void {
  const root = el.shadowRoot;
  if (!root || !('adoptedStyleSheets' in root)) return;
  const gate = new CSSStyleSheet();
  gate.replaceSync(
    ':host(:not(.sf-editing)) [data-sf-resize-handle],' +
    ':host(:not(.sf-editing)) [data-sf-quick-duplicate],' +
    ':host(:not(.sf-editing)) [data-sf-quick-duplicate] + path { display: none; }',
  );
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, gate];
}
