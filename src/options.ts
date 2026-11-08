import { loadSettings, saveSettings, send, type Policy, type Status } from './shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const url = $<HTMLInputElement>('url');
const token = $<HTMLInputElement>('token');
const conn = $<HTMLDivElement>('conn');
const toolsBox = $<HTMLDivElement>('tools');
const saveBtn = $<HTMLButtonElement>('save');

const LABEL: Record<Policy, string> = { auto: '自动', confirm: '确认', off: '停用' };

function setConn(kind: 'idle' | 'ok' | 'bad', text: string) {
  conn.className = `conn ${kind === 'idle' ? '' : kind}`;
  conn.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }), document.createTextNode(text));
}

function renderTools(st: Status) {
  if (!st.connected) {
    toolsBox.innerHTML = '<p class="empty">连上服务器后显示工具列表。</p>';
    return;
  }
  toolsBox.replaceChildren(
    ...st.tools.map(t => {
      const row = document.createElement('div');
      row.className = 'tool';
      const name = Object.assign(document.createElement('div'), { className: 'name', textContent: t.name });
      const desc = Object.assign(document.createElement('div'), { className: 'desc', textContent: t.description, title: t.description });
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', `${t.name} 的执行方式`);
      for (const p of ['auto', 'confirm', 'off'] as Policy[]) {
        const b = Object.assign(document.createElement('button'), { type: 'button', textContent: LABEL[p] });
        b.dataset.p = p;
        b.setAttribute('aria-pressed', String(t.policy === p));
        b.addEventListener('click', async () => {
          const s = await loadSettings();
          await saveSettings({ policies: { ...s.policies, [t.name]: p } });
          t.policy = p;
          seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.p === p)));
        });
        seg.append(b);
      }
      row.append(name, seg, desc);
      if (t.schemaError) {
        row.append(Object.assign(document.createElement('div'), { className: 'err', textContent: `参数结构转不成 AI Studio 的格式，不会写进声明：${t.schemaError}` }));
      }
      return row;
    }),
  );
}

async function refresh(force: boolean) {
  setConn('idle', '连接中…');
  const st = await send<Status>({ type: 'status', refresh: force });
  if (!st.configured) setConn('idle', '未配置');
  else if (st.connected) setConn('ok', `已连接 ${st.serverName ?? st.server} · ${st.tools.length} 个工具`);
  else setConn('bad', st.error ?? '连接失败');
  renderTools(st);
}

$('reveal').addEventListener('click', e => {
  const show = token.type === 'password';
  token.type = show ? 'text' : 'password';
  (e.currentTarget as HTMLButtonElement).textContent = show ? '隐藏' : '显示';
});

$('server').addEventListener('submit', async e => {
  e.preventDefault();
  // Accept a pasted "https://host/mcp#bearer=TOKEN" and split it into the two fields.
  const pasted = url.value.trim().match(/^(.*?)#bearer=(.+)$/);
  if (pasted) {
    url.value = pasted[1];
    token.value = decodeURIComponent(pasted[2]);
  }
  let origin: string;
  try {
    const u = new URL(url.value.trim());
    if (!/^https?:$/.test(u.protocol)) throw new Error();
    origin = `${u.protocol}//${u.hostname}/*`;
  } catch {
    setConn('bad', '地址不是有效的 http(s) URL');
    return;
  }
  // Must run inside the click: Chrome only shows the permission prompt for a user gesture.
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    setConn('bad', `没有拿到访问 ${new URL(url.value.trim()).host} 的权限`);
    return;
  }
  saveBtn.disabled = true;
  try {
    await saveSettings({ serverUrl: url.value.trim(), token: token.value.trim() });
    await refresh(true);
  } catch (err) {
    setConn('bad', err instanceof Error ? err.message : String(err));
  } finally {
    saveBtn.disabled = false;
  }
});

(async () => {
  const s = await loadSettings();
  url.value = s.serverUrl;
  token.value = s.token;
  if (s.serverUrl) await refresh(false);
  else setConn('idle', '未配置');
})();
