// Compiled to media/webview/panControls.js (tsconfig.webview.json) and loaded
// by the preview webview as a browser ES module. Dependency-free — runs in the
// webview sandbox.
//
// Better panning UX for the preview canvas. stickyflow.js's viewer only pans
// while you hold Ctrl/Cmd and drag (viewer/interaction/pointer.ts +
// wheel.ts) — not discoverable, and nothing at all happens on a plain scroll
// wheel or a middle-button drag. This adds the conventions people expect from
// a canvas:
//
//   - middle-button drag                    -> pan (anywhere, even over a shape)
//   - left-button drag on empty background  -> pan
//   - plain mouse wheel                     -> pan (Shift = horizontal);
//                                              Ctrl/Cmd wheel still zooms
//   - a grab / grabbing cursor over the canvas background
//
// It doesn't reimplement the camera: each gesture is translated into the
// Ctrl-modified pointer events the viewer's own pan path already listens for,
// so the viewer's ViewportController stays the single source of truth and
// zoom / getViewport() keep working normally.

/** Elements that own a pointer press — a left-drag starting on one of these is
 *  a select / move / resize / reconnect, never a pan. */
const INTERACTIVE_SELECTOR = '[data-sf-id],[data-sf-resize-handle],[data-sf-link-endpoint],[data-sf-quick-duplicate]';

/** Pointer travel (screen px) at which a press becomes a pan drag. */
const PAN_START_PX = 3;

export type PanGesture = 'none' | 'middle' | 'background';

/** Classify a pointerdown. `overInteractive` is whether the press landed on a
 *  shape / handle / endpoint. A Ctrl/Cmd press is left to the viewer's own pan
 *  path, so it returns 'none'. */
export function panGesture(button: number, ctrlKey: boolean, metaKey: boolean, overInteractive: boolean): PanGesture {
  if (ctrlKey || metaKey) {
    return 'none';
  }
  if (button === 1) {
    return 'middle';
  }
  if (button === 0 && !overInteractive) {
    return 'background';
  }
  return 'none';
}

/** Wheel delta in CSS pixels, normalising line- and page-mode deltas. */
export function wheelPixels(deltaX: number, deltaY: number, deltaMode: number): { x: number; y: number } {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1;
  return { x: deltaX * unit, y: deltaY * unit };
}

/** Screen-space pan delta for a wheel event: vertical by default, horizontal
 *  when Shift is held on a vertical-only wheel. */
export function wheelPanDelta(deltaX: number, deltaY: number, deltaMode: number, shiftKey: boolean): { dx: number; dy: number } {
  const { x, y } = wheelPixels(deltaX, deltaY, deltaMode);
  const neg = (n: number): number => (n === 0 ? 0 : -n); // avoid -0
  if (shiftKey && x === 0) {
    return { dx: neg(y), dy: 0 };
  }
  return { dx: neg(x), dy: neg(y) };
}

export interface PanHandle {
  destroy(): void;
}

const SYNTH_POINTER_ID = 91_000; // fixed, distinct from any real pointer id

function synth(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, ctrlKey: true, pointerId: SYNTH_POINTER_ID, ...init });
}

/** setPointerCapture / releasePointerCapture throw if the id isn't an active
 *  pointer (a race on fast release, or a synthetic event in a test). Capture is
 *  a nicety here — the drag still works without it — so swallow the failure. */
function capture(svg: SVGSVGElement, pointerId: number, on: boolean): void {
  try {
    if (on) {
      svg.setPointerCapture?.(pointerId);
    } else {
      svg.releasePointerCapture?.(pointerId);
    }
  } catch {
    /* not an active pointer — fine */
  }
}

export function bindPanControls(svg: SVGSVGElement): PanHandle {
  const priorCursor = svg.style.cursor;
  svg.style.cursor = 'grab';

  let drag: { pointerId: number; startX: number; startY: number; lastX: number; lastY: number; started: boolean } | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    if (drag) {
      return;
    }
    const overInteractive = Boolean((event.target as Element | null)?.closest?.(INTERACTIVE_SELECTOR));
    if (panGesture(event.button, event.ctrlKey, event.metaKey, overInteractive) === 'none') {
      return;
    }
    event.preventDefault(); // middle-button autoscroll / text selection
    capture(svg, event.pointerId, true);
    svg.style.cursor = 'grabbing';
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      started: false,
    };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (!drag.started) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < PAN_START_PX) {
        return;
      }
      // Open a synthetic Ctrl-drag on the viewer's own pan path.
      svg.dispatchEvent(synth('pointerdown', { button: 0, buttons: 1, clientX: drag.startX, clientY: drag.startY }));
      drag.started = true;
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    // panBy() reads only movementX/movementY; clientX/Y are carried so the
    // viewer's drag-threshold (distance from the synthetic pointerdown) is met.
    svg.dispatchEvent(
      synth('pointermove', { buttons: 1, clientX: event.clientX, clientY: event.clientY, movementX: dx, movementY: dy }),
    );
    event.preventDefault();
  };

  const endDrag = (event: PointerEvent): void => {
    if (!drag) {
      return;
    }
    if (event.type !== 'pointercancel' && event.pointerId !== drag.pointerId) {
      return;
    }
    // No synthetic pointerup: leaving the viewer's #down with moved === true is
    // exactly what stops the trailing *real* pointerup from being read as a
    // click (which would clear or change the selection). The real pointerup
    // clears #down itself.
    capture(svg, drag.pointerId, false);
    svg.style.cursor = 'grab';
    drag = null;
  };

  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) {
      return; // zoom — the viewer's own wheel handler owns this
    }
    const { dx, dy } = wheelPanDelta(event.deltaX, event.deltaY, event.deltaMode, event.shiftKey);
    if (dx === 0 && dy === 0) {
      return;
    }
    event.preventDefault();
    // A self-contained synthetic Ctrl-drag: down far from move so the
    // threshold is crossed, then up to clear the viewer's #down.
    svg.dispatchEvent(synth('pointerdown', { button: 0, buttons: 1, clientX: 0, clientY: 0 }));
    svg.dispatchEvent(synth('pointermove', { buttons: 1, clientX: 1000, clientY: 1000, movementX: dx, movementY: dy }));
    svg.dispatchEvent(synth('pointerup', { clientX: 1000, clientY: 1000 }));
  };

  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('wheel', onWheel, { passive: false });

  return {
    destroy() {
      if (drag) {
        capture(svg, drag.pointerId, false);
        drag = null;
      }
      svg.style.cursor = priorCursor;
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', endDrag);
      svg.removeEventListener('pointercancel', endDrag);
      svg.removeEventListener('wheel', onWheel);
    },
  };
}
