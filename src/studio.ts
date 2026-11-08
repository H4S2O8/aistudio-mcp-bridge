// Everything that knows AI Studio's DOM lives here (checked against the page on 2026-11-08).
// When a selector stops matching, the functions throw with the selector name instead of guessing.

import type { Declaration } from './shared';

export const SEL = {
  callChunk: 'ms-function-call-chunk',
  callName: '.title-text',
  callArgs: 'pre code',
  responseInput: 'ms-input-field.function-response-input input',
  responseSend: 'form.input-form button[type="submit"]',
  promptChunk: 'ms-prompt-chunk',
  runButton: 'ms-prompt-box ms-run-button button',
  buttonsLeft: 'ms-prompt-box .buttons-row .button-row-left',
  fcToggle: 'mat-slide-toggle.function-calling-toggle button[role="switch"]',
  fcEdit: 'button.edit-function-declarations-button',
  settingsToggle: 'button[aria-label="Toggle run settings panel"]',
  dialog: 'mat-dialog-container',
} as const;

export interface PendingCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  chunk: Element;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor<T>(what: string, fn: () => T | null | undefined | false, timeout = 5000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`等不到 ${what}（AI Studio 页面可能改版了）`);
    await sleep(80);
  }
}

function chunkId(chunk: Element): string | null {
  return chunk.closest(SEL.promptChunk)?.id || null;
}

/** All call cards on the page, answered or not. */
export function allCalls(): { id: string; name: string; pending: boolean; chunk: Element }[] {
  const out = [];
  for (const chunk of document.querySelectorAll(SEL.callChunk)) {
    const id = chunkId(chunk);
    if (!id) continue;
    out.push({
      id,
      name: chunk.querySelector(SEL.callName)?.textContent?.trim() ?? '',
      pending: !!chunk.querySelector(SEL.responseSend),
      chunk,
    });
  }
  return out;
}

export function readCall(id: string): PendingCall {
  const chunk = document.getElementById(id)?.querySelector(SEL.callChunk);
  if (!chunk) throw new Error(`找不到调用卡片 ${id}`);
  const name = chunk.querySelector(SEL.callName)?.textContent?.trim();
  if (!name) throw new Error(`调用卡片 ${id} 里没有函数名（${SEL.callName}）`);
  const raw = chunk.querySelector(SEL.callArgs)?.textContent ?? '';
  let args: Record<string, unknown>;
  try {
    args = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${name} 的参数不是合法 JSON：${raw.slice(0, 120)}`);
  }
  return { id, name, args, chunk };
}

export function isGenerating(): boolean {
  return /\bStop\b/.test(document.querySelector(SEL.runButton)?.textContent ?? '');
}

/** Fill one card's response field and send it. Re-reads the DOM because a send re-renders the others. */
export async function answer(id: string, response: string): Promise<void> {
  const chunk = () => document.getElementById(id)?.querySelector(SEL.callChunk) ?? null;
  const input = await waitFor('函数回复输入框', () => chunk()?.querySelector<HTMLInputElement>(SEL.responseInput));
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, response);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = await waitFor('可点击的 Send 按钮', () => {
    const b = chunk()?.querySelector<HTMLButtonElement>(SEL.responseSend);
    return b && b.getAttribute('aria-disabled') === 'false' ? b : null;
  }, 3000);
  btn.click();
  await waitFor('回复被接受', () => !chunk()?.querySelector(SEL.responseSend), 5000);
}

export function functionCallingOn(): boolean | null {
  const t = document.querySelector(SEL.fcToggle);
  return t ? t.getAttribute('aria-checked') === 'true' : null;
}

/** Turn on function calling and replace the declarations with ours. */
export async function writeDeclarations(decls: Declaration[]): Promise<void> {
  if (!document.querySelector(SEL.fcToggle)) {
    const open = document.querySelector<HTMLButtonElement>(SEL.settingsToggle);
    if (!open) throw new Error('找不到 Run settings 面板，也找不到打开它的按钮');
    open.click();
  }
  const toggle = await waitFor('Function calling 开关', () => document.querySelector<HTMLButtonElement>(SEL.fcToggle));
  if (toggle.getAttribute('aria-checked') !== 'true') {
    if (toggle.disabled) throw new Error('Function calling 开关是灰的：先在 Run settings 里关掉 Google 搜索、URL context 这类内置工具');
    toggle.click();
    await waitFor('Function calling 打开', () => document.querySelector(SEL.fcToggle)?.getAttribute('aria-checked') === 'true');
  }
  const edit = await waitFor('函数声明的 Edit 按钮', () => document.querySelector<HTMLButtonElement>(SEL.fcEdit));
  edit.click();
  const dialog = await waitFor('函数声明对话框', () => document.querySelector(SEL.dialog));
  const codeTab = [...dialog.querySelectorAll('button')].find(b => b.textContent?.includes('Code Editor'));
  codeTab?.click();
  const ta = await waitFor('声明编辑框', () => dialog.querySelector('textarea'));
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, JSON.stringify(decls, null, 2));
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(150);
  const save = [...dialog.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save');
  if (!save) throw new Error('声明对话框里没有 Save 按钮');
  save.click();
  const outcome = await waitFor('保存结果', () => {
    const d = document.querySelector(SEL.dialog);
    if (!d) return 'saved';
    return d.textContent?.match(/Error[^\n]*?(?=Reset|Save|$)/)?.[0]?.trim() || null;
  });
  if (outcome !== 'saved') {
    document.querySelector<HTMLButtonElement>(`${SEL.dialog} button.close-button`)?.click();
    throw new Error(`AI Studio 拒绝了声明：${outcome}`);
  }
}

/** Where AI Studio is dark, so our UI can follow it. */
export function pageIsDark(): boolean {
  const el = document.querySelector('ms-app') ?? document.body;
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (m && m.length >= 3) {
    const [r, g, b] = m.map(Number);
    if (!(m.length === 4 && Number(m[3]) === 0)) return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  const m2 = getComputedStyle(el).backgroundColor.match(/\d+(\.\d+)?/g);
  if (m2 && m2.length >= 3) {
    const [r, g, b] = m2.map(Number);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
