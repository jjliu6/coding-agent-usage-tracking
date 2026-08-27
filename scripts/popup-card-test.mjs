// Render the Grok card with the SuperGrok fixture and check the remaining %.
// Also checks default-English i18n and the 中文 / EN toggle.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parseCtx = {};
vm.runInNewContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), parseCtx, { filename: 'parse.js' });

const USER_SUPERGROK = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
33% used
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
const noisy = `Your disk is 9% used\n${USER_SUPERGROK}`;
const parsed = parseCtx.parseGrokUsage(noisy);
if (!parsed || parsed.used !== 33) {
  console.error('expected parseGrokUsage to return 33% used, got', parsed);
  process.exit(1);
}

const grok = {
  id: 'grok-build',
  name: 'Grok Build',
  color: '#B78CF0',
  scraped_at: Date.now(),
  limits: [{ label: 'Weekly (SuperGrok)', percent_left: 100 - parsed.used, resets_text: parsed.reset }],
  breakdown: parsed.breakdown,
};

let sent = [];
let sideOpened = 0;
let windowsCreated = 0;
let uiLanguageCalls = 0;
const store = { agents: { 'grok-build': grok }, history: [] };
const noop = () => {};

function el(extra) {
  return {
    addEventListener: noop,
    textContent: '',
    innerHTML: '',
    disabled: false,
    title: '',
    classList: { add: noop },
    ...extra,
  };
}

const els = {
  refresh: el(),
  lang: el(),
  'brand-name': el(),
  legend: el(),
  grid: el(),
  upd: el(),
  hint: el(),
};

const popupCtx = {
  chrome: {
    i18n: {
      getUILanguage: () => {
        uiLanguageCalls++;
        return 'zh-CN';
      },
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(store);
          for (const k of list) {
            if (store[k] !== undefined) out[k] = store[k];
          }
          cb && cb(out);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          cb && cb();
        },
      },
      onChanged: { addListener: noop },
    },
    runtime: {
      sendMessage: (msg) => { sent.push(msg); },
      getContexts: () => Promise.resolve([]),
      getURL: (p) => p,
      lastError: null,
    },
    sidePanel: { open: ({ windowId }) => { sideOpened++; popupCtx._openedWindowId = windowId; return Promise.resolve(); } },
    windows: {
      getLastFocused: (_opts, cb) => cb({ id: 42, type: 'normal' }),
      create: () => { windowsCreated++; },
    },
  },
  document: {
    documentElement: { lang: 'en' },
    getElementById: (id) => els[id] || null,
    body: { classList: { add: noop }, style: {} },
  },
  location: { href: 'chrome-extension://id/popup.html' },
  setTimeout: noop,
};

const ctx = vm.createContext(popupCtx);
vm.runInContext(readFileSync(resolve(root, 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
vm.runInContext(readFileSync(resolve(root, 'popup.js'), 'utf8'), ctx, { filename: 'popup.js' });

const problems = [];

if (ctx.currentLang() !== 'en') problems.push(`default language should be en, got ${ctx.currentLang()}`);
if (uiLanguageCalls !== 0) problems.push('dashboard language must not follow chrome.i18n.getUILanguage');
if (els['brand-name'].textContent !== 'CODING AGENTS') {
  problems.push(`default brand should be English, got ${JSON.stringify(els['brand-name'].textContent)}`);
}
if (els.legend.textContent !== 'number = remaining') {
  problems.push(`default legend should be English, got ${JSON.stringify(els.legend.textContent)}`);
}
if (els.lang.textContent !== '中文') problems.push(`English UI should show a 中文 button, got ${JSON.stringify(els.lang.textContent)}`);
if (els.refresh.textContent !== 'Refresh') problems.push(`default refresh label should be Refresh, got ${JSON.stringify(els.refresh.textContent)}`);
if (popupCtx.document.documentElement.lang !== 'en') {
  problems.push(`<html lang> should be en by default, got ${popupCtx.document.documentElement.lang}`);
}

const htmlEn = ctx.card('grok-build', grok, []);
if (!htmlEn.includes('>67%</b>')) problems.push('card should show 67% remaining, not the old 91%');
if (htmlEn.includes('>91%</b>')) problems.push('card still shows the buggy 91% remaining');
if (!htmlEn.includes('Chat 16%')) problems.push('missing Chat 16% in the English breakdown legend');
if (!htmlEn.includes('Build 10%')) problems.push('missing Build 10% in the breakdown legend');
if (!htmlEn.includes('Auto 6%')) problems.push('missing Auto 6% in the breakdown legend');
if (!htmlEn.includes('Img 1%')) problems.push('missing Img 1% in the breakdown legend');
if (!htmlEn.includes('bar stacked')) problems.push('missing stacked usage bar');
if (!htmlEn.includes('>left<')) problems.push('English card should say "left"');
if (htmlEn.includes('剩余')) problems.push('English default must not show Chinese "剩余"');
if (htmlEn.includes('聊天')) problems.push('English default must not show Chinese "聊天"');

if (problems.length) {
  console.error(htmlEn);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Default UI is English (ignores Chrome UI language zh-CN)');
console.log('ok  Grok card shows 67% remaining with Chat/Build/Auto/Img slices');

let langDone = false;
ctx.setLang('zh', () => { langDone = true; });
if (!langDone) {
  console.error('setLang should invoke its callback');
  process.exit(1);
}
if (store.uiLang !== 'zh') {
  console.error('expected uiLang persisted as zh, got', store.uiLang);
  process.exit(1);
}
if (ctx.currentLang() !== 'zh') {
  console.error('expected currentLang zh after toggle, got', ctx.currentLang());
  process.exit(1);
}

const htmlZh = ctx.card('grok-build', grok, []);
const zhProblems = [];
if (!htmlZh.includes('聊天 16%')) zhProblems.push('Chinese card should show 聊天 16%');
if (!htmlZh.includes('构建 10%')) zhProblems.push('Chinese card should show 构建 10%');
if (!htmlZh.includes('自动 6%')) zhProblems.push('Chinese card should show 自动 6%');
if (!htmlZh.includes('绘图 1%')) zhProblems.push('Chinese card should show 绘图 1%');
if (!htmlZh.includes('>剩余<')) zhProblems.push('Chinese card should say 剩余');
if (htmlZh.includes('>left<')) zhProblems.push('Chinese card should not say left');
if (els.lang.textContent !== 'EN') zhProblems.push(`Chinese UI should show an EN button, got ${JSON.stringify(els.lang.textContent)}`);
if (els.refresh.textContent !== '刷新') zhProblems.push(`Chinese refresh label should be 刷新, got ${JSON.stringify(els.refresh.textContent)}`);
if (els['brand-name'].textContent !== 'CODING AGENTS 额度') {
  zhProblems.push(`Chinese brand, got ${JSON.stringify(els['brand-name'].textContent)}`);
}
if (popupCtx.document.documentElement.lang !== 'zh') {
  zhProblems.push(`<html lang> should be zh after toggle, got ${popupCtx.document.documentElement.lang}`);
}

if (zhProblems.length) {
  console.error(htmlZh);
  console.error(zhProblems.join('\n'));
  process.exit(1);
}
console.log('ok  中文 toggle switches dashboard strings and persists uiLang=zh');

ctx.setLang('en');
if (ctx.currentLang() !== 'en' || store.uiLang !== 'en') {
  console.error('switching back to English failed', ctx.currentLang(), store.uiLang);
  process.exit(1);
}
if (els.lang.textContent !== '中文') {
  console.error('English UI should show 中文 again, got', els.lang.textContent);
  process.exit(1);
}
console.log('ok  EN toggle restores English');

const savedStore = { agents: { 'grok-build': grok }, history: [], uiLang: 'zh' };
const els2 = {
  refresh: el(),
  lang: el(),
  'brand-name': el(),
  legend: el(),
  grid: el(),
  upd: el(),
  hint: el(),
};
const reloadCtxObj = {
  chrome: {
    i18n: { getUILanguage: () => 'en-US' },
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(savedStore);
          for (const k of list) {
            if (savedStore[k] !== undefined) out[k] = savedStore[k];
          }
          cb && cb(out);
        },
        set: (obj, cb) => { Object.assign(savedStore, obj); cb && cb(); },
      },
      onChanged: { addListener: noop },
    },
    runtime: {
      sendMessage: noop,
      getContexts: () => Promise.resolve([]),
      getURL: (p) => p,
      lastError: null,
    },
    sidePanel: { open: () => Promise.resolve() },
    windows: { getLastFocused: (_opts, cb) => cb({ id: 1 }), create: noop },
  },
  document: {
    documentElement: { lang: 'en' },
    getElementById: (id) => els2[id] || null,
    body: { classList: { add: noop }, style: {} },
  },
  location: { href: 'chrome-extension://id/popup.html' },
  setTimeout: noop,
};
const reloadCtx = vm.createContext(reloadCtxObj);
vm.runInContext(readFileSync(resolve(root, 'i18n.js'), 'utf8'), reloadCtx, { filename: 'i18n.js' });
vm.runInContext(readFileSync(resolve(root, 'popup.js'), 'utf8'), reloadCtx, { filename: 'popup.js' });
if (reloadCtx.currentLang() !== 'zh') {
  console.error('saved uiLang=zh should reload as Chinese, got', reloadCtx.currentLang());
  process.exit(1);
}
if (els2.lang.textContent !== 'EN' || !els2.grid.innerHTML.includes('剩余')) {
  console.error('reloaded Chinese dashboard mismatch', els2.lang.textContent, els2.grid.innerHTML);
  process.exit(1);
}
console.log('ok  Persisted uiLang=zh is restored on next open');

sent = [];
sideOpened = 0;
windowsCreated = 0;
els.refresh.disabled = false;
ctx.startRefresh();
ctx.startRefresh();
if (!sent.some((m) => m && m.type === 'refreshAll')) {
  console.error('expected refreshAll, got', sent);
  process.exit(1);
}
if (sent.filter((m) => m && m.type === 'refreshAll').length !== 1) {
  console.error('Refresh should fire once while the button is disabled, got', sent);
  process.exit(1);
}
if (sideOpened !== 0) {
  console.error('Refresh must not open another side panel, got', sideOpened);
  process.exit(1);
}
if (windowsCreated !== 0) {
  console.error('Refresh must not create extra popup windows (the flashing bug), got', windowsCreated);
  process.exit(1);
}
console.log('ok  Refresh scrapes only and does not stack windows');

console.log('\nPopup card test passed.');
