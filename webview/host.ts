// The `sfl/*` postMessage protocol between this webview and the extension host
// (src/panel.ts owns the other end). Every message the webview sends goes
// through a `HostPort`, so the feature modules never touch `acquireVsCodeApi`
// and the message shapes live in one place.

export type WebviewToHostMessage =
  | { type: 'sfl/edit'; source: string }
  | { type: 'sfl/reveal'; id: string | null }
  | { type: 'sfl/warn'; message: string }
  | { type: 'sfl/export'; format: 'svg' | 'png'; data: string }
  | { type: 'sfl/pickTemplate' }
  | { type: 'sfl/sceneDiff'; added: string[]; removed: string[]; changed: string[] };

export type HostToWebviewMessage =
  | { type: 'sfl/update'; source: string; likelyExternalRewrite?: boolean }
  /** Text to show without it being the document (a style template the picker
   *  has highlighted); `null` shows the document again. */
  | { type: 'sfl/transient'; source: string | null }
  | { type: 'sfl/select'; id: string | null };

export interface HostPort {
  edit(source: string): void;
  reveal(id: string | null): void;
  warn(message: string): void;
  export(format: 'svg' | 'png', data: string): void;
  /** Opens vscode-sfl's "Apply Style Template" picker for this document. */
  pickTemplate(): void;
  sceneDiff(diff: { added: string[]; removed: string[]; changed: string[] }): void;
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
}

export function createHostPort(api: VsCodeApi): HostPort {
  const post = (message: WebviewToHostMessage) => api.postMessage(message);
  return {
    edit: (source) => post({ type: 'sfl/edit', source }),
    reveal: (id) => post({ type: 'sfl/reveal', id }),
    warn: (message) => post({ type: 'sfl/warn', message }),
    export: (format, data) => post({ type: 'sfl/export', format, data }),
    pickTemplate: () => post({ type: 'sfl/pickTemplate' }),
    sceneDiff: ({ added, removed, changed }) => post({ type: 'sfl/sceneDiff', added, removed, changed }),
  };
}

/** Narrows an incoming `message` event payload to a known host message. */
export function asHostMessage(data: unknown): HostToWebviewMessage | null {
  if (!data || typeof data !== 'object') return null;
  const message = data as { type?: unknown; source?: unknown; id?: unknown };
  if (message.type === 'sfl/update' && typeof message.source === 'string') return message as HostToWebviewMessage;
  if (message.type === 'sfl/transient') return { type: 'sfl/transient', source: typeof message.source === 'string' ? message.source : null };
  if (message.type === 'sfl/select') return { type: 'sfl/select', id: typeof message.id === 'string' && message.id ? message.id : null };
  return null;
}
