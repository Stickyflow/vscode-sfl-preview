// Fresh block ids for canvas-created objects.

const DECLARED_ID = /\b(?:Shape|Entity|Container|Table|Link|Isometric|Connection)\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;

/** A `<prefix>_<n>` id not already declared anywhere in `sfl`. The insert*
 *  patchers silently no-op on a collision, so this only needs to be a
 *  good-faith pick, not a guaranteed-unique one. Pass the already patched
 *  text when picking a second id for an edit that isn't committed yet. */
export function nextId(prefix: string, sfl: string): string {
  const taken = new Set([...sfl.matchAll(DECLARED_ID)].map((m) => m[1]));
  let n = taken.size + 1;
  while (taken.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}
