import { send, type CallResult, type Status, type ToolInfo } from './shared';
import { allCalls, answer, functionCallingOn, isGenerating, pageIsDark, readCall, SEL, writeDeclarations } from './studio';
import { h, ICON, openImage, shadowHost } from './ui';

type Phase = 'confirm' | 'queued' | 'running' | 'answering' | 'done' | 'failed' | 'blocked' | 'rejected' | 'manual';

interface Call {
  id: string;
  name: string;
  args: Record<string, unknown>;
  phase: Phase;
  /** Already on the page when we started watching: never auto-run it. */
  stale: boolean;
  result?: CallResult;
  error?: string;
}

const calls = new Map<string, Call>();
let status: Status | null = null;
let statusError: string | null = null;
let firstScan = true;
let working = false;

// ---------- status ----------

async function loadStatus(refresh = false) {
  try {
    status = await send<Status>({ type: 'status', refresh });
    statusError = null;
  } catch (e) {
    status = null;
    statusError = e instanceof Error ? e.message : String(e);
  }
  // Calls that were blocked by a missing connection get another look, but never auto-run.
  for (const c of calls.values()) {
    if (c.phase !== 'blocked') continue;
    const p = initialPhase({ ...c, stale: true });
    if (p !== 'blocked') set(c, { phase: 'confirm', error: undefined });
  }
  renderChip();
}

function tool(name: string): ToolInfo | undefined {
  return status?.tools.find(t => t.name === name);
}

// ---------- engine ----------

function scan() {
  for (const c of allCalls()) {
    const known = calls.get(c.id);
    if (known) {
      if (!c.pending && !['done', 'rejected', 'answering'].includes(known.phase)) known.phase = 'manual';
      continue;
    }
    if (!c.pending) continue; // history
    const call: Call = { id: c.id, name: c.name, args: {}, phase: 'confirm', stale: firstScan };
    try {
      Object.assign(call, readCall(c.id), { chunk: undefined });
    } catch (e) {
      call.phase = 'failed';
      call.error = e instanceof Error ? e.message : String(e);
    }
    if (call.phase !== 'failed') call.phase = initialPhase(call);
    calls.set(c.id, call);
  }
  firstScan = false;
  renderBars();
  renderChip();
  void pump();
}

function initialPhase(call: Call): Phase {
  if (!status?.connected) {
    call.error = status?.error ?? statusError ?? 'MCP 服务器未连接';
    return 'blocked';
  }
  const t = tool(call.name);
  if (!t) {
    call.error = `服务器上没有 ${call.name} 这个工具`;
    return 'blocked';
  }
  if (t.policy === 'off') {
    call.error = `${call.name} 在设置里被停用了`;
    return 'blocked';
  }
  if (call.stale) return 'confirm';
  return t.policy === 'auto' ? 'queued' : 'confirm';
}

async function pump() {
  if (working) return;
  working = true;
  try {
    for (;;) {
      const next = [...calls.values()].find(c => c.phase === 'queued');
      if (!next) break;
      await run(next);
    }
  } finally {
    working = false;
  }
}

async function run(call: Call) {
  set(call, { phase: 'running', error: undefined });
  try {
    const result = await send<CallResult>({ type: 'call', name: call.name, args: call.args });
    set(call, { result });
    await reply(call, result.response);
  } catch (e) {
    set(call, { phase: 'failed', error: e instanceof Error ? e.message : String(e) });
  }
}

async function reply(call: Call, response: string, final: Phase = 'done') {
  set(call, { phase: 'answering' });
  // Answering while the model is still writing other calls of the same turn re-renders under us.
  while (isGenerating()) await new Promise(r => setTimeout(r, 300));
  try {
    await answer(call.id, response);
    set(call, { phase: final });
  } catch (e) {
    set(call, { phase: 'failed', error: `结果拿到了，但没能填回 AI Studio：${e instanceof Error ? e.message : String(e)}` });
  }
}

function set(call: Call, patch: Partial<Call>) {
  Object.assign(call, patch);
  renderBars();
  renderChip();
}

// ---------- call bars ----------

const bars = new Map<string, { host: HTMLElement; root: HTMLElement; key: string }>();

function renderBars() {
  const dark = pageIsDark();
  for (const call of calls.values()) {
    const chunk = document.getElementById(call.id)?.querySelector(SEL.callChunk);
    const body = chunk?.querySelector('.mat-expansion-panel-body');
    if (!body) continue;
    let bar = bars.get(call.id);
    if (!bar || !bar.host.isConnected || bar.host.parentElement !== body) {
      bar?.host.remove();
      const made = shadowHost('mcp-bridge-call');
      bar = { ...made, key: '' };
      bars.set(call.id, bar);
      body.append(bar.host);
    }
    const key = JSON.stringify([call.phase, call.error, call.result?.ms, dark]);
    if (bar.key === key) continue;
    bar.key = key;
    bar.root.className = `root${dark ? ' dark' : ''}`;
    bar.root.replaceChildren(barView(call));
  }
}

function barView(call: Call): HTMLElement {
  const icon = (svg: string, cls: string) => h('span', { class: `state-icon ${cls}`, html: svg });
  const spinner = h('span', { class: 'state-icon' }, h('span', { class: 'spin' }));
  const row = (iconEl: HTMLElement, msg: Node | string, ...btns: HTMLElement[]) =>
    h('div', { class: 'bar-row' }, iconEl, h('div', { class: 'msg' }, msg), ...btns);
  const btn = (label: string, cls: string, fn: () => void) => h('button', { class: `btn sm ${cls}`, onclick: fn }, label);
  const declineError = (why: string) => JSON.stringify({ error: why });

  switch (call.phase) {
    case 'confirm':
      return h('div', { class: 'bar confirm' },
        row(icon(ICON.hand, 'warn-ink'),
          call.stale ? '这次调用在页面加载前就在等回复，需要你确认' : `${call.name} 需要你确认后才执行`,
          btn('拒绝', 'danger', () => reply(call, declineError('用户拒绝执行这次调用'), 'rejected')),
          btn('执行', 'primary', () => { set(call, { phase: 'queued' }); void pump(); })));
    case 'queued':
    case 'running':
      return h('div', { class: 'bar' }, row(spinner, h('span', {}, `正在执行 ${call.name}`, h('small', {}, 'MCP'))));
    case 'answering':
      return h('div', { class: 'bar' }, row(spinner, '正在把结果填回 AI Studio'));
    case 'rejected':
      return h('div', { class: 'bar' }, row(icon(ICON.cross, 'muted'), h('span', { class: 'muted' }, '已拒绝，已告诉模型')));
    case 'manual':
      return h('div', { class: 'bar' }, row(icon(ICON.check, 'muted'), h('span', { class: 'muted' }, '已在 AI Studio 里手动回复')));
    case 'blocked':
    case 'failed':
      return h('div', { class: `bar ${call.phase}` },
        row(icon(ICON.cross, 'bad-ink'), h('span', { class: 'bad-ink' }, call.error ?? '失败'),
          ...(call.phase === 'failed' && !call.error?.startsWith('结果拿到了') ? [btn('重试', 'tonal', () => { set(call, { phase: 'queued' }); void pump(); })] : []),
          ...(call.result && call.error?.startsWith('结果拿到了') ? [btn('再填一次', 'tonal', () => reply(call, call.result!.response))] : []),
          btn('把错误告诉模型', 'tonal', () => reply(call, declineError(call.error ?? '工具调用失败'), 'rejected'))));
    case 'done': {
      const r = call.result;
      if (!r) return h('div', { class: 'bar' }, row(icon(ICON.check, 'ok-ink'), '已回复'));
      const head = row(
        icon(r.ok ? ICON.check : ICON.cross, r.ok ? 'ok-ink' : 'bad-ink'),
        h('span', {}, r.ok ? '已执行并回复模型' : '工具返回了错误，已转告模型', h('small', {}, `${(r.ms / 1000).toFixed(1)}s`)),
      );
      const imgs = r.images.length
        ? h('div', { class: 'imgs' }, ...r.images.map(src => h('img', { src, alt: '', onclick: () => openImage(src) })))
        : null;
      const preview = r.text
        ? h('details', {}, h('summary', {}, `返回内容 · ${r.text.length} 字${r.images.length ? ` · ${r.images.length} 张图（模型看不到）` : ''}`), h('pre', { class: 'out mono' }, r.text))
        : null;
      return h('div', { class: 'bar' }, head, imgs, preview);
    }
  }
}

// ---------- chip + popover ----------

let chip: { host: HTMLElement; root: HTMLElement } | null = null;
let popOpen = false;
let popNote: { kind: 'ok' | 'bad' | 'warn'; text: string } | null = null;
let writing = false;

function ensureChip() {
  const row = document.querySelector(SEL.buttonsLeft);
  if (!row) return;
  if (chip && chip.host.isConnected && chip.host.parentElement === row) return;
  chip?.host.remove();
  chip = shadowHost('mcp-bridge-chip');
  chip.host.style.display = 'inline-flex';
  chip.host.style.alignItems = 'center';
  // ms-prompt-box-tools is flex: 1 and would push anything after it to the far right.
  row.insertBefore(chip.host, row.querySelector('ms-prompt-box-tools'));
  renderChip();
}

function renderChip() {
  if (!chip) return;
  const dark = pageIsDark();
  chip.root.className = `root${dark ? ' dark' : ''}`;
  const waiting = [...calls.values()].filter(c => c.phase === 'confirm').length;
  const busy = [...calls.values()].some(c => ['queued', 'running', 'answering'].includes(c.phase));
  const dotCls = statusError || (status?.configured && !status.connected) ? 'bad' : status?.connected ? (busy ? 'warn' : 'ok') : '';
  const button = h('button', {
    class: 'chip', 'aria-expanded': String(popOpen), title: 'MCP 工具',
    onclick: () => { popOpen = !popOpen; popNote = null; renderChip(); if (popOpen) void loadStatus(); },
  }, h('span', { html: ICON.plug, style: 'display:inline-grid' }), 'MCP', h('span', { class: `dot ${dotCls}` }), waiting ? h('span', { class: 'badge' }, String(waiting)) : null);
  mirrorChip(button);
  chip.root.replaceChildren(button);
  if (popOpen) {
    const pop = popover();
    chip.root.append(pop);
    const r = button.getBoundingClientRect();
    const w = 320;
    pop.style.left = `${Math.max(12, Math.min(r.left, innerWidth - w - 12))}px`;
    pop.style.bottom = `${innerHeight - r.top + 8}px`;
  }
}

/** Copy the look of AI Studio's Tools button so the chip sits in the row like a native one. */
function mirrorChip(button: HTMLElement) {
  const tools = document.querySelector<HTMLElement>(SEL.toolsButton);
  if (!tools) return; // keeps the CSS defaults, which were measured from the same button
  const s = getComputedStyle(tools);
  const icon = tools.querySelector('span');
  const vars: Record<string, string> = {
    '--chip-radius': s.borderRadius,
    '--chip-border': `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
    '--chip-h': s.height,
    '--chip-pad': s.padding,
    '--chip-gap': s.gap === 'normal' ? '4px' : s.gap,
    '--chip-font': `${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`,
    '--chip-color': s.color,
    '--chip-bg': s.backgroundColor,
  };
  if (icon) vars['--chip-icon'] = getComputedStyle(icon).fontSize;
  for (const [k, v] of Object.entries(vars)) button.style.setProperty(k, v);
}

function popover(): HTMLElement {
  const st = status;
  const enabled = st?.tools.filter(t => t.policy !== 'off') ?? [];
  const usable = enabled.filter(t => t.declaration);
  const broken = enabled.filter(t => t.schemaError);
  const fc = functionCallingOn();

  let headText = '未配置服务器';
  let dot = '';
  if (statusError) { headText = '扩展后台出错'; dot = 'bad'; }
  else if (st?.connected) { headText = '已连接'; dot = 'ok'; }
  else if (st?.configured) { headText = '连接失败'; dot = 'bad'; }

  const head = h('div', { class: 'head' },
    h('span', { class: `dot ${dot}` }),
    h('div', { class: 'grow' }, h('h3', {}, headText), h('div', { class: 'host' }, st?.serverName ? `${st.serverName} · ${st.server}` : st?.server ?? '在设置页填写 MCP 地址')),
    h('button', { class: 'icon-btn', title: '重新连接', html: ICON.refresh, onclick: () => { popNote = null; void loadStatus(true); } }),
    h('button', { class: 'icon-btn', title: '设置', html: ICON.gear, onclick: () => send({ type: 'open-options' }) }),
  );

  const pieces: (HTMLElement | null)[] = [head];
  if (statusError || (st?.configured && !st.connected)) pieces.push(h('div', { class: 'note bad' }, statusError ?? st?.error ?? ''));

  if (st?.connected) {
    const count = (p: string) => st.tools.filter(t => t.policy === p).length;
    pieces.push(h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, String(count('auto'))), h('span', {}, '自动执行')),
      h('div', { class: 'stat' }, h('b', {}, String(count('confirm'))), h('span', {}, '需确认')),
      h('div', { class: 'stat' }, h('b', {}, String(count('off'))), h('span', {}, '已停用')),
    ));
    pieces.push(h('div', { class: 'line' },
      h('span', { class: `dot ${fc ? 'ok' : ''}` }),
      fc === null ? '没找到 Function calling 开关（Run settings 面板关着）' : fc ? '本对话已开启函数调用' : '本对话还没开启函数调用'));
    if (broken.length) pieces.push(h('div', { class: 'note warn' }, `${broken.length} 个工具的参数结构转换失败，不会写入：${broken.map(t => t.name).join('、')}`));
  }
  if (popNote) pieces.push(h('div', { class: `note ${popNote.kind}` }, popNote.text));

  const writeBtn = h('button', {
    class: 'btn primary',
    disabled: !st?.connected || !usable.length || writing,
    onclick: async () => {
      writing = true; popNote = null; renderChip();
      try {
        await writeDeclarations(usable.map(t => t.declaration!));
        popNote = { kind: 'ok', text: `已写入 ${usable.length} 个工具。开启函数调用后，Google 搜索等内置工具会被 AI Studio 关掉。` };
      } catch (e) {
        popNote = { kind: 'bad', text: e instanceof Error ? e.message : String(e) };
      } finally {
        writing = false; renderChip();
      }
    },
  }, writing ? '写入中…' : `写入 ${usable.length} 个工具到本对话`);
  pieces.push(h('div', { class: 'actions' }, writeBtn));

  return h('div', { class: 'pop' }, ...pieces);
}

document.addEventListener('mousedown', e => {
  if (popOpen && chip && !e.composedPath().includes(chip.host)) {
    popOpen = false;
    renderChip();
  }
});
addEventListener('resize', () => popOpen && renderChip());

// ---------- wiring ----------

let timer: number | undefined;
new MutationObserver(muts => {
  // Ignore mutations caused by our own hosts.
  if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => n instanceof HTMLElement && n.tagName.startsWith('MCP-BRIDGE')))) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => { ensureChip(); scan(); }, 150);
}).observe(document.body, { childList: true, subtree: true });

// Development builds only (npm run build:dev): window.postMessage({ mcpBridge: 'reload' }, '*')
// reloads the extension. It can only trigger a reload, nothing else.
if (__DEV__) {
  addEventListener('message', e => {
    if (e.source === window && e.data?.mcpBridge === 'reload') void send({ type: 'reload' }).catch(() => {});
  });
}

void loadStatus().then(() => { ensureChip(); scan(); });
