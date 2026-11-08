# AI Studio MCP Bridge

A Chrome extension that lets [Google AI Studio](https://aistudio.google.com)'s **native function calling** run tools from a remote [MCP](https://modelcontextprotocol.io) server.

Other browser bridges teach the model a text format through a long injected prompt, parse its replies, and paste tool output back as a user message. This extension uses the function calling feature AI Studio already has instead:

1. It converts the MCP server's tool schemas into AI Studio function declarations and saves them into the current chat's *Function calling* settings.
2. When the model emits a function call, it runs that tool on the MCP server.
3. It answers through AI Studio's own *function response* field, so the model receives a real `functionResponse` part tied to the call id, the same as through the Gemini API.

No system prompt to paste, no format for the model to get wrong, and parallel calls work.

> Unofficial, not affiliated with Google. It drives AI Studio's web UI, so a redesign of the page can break it until the selectors are updated. All selectors live in [`src/studio.ts`](src/studio.ts), and when one stops matching the extension says which one instead of failing silently.

The interface is in Chinese for now; the labels below are quoted as they appear, with a translation.

## Install

There is no Web Store build yet. Build it from source (Node 18+):

```bash
git clone https://github.com/H4S2O8/aistudio-mcp-bridge.git
cd aistudio-mcp-bridge
npm ci
npm run build
```

Then open `chrome://extensions`, turn on *Developer mode*, click *Load unpacked* and pick the `dist` folder.

## Set up

Click the extension's toolbar icon to open its settings:

- **MCP address**: a Streamable HTTP endpoint, e.g. `https://example.com/mcp`. SSE-only servers are not supported.
- **Bearer token**: optional; sent as `Authorization: Bearer …`. You can also paste `https://example.com/mcp#bearer=TOKEN` into the address field and it is split into the two fields on save.
- **保存并连接** (save and connect): Chrome asks for permission to reach that host. The extension only has access to `aistudio.google.com` until you grant it.

Each tool gets a policy:

| Policy | Meaning |
| --- | --- |
| 自动 (auto) | Runs as soon as the model calls it. |
| 确认 (confirm) | Waits for you to click 执行 (run) or 拒绝 (decline) on the call card. |
| 停用 (off) | Not declared to the model at all. |

The default is *auto* only for tools the server marks read-only (`readOnlyHint: true`), and *confirm* for everything else.

## Use

1. Open a chat in AI Studio and click **MCP** in the prompt box. The dot is green when the server is connected.
2. Click **写入 N 个工具到本对话** (write N tools to this chat). This turns on *Function calling* and saves the declarations. AI Studio resets this for every new chat, so do it once per chat. Turning on function calling disables AI Studio's built-in tools (Google Search, URL context, code execution); that is AI Studio's rule.
3. Chat as usual. Each function call card gets a status bar: running, waiting for confirmation, done (with the raw output and timing), or failed (retry, or send the error to the model).

Calls that were already waiting when the page loaded always ask for confirmation, so a reload never runs a tool twice.

## Limitations

- **Images:** AI Studio's function response field takes text only. Images a tool returns are shown to you in the call card, and the model is told it cannot see them.
- **Schemas:** AI Studio accepts a subset of JSON Schema. [`src/schema.ts`](src/schema.ts) drops `additionalProperties`, turns "X or a list of X" into a list, and turns `exclusiveMinimum`/`exclusiveMaximum` on integers into `minimum`/`maximum`. Anything it cannot translate faithfully, such as `$ref` or other `anyOf` shapes, marks that tool unusable in the settings page instead of declaring a different schema.
- **Transport:** Streamable HTTP only, no stdio. For a local stdio server, put an HTTP wrapper in front of it.

## Security notes

- The server address and token live in `chrome.storage.local` on your machine and are only sent to that server.
- Tool calls run with whatever rights the token has. Keep anything that writes data or spends money on *confirm*.
- Tool output becomes input to the model. Treat tools that return untrusted text (web pages, other people's notes) accordingly.

## Development

```bash
npm run typecheck
npm run build:dev   # adds a reload hook for faster iteration
```

In a dev build, running `window.postMessage({ mcpBridge: 'reload' }, '*')` in an AI Studio tab reloads the extension after a rebuild; reload the tab afterwards. Release builds (`npm run build`) do not include this hook.

## License

MIT

---

### 中文简介

让 AI Studio 网页里的**原生函数调用**直接执行远程 MCP 服务器上的工具。插件把 MCP 工具转换成 AI Studio 的函数声明写进对话。模型发起调用后，插件去 MCP 服务器执行，再通过 AI Studio 自带的 function response 输入框回复，模型收到的是真正的 `functionResponse`，跟走 Gemini API 一样。不用注入提示词，也不用让模型按约定格式手写调用。安装、设置和使用方法见上文。
