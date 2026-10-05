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

/** `background` is the style template's canvas color; without one, SVG stays
 *  transparent and PNG gets white. */
export function exportDiagram(core: CoreApi, host: HostPort, source: string, format: 'svg' | 'png', background: string | null): void {
  let result: ReturnType<CoreApi['render']>;
  try {
    result = core.render(source, { padding: 16 });
  } catch (err) {
    host.warn(`Could not export: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const svg = background ? withBackground(result.svg, background) : result.svg;
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
  const open = /<svg[^>]*>/.exec(svg);
  if (!open) return svg;
  const at = open.index + open[0].length;
  const rect = `<rect width="100%" height="100%" fill="${color.replace(/"/g, '&quot;')}"/>`;
  return svg.slice(0, at) + rect + svg.slice(at);
}
