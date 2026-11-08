import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { toGemini } from './schema';
import {
  defaultPolicy,
  loadSettings,
  type CallResult,
  type Request,
  type Response,
  type Status,
  type ToolInfo,
} from './shared';

interface Conn {
  key: string;
  client: Client;
  serverName?: string;
  tools: ToolInfo[];
}

let conn: Conn | null = null;
let connecting: Promise<Conn> | null = null;

async function connect(force = false): Promise<Conn> {
  const s = await loadSettings();
  if (!s.serverUrl) throw new Error('还没有配置 MCP 服务器，去扩展设置页填地址');
  const key = `${s.serverUrl}\n${s.token}`;
  if (!force && conn && conn.key === key) return conn;
  if (connecting && !force) return connecting;

  connecting = (async () => {
    if (conn) await conn.client.close().catch(() => {});
    conn = null;
    const url = new URL(s.serverUrl);
    const headers: Record<string, string> = {};
    if (s.token) headers.Authorization = `Bearer ${s.token}`;
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
    const client = new Client({ name: 'aistudio-mcp-bridge', version: '0.1.0' });
    try {
      await client.connect(transport);
    } catch (e) {
      throw new Error(`连不上 ${url.origin}：${errText(e)}`);
    }
    const listed = await client.listTools();
    const tools: ToolInfo[] = listed.tools.map(t => {
      const info: ToolInfo = {
        name: t.name,
        title: t.title,
        description: t.description ?? '',
        readOnly: t.annotations?.readOnlyHint,
        policy: s.policies[t.name] ?? defaultPolicy(t.annotations?.readOnlyHint),
      };
      try {
        info.declaration = {
          name: t.name,
          description: t.description ?? '',
          parameters: toGemini(t.inputSchema, t.name),
        };
      } catch (e) {
        info.schemaError = errText(e);
      }
      return info;
    });
    conn = { key, client, serverName: client.getServerVersion()?.name, tools };
    return conn;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function status(refresh: boolean): Promise<Status> {
  const s = await loadSettings();
  if (!s.serverUrl) return { configured: false, connected: false, tools: [] };
  try {
    const c = await connect(refresh);
    // Policies can change in the options page without a reconnect.
    for (const t of c.tools) t.policy = s.policies[t.name] ?? defaultPolicy(t.readOnly);
    return { configured: true, connected: true, server: new URL(s.serverUrl).host, serverName: c.serverName, tools: c.tools };
  } catch (e) {
    return { configured: true, connected: false, server: safeHost(s.serverUrl), tools: [], error: errText(e) };
  }
}

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const started = Date.now();
  let c = await connect();
  const policy = c.tools.find(t => t.name === name)?.policy;
  if (!policy) throw new Error(`服务器上没有工具 ${name}`);
  if (policy === 'off') throw new Error(`${name} 在设置里被停用了`);

  let result;
  try {
    result = await c.client.callTool({ name, arguments: args });
  } catch (e) {
    // A dead session (worker restart, server restart) gets one fresh connection.
    if (!/session|404|closed|not connected/i.test(errText(e))) throw e;
    c = await connect(true);
    result = await c.client.callTool({ name, arguments: args });
  }

  const content = (result.content ?? []) as Array<{ type: string; text?: string; data?: string; mimeType?: string; uri?: string; resource?: { uri?: string; text?: string } }>;
  const texts: string[] = [];
  const images: string[] = [];
  for (const part of content) {
    if (part.type === 'text' && part.text) texts.push(part.text);
    else if (part.type === 'image' && part.data) images.push(`data:${part.mimeType ?? 'image/png'};base64,${part.data}`);
    else if (part.type === 'resource_link' && part.uri) texts.push(part.uri);
    else if (part.type === 'resource' && part.resource) texts.push(part.resource.text ?? part.resource.uri ?? '');
    else texts.push(`[${part.type} 内容未转发]`);
  }
  const text = texts.join('\n\n');
  const body: Record<string, unknown> = result.isError ? { error: text } : { result: text };
  if (result.structuredContent) body.structured = result.structuredContent;
  if (images.length) body.note = `工具还返回了 ${images.length} 张图片，已在扩展面板里展示给用户；你看不到这些图片。`;
  return { ok: !result.isError, response: JSON.stringify(body), text, images, ms: Date.now() - started };
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function safeHost(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
}

chrome.runtime.onMessage.addListener((req: Request, _sender, reply: (r: Response<unknown>) => void) => {
  const run = async (): Promise<unknown> => {
    switch (req.type) {
      case 'status':
        return status(!!req.refresh);
      case 'call':
        return call(req.name, req.args);
      case 'open-options':
        await chrome.runtime.openOptionsPage();
        return null;
      case 'reload':
        // Development: lets the AI Studio tab pick up a fresh build without chrome://extensions.
        if (!__DEV__) throw new Error('reload is only available in development builds');
        setTimeout(() => chrome.runtime.reload(), 50);
        return null;
    }
  };
  run().then(
    data => reply({ ok: true, data }),
    e => reply({ ok: false, error: errText(e) }),
  );
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

// Settings changed in the options page: drop the connection so the next request uses them.
chrome.storage.onChanged.addListener(changes => {
  if (changes.serverUrl || changes.token) {
    conn?.client.close().catch(() => {});
    conn = null;
  }
});
