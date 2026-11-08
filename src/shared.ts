// Types and storage shared by the background worker, the options page and the content script.

export type Policy = 'auto' | 'confirm' | 'off';

export interface Settings {
  serverUrl: string;
  token: string;
  /** Per-tool policy; a tool missing here falls back to defaultPolicy(readOnlyHint). */
  policies: Record<string, Policy>;
}

export interface Declaration {
  name: string;
  description: string;
  parameters: unknown;
}

export interface ToolInfo {
  name: string;
  title?: string;
  description: string;
  policy: Policy;
  /** The server's readOnlyHint annotation, if it sent one. */
  readOnly?: boolean;
  declaration?: Declaration;
  /** Set when the input schema cannot be expressed in AI Studio's schema subset. */
  schemaError?: string;
}

export interface Status {
  configured: boolean;
  connected: boolean;
  server?: string;
  serverName?: string;
  tools: ToolInfo[];
  error?: string;
}

export interface CallResult {
  ok: boolean;
  /** JSON string to put into AI Studio's function response field. */
  response: string;
  /** Plain text shown in the panel. */
  text: string;
  /** Images the tool returned, as data: URLs. The model never sees these. */
  images: string[];
  ms: number;
}

export type Request =
  | { type: 'status'; refresh?: boolean }
  | { type: 'call'; name: string; args: Record<string, unknown> }
  | { type: 'open-options' }
  | { type: 'reload' };

export type Response<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Only tools the server marks read-only (MCP annotation readOnlyHint) run without a click.
 * Everything else, including tools without annotations, waits for the user unless they change it.
 */
export function defaultPolicy(readOnlyHint: boolean | undefined): Policy {
  return readOnlyHint === true ? 'auto' : 'confirm';
}

export async function loadSettings(): Promise<Settings> {
  const s = await chrome.storage.local.get(['serverUrl', 'token', 'policies']);
  return {
    serverUrl: typeof s.serverUrl === 'string' ? s.serverUrl : '',
    token: typeof s.token === 'string' ? s.token : '',
    policies: (s.policies as Record<string, Policy>) ?? {},
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function send<T>(req: Request): Promise<T> {
  const res = (await chrome.runtime.sendMessage(req)) as Response<T> | undefined;
  if (!res) throw new Error('扩展后台没有响应');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
