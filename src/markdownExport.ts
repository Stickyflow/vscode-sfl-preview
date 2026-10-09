// "Export Markdown": the diagram as a Markdown note, the SFL in a fenced
// ```sfl block under a heading named after the file. Renderers that know the
// fence (the Obsidian plugin, the StickyFlow docs) draw it live; everywhere
// else it stays readable source. Pure, so the host builds it from the
// document text without the webview.

/** `# <title>` and the source in a fence longer than any backtick run inside
 *  it, so a source that itself contains ``` can't close the block early. */
export function sflToMarkdown(title: string, source: string): string {
  const longestRun = Math.max(0, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const body = source.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return `# ${title}\n\n${fence}sfl\n${body}\n${fence}\n`;
}
