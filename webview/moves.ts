// Gesture batching for edit mode. Pure, no DOM.

/** Collects events that arrive synchronously within one gesture and hands
 *  them to `flush` together on the next microtask, so a single drag commits
 *  as a single edit (and a single undo step). */
export function createBatcher<T>(flush: (events: T[]) => void): { push(event: T): void; clear(): void } {
  let pending: T[] = [];
  return {
    push(event) {
      if (pending.length === 0) {
        queueMicrotask(() => {
          const events = pending;
          pending = [];
          if (events.length > 0) flush(events);
        });
      }
      pending.push(event);
    },
    clear() {
      pending = [];
    },
  };
}
