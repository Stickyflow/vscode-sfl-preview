// The selection look of the StickyFlow-Web Playground: a rounded selection
// ring with a soft glow, round corner handles, and floating "+" bubbles.
// stickyflow.js only draws plain square handles, the Playground restyles them
// in StickyFlow-Web's src/styles/sflHandles.css. This is the light variant of
// that sheet, scoped to the diagram's shadow root instead of `.sfl-handles`.
// Keep the two in sync until the look moves into stickyflow.js itself.

const HANDLE_SKIN = `
[data-sf-selection-overlay] {
  filter: drop-shadow(0 0 7px rgba(109, 94, 240, 0.4));
}

[data-sf-selection-overlay] > rect:not([data-sf-resize-handle]):not([data-sf-link-segment]) {
  stroke: #6d5ef0;
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
  rx: 12px;
  ry: 12px;
}

[data-sf-resize-handle] {
  fill: #ffffff;
  stroke: #6d5ef0;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
  rx: 50%;
  ry: 50%;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(2.1);
  transition: transform 0.15s ease, fill 0.15s ease;
}

[data-sf-resize-handle='top'],
[data-sf-resize-handle='right'],
[data-sf-resize-handle='bottom'],
[data-sf-resize-handle='left'] {
  fill: transparent;
  stroke: transparent;
}

[data-sf-resize-handle]:hover {
  fill: #6d5ef0;
  transform: scale(2.7);
}

[data-sf-quick-duplicate] {
  fill: #ffffff;
  stroke: rgba(109, 94, 240, 0.35);
  filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.18));
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(1.5);
  transition: transform 0.15s ease, fill 0.15s ease, stroke 0.15s ease;
}

[data-sf-quick-duplicate] + path {
  stroke: #6d5ef0;
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
  transform-box: fill-box;
  transform-origin: center;
  transform: scale(1.5);
  transition: stroke 0.15s ease;
}

[data-sf-quick-duplicate]:hover {
  fill: #6d5ef0;
  stroke: #6d5ef0;
}

[data-sf-quick-duplicate]:hover + path {
  stroke: #ffffff;
}

[data-sf-quick-duplicate='top'] { transform: translate(0, -45%) scale(1.5); }
[data-sf-quick-duplicate='bottom'] { transform: translate(0, 45%) scale(1.5); }
[data-sf-quick-duplicate='left'] { transform: translate(-45%, 0) scale(1.5); }
[data-sf-quick-duplicate='right'] { transform: translate(45%, 0) scale(1.5); }
[data-sf-quick-duplicate='top'] + path { transform: translate(0, -90%) scale(1.5); }
[data-sf-quick-duplicate='bottom'] + path { transform: translate(0, 90%) scale(1.5); }
[data-sf-quick-duplicate='left'] + path { transform: translate(-90%, 0) scale(1.5); }
[data-sf-quick-duplicate='right'] + path { transform: translate(90%, 0) scale(1.5); }

[data-sf-path-halo] {
  stroke: #6d5ef0;
  opacity: 0.35;
}

[data-sf-path-point] {
  fill: #ffffff;
  stroke: #6d5ef0;
}

[stroke='#9b42df'] {
  stroke: #6d5ef0;
}

[data-sf-link-segment] {
  fill: #ffffff;
  stroke: #6d5ef0;
  stroke-width: 1.5px;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 1px 3px rgba(15, 23, 42, 0.18));
  transition: fill 0.15s ease;
}

[data-sf-link-segment]:hover {
  fill: #6d5ef0;
}
`;

/** Adopted, like the edit-mode gate, so it survives the web component clearing its shadow DOM. */
export function applyHandleSkin(el: HTMLElement): void {
  const root = el.shadowRoot;
  if (!root || !('adoptedStyleSheets' in root)) return;
  const skin = new CSSStyleSheet();
  skin.replaceSync(HANDLE_SKIN);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, skin];
}
