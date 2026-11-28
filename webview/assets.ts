// Where a document's Mesh assets are loaded from. Pure, no DOM.
//
// stickyflow.js asks `resolveAsset` for the address of every asset a document
// names: a glTF model, a terrain's heights and picture, an environment. A
// relative name resolves against the .sfl file's folder, which the panel makes
// a local resource root (src/panel.ts), so the webview can read it. A leading
// slash counts from that same folder, not from the drive root.
//
// What may load: data: and blob: addresses (inline, or made in this page), and
// relative names. Any other scheme (http, https, file, ...) is refused, which
// is what the webview's CSP would do anyway: connect-src carries no web origin.

/** The viewer's `resolveAsset` for a document in `folderUrl` (a webview URI
 *  ending in "/"), or for a document with no folder when it is null. */
export function resolveAssetIn(folderUrl: string | null): (asset: string) => string | null {
  return (asset) => {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(asset)?.[1].toLowerCase();
    if (scheme) return scheme === 'data' || scheme === 'blob' ? asset : null;
    if (folderUrl === null) return null;
    const name = asset.replace(/^\/+/, '');
    // A name that climbs out of the folder resolves outside the local resource
    // root, where the webview refuses to read it.
    return new URL(name, folderUrl).toString();
  };
}
