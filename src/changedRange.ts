// The smallest part of a text that has to be replaced to turn it into
// another: everything before the first and after the last differing
// character stays. Pure, no VS Code, so it can be checked without an editor.

export interface ChangedRange {
  /** Offset in the old text where the change starts. */
  start: number;
  /** Offset in the old text where the change ends (exclusive). */
  end: number;
  /** What replaces old[start, end). */
  text: string;
}

/** Returns undefined when the two texts are equal. A cut never falls
 *  between the \r and \n of a line break. */
export function changedRange(oldText: string, newText: string): ChangedRange | undefined {
  if (oldText === newText) return undefined;
  const max = Math.min(oldText.length, newText.length);

  let start = 0;
  while (start < max && oldText.charCodeAt(start) === newText.charCodeAt(start)) start++;
  if (start > 0 && oldText.charCodeAt(start - 1) === 13) start--; // keep \r\n together

  let tail = 0;
  while (
    tail < max - start &&
    oldText.charCodeAt(oldText.length - 1 - tail) === newText.charCodeAt(newText.length - 1 - tail)
  ) tail++;
  if (tail > 0 && oldText.charCodeAt(oldText.length - tail) === 10 && oldText.charCodeAt(oldText.length - tail - 1) === 13) tail--;

  return { start, end: oldText.length - tail, text: newText.slice(start, newText.length - tail) };
}
