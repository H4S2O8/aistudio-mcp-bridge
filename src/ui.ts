// Shadow-DOM widgets: the MCP chip in the prompt box, its popover, and the bar inside each call card.

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.root {
  --bg: #ffffff; --raised: #f3f4f6; --text: #1b1c1f; --muted: #5f6368; --line: #e1e3e6;
  --accent: #0b57d0; --accent-ink: #fff; --accent-soft: #e8f0fe;
  --ok: #188038; --ok-soft: #e6f4ea; --warn: #9a5b00; --warn-soft: #fef7e0; --bad: #c5221f; --bad-soft: #fce8e6;
  --shadow: 0 8px 28px rgb(0 0 0 / .14), 0 1px 3px rgb(0 0 0 / .08);
  font: 13px/1.5 "Google Sans Text", "Google Sans", -apple-system, "PingFang SC", system-ui, sans-serif;
  color: var(--text); -webkit-font-smoothing: antialiased;
}
.root.dark {
  --bg: #1e1f22; --raised: #2a2b2f; --text: #e3e3e3; --muted: #a0a4a9; --line: #35373b;
  --accent: #a8c7fa; --accent-ink: #062e6f; --accent-soft: #283548;
  --ok: #81c995; --ok-soft: #1f3326; --warn: #fdd663; --warn-soft: #3a3220; --bad: #f2b8b5; --bad-soft: #3c2523;
  --shadow: 0 10px 32px rgb(0 0 0 / .5), 0 1px 3px rgb(0 0 0 / .4);
}
button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; }
.mono { font-family: "SF Mono", ui-monospace, Menlo, monospace; font-size: 12px; }

/* chip */
/* The chip copies AI Studio's own Tools button (see mirrorChip) through these variables. */
.chip {
  display: inline-flex; align-items: center; gap: var(--chip-gap, 4px);
  height: var(--chip-h, 32px); padding: var(--chip-pad, 0 12px);
  border-radius: var(--chip-radius, 12px); border: var(--chip-border, 1px solid var(--line));
  background: var(--chip-bg, transparent); color: var(--chip-color, var(--text));
  font: var(--chip-font, 500 14px/20px Inter, sans-serif); transition: background .15s;
}
.chip:hover, .chip[aria-expanded="true"] { background: color-mix(in srgb, var(--chip-color, var(--text)) 7%, var(--chip-bg, transparent)); }
.chip svg { width: var(--chip-icon, 18px); height: var(--chip-icon, 18px); }
.chip .dot { margin-left: 2px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); flex: none; }
.dot.ok { background: var(--ok); } .dot.bad { background: var(--bad); } .dot.warn { background: var(--warn); }
.badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 11px; display: inline-grid; place-items: center; }

/* popover */
.pop {
  position: fixed; width: 320px; background: var(--bg); border: 1px solid var(--line);
  border-radius: 16px; box-shadow: var(--shadow); padding: 16px; z-index: 2147483000;
  animation: rise .14s ease-out;
}
@keyframes rise { from { opacity: 0; transform: translateY(4px); } }
.pop h3 { margin: 0; font: 500 14px "Google Sans", system-ui, sans-serif; }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.head .grow { flex: 1; min-width: 0; }
.head .host { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-btn { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: var(--muted); }
.icon-btn:hover { background: var(--raised); color: var(--text); }
.icon-btn svg { width: 16px; height: 16px; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; }
.stat { background: var(--raised); border-radius: 10px; padding: 8px 10px; }
.stat b { display: block; font: 500 16px "Google Sans", system-ui, sans-serif; }
.stat span { color: var(--muted); font-size: 11.5px; }
.line { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12.5px; margin-bottom: 12px; }
.note { border-radius: 10px; padding: 8px 10px; font-size: 12.5px; margin-bottom: 12px; word-break: break-word; }
.note.bad { background: var(--bad-soft); color: var(--bad); }
.note.ok { background: var(--ok-soft); color: var(--ok); }
.note.warn { background: var(--warn-soft); color: var(--warn); }
.actions { display: flex; gap: 8px; }
.btn { height: 34px; padding: 0 16px; border-radius: 999px; font: 500 13px "Google Sans", system-ui, sans-serif; display: inline-flex; align-items: center; gap: 6px; }
.btn.primary { background: var(--accent); color: var(--accent-ink); justify-content: center; }
.actions .btn.primary { flex: 1; }
.btn.primary:disabled { opacity: .5; cursor: default; }
.btn.tonal { background: var(--raised); }
.btn.tonal:hover { filter: brightness(.97); }
.btn.danger { color: var(--bad); }
.btn.sm { height: 28px; padding: 0 12px; font-size: 12.5px; }

/* call bar */
.bar { margin-top: 10px; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; background: var(--bg); }
.bar.confirm { border-color: var(--warn); background: var(--warn-soft); }
.bar.failed, .bar.blocked { border-color: color-mix(in srgb, var(--bad) 45%, transparent); background: var(--bad-soft); }
.bar-row { display: flex; align-items: center; gap: 10px; }
.bar-row .msg { flex: 1; min-width: 0; }
.bar-row .msg small { color: var(--muted); margin-left: 6px; }
.state-icon { width: 18px; height: 18px; flex: none; display: grid; place-items: center; }
.state-icon svg { width: 18px; height: 18px; }
.ok-ink { color: var(--ok); } .bad-ink { color: var(--bad); } .warn-ink { color: var(--warn); } .muted { color: var(--muted); }
.spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--accent); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
details { margin-top: 8px; }
summary { cursor: pointer; color: var(--muted); font-size: 12px; list-style: none; }
summary::before { content: "▸ "; } details[open] summary::before { content: "▾ "; }
pre.out { margin: 6px 0 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: var(--raised); border-radius: 8px; padding: 8px 10px; }
.imgs { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin-top: 8px; }
.imgs img { width: 100%; border-radius: 8px; display: block; cursor: zoom-in; background: var(--raised); }
`;

export const ICON = {
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v9M12 16h.01"/><circle cx="12" cy="12" r="10"/></svg>',
};

type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** A host element with an open shadow root that carries our stylesheet. */
export function shadowHost(tag: string): { host: HTMLElement; root: HTMLElement } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const root = h('div', { class: 'root' });
  shadow.append(style, root);
  return { host, root };
}

export function openImage(dataUrl: string) {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type: mime })), '_blank', 'noopener');
}
