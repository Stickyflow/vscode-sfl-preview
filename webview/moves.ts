// Gesture batching for edit mode. Pure, no DOM.

/** bindEditing() emits one moveChange per moved owner, and a dragged
 *  frame/swimlane brings its contained children along with the same delta.
 *  Child positions are relative to the parent's origin, so once the parent
 *  moves the children already follow it: patching them too would move them
 *  twice. Keeps only the moves with no ancestor moving in the same gesture. */
export function withoutNestedMoves<T extends { owner: { id: string } }>(
  moves: readonly T[],
  parentOf: (id: string) => string | undefined,
): T[] {
  const moving = new Set(moves.map((m) => m.owner.id));
  const hasMovingAncestor = (id: string) => {
    const seen = new Set<string>();
    for (let p = parentOf(id); p && !seen.has(p); p = parentOf(p)) {
      if (moving.has(p)) return true;
      seen.add(p);
    }
    return false;
  };
  return moves.filter((m) => !hasMovingAncestor(m.owner.id));
}

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
