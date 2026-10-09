// "Export SVG" / "Export PNG". Re-renders the current text with stickyflow.js's
// static render() at its natural bounds instead of serializing the live
// <svg>: that element's viewBox follows the reader's pan/zoom, so it would
// export whatever is in view, cropped to it. PNG rasterizes that SVG through
// an offscreen <canvas>. A webview can't open a save dialog or write files,
// so the payload goes to the host as `sfl/export` (see panel.ts).

import type { CoreApi } from './stickyflow.js';
import type { HostPort } from './host.js';

/** PNG resolution as a multiple of the diagram's own size, independent of
 *  the display's DPI: the reader's screen shouldn't decide the file's size. */
const PNG_EXPORT_SCALE = 2;

/** A bundled Inter subset (see INTER_FACES in src/getWebviewHtml.ts). */
export interface BundledFont {
  url: string;
  unicodeRange: string;
}

/** `background` is the style template's canvas color; without one, SVG stays
 *  transparent and PNG gets white. */
export async function exportDiagram(
  core: CoreApi,
  host: HostPort,
  source: string,
  format: 'svg' | 'png',
  background: string | null,
  fonts: BundledFont[],
): Promise<void> {
  let result: ReturnType<CoreApi['render']>;
  try {
    result = core.render(source, { padding: 16 });
  } catch (err) {
    host.warn(`Could not export: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  let svg = result.svg;
  try {
    svg = withFonts(svg, await fontFaceCss(svg, fonts));
  } catch (err) {
    host.warn(`Exporting without the embedded Inter font: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (background) svg = withBackground(svg, background);
  if (format === 'svg') {
    host.export('svg', svg);
    return;
  }
  const { width, height } = result;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * PNG_EXPORT_SCALE));
    canvas.height = Math.max(1, Math.round(height * PNG_EXPORT_SCALE));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      host.warn('Could not rasterize the diagram for PNG export.');
      return;
    }
    // Without a template the SVG has no background (transparent by design),
    // so fill white: text tuned for a light canvas would vanish on a dark one.
    ctx.fillStyle = background ?? '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    host.export('png', canvas.toDataURL('image/png'));
  };
  img.onerror = () => host.warn('Could not rasterize the diagram for PNG export.');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Paints `color` behind everything, as the first child of the root <svg>. */
function withBackground(svg: string, color: string): string {
  const rect = `<rect width="100%" height="100%" fill="${color.replace(/"/g, '&quot;')}"/>`;
  return afterOpenTag(svg, rect);
}

function withFonts(svg: string, css: string): string {
  return css ? afterOpenTag(svg, `<style>${css}</style>`) : svg;
}

function afterOpenTag(svg: string, markup: string): string {
  const open = /<svg[^>]*>/.exec(svg);
  if (!open) return svg;
  const at = open.index + open[0].length;
  return svg.slice(0, at) + markup + svg.slice(at);
}

/** @font-face rules for the Inter subsets the diagram's text needs, with the
 *  font files inlined: an exported SVG, and the <img> a PNG is rasterized
 *  from, can't load anything outside themselves. Empty when no text is set
 *  in Inter, so a diagram in other fonts doesn't carry ~65 KB per subset. */
async function fontFaceCss(svg: string, fonts: BundledFont[]): Promise<string> {
  if (!/font-family="[^"]*Inter/.test(svg)) return '';
  const text = textContent(svg);
  const rules = await Promise.all(
    fonts
      .filter((font) => coversAny(font.unicodeRange, text))
      .map(async (font) => {
        const data = await base64Of(font.url);
        return `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${font.unicodeRange}}`;
      }),
  );
  return rules.join('');
}

/** The SVG's text, tags stripped and numeric character references decoded. */
function textContent(svg: string): string {
  return svg
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)));
}

/** Whether any character of `text` falls in a CSS unicode-range list. */
function coversAny(unicodeRange: string, text: string): boolean {
  const ranges = unicodeRange.split(',').map((part) => {
    const [lo, hi] = part.trim().replace(/^U\+/i, '').split('-');
    return [parseInt(lo, 16), parseInt(hi ?? lo, 16)] as const;
  });
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (ranges.some(([lo, hi]) => code >= lo && code <= hi)) return true;
  }
  return false;
}

const fontData = new Map<string, Promise<string>>();

function base64Of(url: string): Promise<string> {
  let data = fontData.get(url);
  if (!data) {
    data = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`could not load ${url} (${response.status})`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(binary);
      });
    // A failed fetch shouldn't stick: drop it so the next export retries.
    data.catch(() => fontData.delete(url));
    fontData.set(url, data);
  }
  return data;
}
