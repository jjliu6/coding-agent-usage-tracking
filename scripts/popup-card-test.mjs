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
  gear: el(),
  settings: el({ hidden: true }),
  'brand-name': el(),
  legend: el(),
  grid: el(),
  upd: el(),
  hint: el(),
  ver: el(),
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
      getManifest: () => ({ version: '1.2.1' }),
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
  clearTimeout: noop,
};

const ctx = vm.createContext(popupCtx);
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });
vm.runInContext(readFileSync(resolve(root, 'update.js'), 'utf8'), ctx, { filename: 'update.js' });
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

// --- Tracked-agents settings ---
const setProblems = [];
if (!els.settings.innerHTML.includes('Claude Code')) setProblems.push('settings should list Claude Code');
if (!els.settings.innerHTML.includes('data-agent="cursor"')) setProblems.push('settings should have a cursor checkbox');
if ((els.settings.innerHTML.match(/data-agent="[^"]+" checked/g) || []).length !== 6) {
  setProblems.push('all six agents should default to checked');
}
if (!els.settings.innerHTML.includes('data-agent="grok-bot"') || !els.settings.innerHTML.includes('data-agent="gemini"')) {
  setProblems.push('settings should list Grok Bot and Gemini');
}
if ((els.settings.innerHTML.match(/data-pref="[^"]+" checked/g) || []).length !== 3) {
  setProblems.push('autoRefresh, notifyLow and checkUpdates toggles should default to checked');
}
if (!els.settings.innerHTML.includes('data-pref="checkUpdates"')) setProblems.push('settings should have a checkUpdates toggle');
store.autoRefresh = false;
ctx.render();
if (els.settings.innerHTML.includes('data-pref="autoRefresh" checked')) {
  setProblems.push('autoRefresh=false should render unchecked');
}
if (!els.settings.innerHTML.includes('data-pref="notifyLow" checked')) {
  setProblems.push('notifyLow should stay checked when only autoRefresh is off');
}
delete store.autoRefresh;
ctx.render();
store.enabledAgents = { codex: false };
ctx.render();
if (els.grid.innerHTML.includes('Codex')) setProblems.push('disabled Codex should not render a card');
if (!els.grid.innerHTML.includes('Cursor')) setProblems.push('enabled Cursor should still render');
if (els.settings.innerHTML.includes('data-agent="codex" checked')) {
  setProblems.push('disabled Codex checkbox should be unchecked');
}
store.enabledAgents = {};
ctx.render();
if (setProblems.length) {
  console.error(els.settings.innerHTML);
  console.error(setProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Tracked-agents settings: default all on, unchecked agent disappears');

// --- Version line at the bottom ---
const verProblems = [];
delete store.updateCheck;
delete store.checkUpdates;
ctx.render();
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push(`version line should show the manifest version, got ${els.ver.innerHTML}`);
if (!els.ver.innerHTML.includes('github.com/jjliu6/coding-agent-usage-tracking/releases')) verProblems.push('version should link to the releases page');
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('no check yet → must not claim a new version');
if (els.ver.innerHTML.includes('up to date')) verProblems.push('no check yet → must not claim up to date');
store.updateCheck = { checkedAt: Date.now(), latest: '1.2.1', url: 'https://github.com/jjliu6/coding-agent-usage-tracking/releases/tag/v1.2.1' };
ctx.render();
if (!els.ver.innerHTML.includes('up to date')) verProblems.push(`same version → "up to date", got ${els.ver.innerHTML}`);
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('same version → no new-version link');
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: 'https://github.com/jjliu6/coding-agent-usage-tracking/releases/tag/v1.3.0' };
ctx.render();
if (!els.ver.innerHTML.includes('class="new"') || !els.ver.innerHTML.includes('New version v1.3.0 available')) {
  verProblems.push(`newer release → orange download link, got ${els.ver.innerHTML}`);
}
if (!els.ver.innerHTML.includes('href="https://github.com/jjliu6/coding-agent-usage-tracking/releases/tag/v1.3.0"')) {
  verProblems.push('new-version link should point at that release');
}
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push('installed version stays visible next to the update notice');
// 用户已经更新到 1.3.0 但存的还是上次的检查结果 → 不该再提示
store.updateCheck = { checkedAt: Date.now(), latest: '1.2.0', url: 'https://github.com/x' };
ctx.render();
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('latest older than installed → no update notice');
// 关掉"检查更新"后，即使还有旧结果也不显示提示
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: 'https://github.com/x' };
store.checkUpdates = false;
ctx.render();
if (els.ver.innerHTML.includes('class="new"')) verProblems.push('checkUpdates=false → no update notice');
if (!els.ver.innerHTML.includes('>v1.2.1<')) verProblems.push('checkUpdates=false → version itself still shown');
if (els.settings.innerHTML.includes('data-pref="checkUpdates" checked')) verProblems.push('checkUpdates=false should render unchecked');
// 存的 url 不是 GitHub 也只会转义、不执行
store.checkUpdates = true;
store.updateCheck = { checkedAt: Date.now(), latest: '1.3.0', url: '"><img src=x onerror=alert(1)>' };
ctx.render();
if (els.ver.innerHTML.includes('<img')) verProblems.push('update url must be escaped');
delete store.updateCheck;
delete store.checkUpdates;
ctx.render();
if (verProblems.length) {
  console.error(els.ver.innerHTML);
  console.error(verProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Version line shows the installed version and flags a newer release');

// --- Failure state on cards ---
const failProblems = [];
const failHtml = ctx.card('grok-build', grok, [], true);
if (!failHtml.includes("Last refresh couldn't read this page")) failProblems.push('failed card should warn about the failed refresh');
if (!failHtml.includes('data-open="grok-build"')) failProblems.push('failed card should link to the usage page');
if (ctx.card('grok-build', grok, [], false).includes('class="fail"')) failProblems.push('ok card must not show the failure line');
store.refresh = { running: false, started: Date.now(), finished: Date.now(), results: { cursor: 'fail' } };
ctx.render();
if (!els.grid.innerHTML.includes('class="fail"')) failProblems.push('render should show the failure line for a failed agent');
store.refresh = {};
ctx.render();
if (failProblems.length) {
  console.error(failHtml);
  console.error(failProblems.join('\n'));
  process.exit(1);
}
const missingHtml = ctx.card('grok-bot', undefined, [], 'missing');
if (!missingHtml.includes('no Grok Bot section')) failProblems.push('missing Grok Bot section should get its own hint');
if (missingHtml.includes("couldn't read this page")) failProblems.push('missing section must not be reported as a sign-in problem');
store.refresh = { running: false, started: Date.now(), finished: Date.now(), results: { 'grok-bot': 'missing' } };
ctx.render();
if (!els.grid.innerHTML.includes('no Grok Bot section')) failProblems.push('render should surface the missing-section hint');
store.refresh = {};
ctx.render();
if (failProblems.length) {
  console.error(failProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Failed refresh is visible on the card with an "open page" link');
console.log('ok  Grok Bot section missing from the Cursor page shows a dedicated hint');

// --- Grok Bot and Gemini cards ---
const newCards = [];
const bot = {
  id: 'grok-bot', name: 'Grok Bot', scraped_at: Date.now(),
  limits: [{ label: 'Weekly', percent_left: 87, resets_text: '9月3日 (23 hours and 4 minutes left)' }],
};
const botHtml = ctx.card('grok-bot', bot, [], false);
if (!botHtml.includes('>87%</b>')) newCards.push('Grok Bot card should show 87% remaining');
if (!botHtml.includes('reset in 23h')) newCards.push(`Grok Bot card should say "reset in 23h", got: ${botHtml}`);
if (!botHtml.includes('>Weekly<')) newCards.push('Grok Bot card should label the ring Weekly');
const gem = {
  id: 'gemini', name: 'Gemini', scraped_at: Date.now(), plan: 'PRO',
  limits: [
    { label: 'Weekly', percent_left: 83, resets_text: 'Sep 6 at 8:29 AM' },
    { label: 'Current usage', percent_left: 58, resets_text: '2:29 PM' },
  ],
};
const gemHtml = ctx.card('gemini', gem, [], false);
if (!gemHtml.includes('>83%</b>')) newCards.push('Gemini card should show 83% remaining');
if (!gemHtml.includes('Current usage') || !gemHtml.includes('58% left')) newCards.push('Gemini card should show the Current usage bar with 58% left');
if (!gemHtml.includes('>PRO<')) newCards.push('Gemini card should show the PRO plan');
if (!/reset in \d+[dh]/.test(gemHtml)) newCards.push(`Gemini weekly reset "Sep 6 at 8:29 AM" should parse to a countdown, got: ${gemHtml}`);
// parseReset: the two new formats
const now0 = new Date('2026-09-02T12:00:00');
const r1 = ctx.parseReset('9月3日 (23 hours and 4 minutes left)', now0);
if (!r1 || Math.round((r1 - now0) / 60000) !== 23 * 60 + 4) newCards.push(`"23 hours and 4 minutes left" should be +23h04m, got ${r1}`);
const r2 = ctx.parseReset('2 days left', now0);
if (!r2 || Math.round((r2 - now0) / 3600000) !== 48) newCards.push(`"2 days left" should be +48h, got ${r2}`);
const r3 = ctx.parseReset('Sep 6 at 8:29 AM', now0);
if (!r3 || r3.getMonth() !== 8 || r3.getDate() !== 6 || r3.getHours() !== 8 || r3.getMinutes() !== 29 || r3.getFullYear() !== 2026) {
  newCards.push(`"Sep 6 at 8:29 AM" should be Sep 6 2026 08:29, got ${r3}`);
}
const r4 = ctx.parseReset('Jan 3 at 8:29 AM', new Date('2026-12-30T12:00:00'));
if (!r4 || r4.getFullYear() !== 2027) newCards.push(`"Jan 3" seen in late December should roll into next year, got ${r4}`);
const r5 = ctx.parseReset('9月26日 (24 days)', now0);
if (!r5 || Math.round((r5 - now0) / 86400000) !== 24) newCards.push(`Cursor "(24 days)" format must still work, got ${r5}`);
if (newCards.length) {
  console.error(newCards.join('\n'));
  process.exit(1);
}
console.log('ok  Grok Bot and Gemini cards render with parsed reset countdowns');

// --- 7-day sparkline ---
const sparkProblems = [];
const nowTs = Date.now();
const sparkHist = [
  { id: 'grok-build', t: nowTs - 3 * 86400000, pct: 90 },
  { id: 'grok-build', t: nowTs - 2 * 86400000, pct: 70 },
  { id: 'grok-build', t: nowTs - 1 * 86400000, pct: 55 },
];
if (!ctx.sparkline(sparkHist, '#B78CF0').includes('<polyline')) sparkProblems.push('sparkline should draw a polyline from history');
if (ctx.sparkline([sparkHist[0]], '#B78CF0') !== '') sparkProblems.push('sparkline needs at least 2 points');
if (ctx.sparkline([{ id: 'grok-build', t: nowTs - 9 * 86400000, pct: 90 }, sparkHist[0]], '#B78CF0') !== '') {
  sparkProblems.push('points older than 7 days should be ignored');
}
if (!ctx.card('grok-build', grok, sparkHist, false).includes('class="spark"')) {
  sparkProblems.push('card with history should include the sparkline');
}
if (ctx.card('grok-build', grok, [], false).includes('class="spark"')) {
  sparkProblems.push('card without history should not include a sparkline');
}
if (sparkProblems.length) {
  console.error(sparkProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Card shows a 7-day sparkline once there is enough history');

// --- Scraped text is escaped before hitting innerHTML ---
const escProblems = [];
const evil = {
  id: 'cursor',
  name: 'Cursor<img src=x onerror=alert(1)>',
  scraped_at: Date.now(),
  plan: '<b>Pro</b> $20/mo',
  credits: '<script>steal()</script>',
  limits: [{ label: '"><svg onload=alert(2)>', percent_left: 50, resets_text: '<img src=x onerror=alert(3)>' }],
};
const evilHtml = ctx.card('cursor', evil, [], false);
if (evilHtml.includes('<img') || evilHtml.includes('<script>') || evilHtml.includes('<svg onload') || evilHtml.includes('<b>Pro</b>')) {
  escProblems.push('scraped markup must not survive into card HTML');
}
if (!evilHtml.includes('&lt;img')) escProblems.push('scraped markup should be HTML-escaped, not dropped');
const evilBd = ctx.breakdownBar([{ name: '"><i onmouseover=x>', percent: 40 }]);
if (evilBd.includes('"><i onmouseover')) escProblems.push('breakdown names must be escaped in title/legend');
if (escProblems.length) {
  console.error(evilHtml);
  console.error(evilBd);
  console.error(escProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Scraped page text is escaped before rendering');

// --- Stale refresh.running must not lock the Refresh button forever ---
const staleProblems = [];
store.refresh = { running: true, started: Date.now() - 10 * 60000 };
ctx.render();
if (els.refresh.disabled) staleProblems.push('stale running (10 min old) must not disable the button');
if (els.refresh.textContent !== 'Refresh') staleProblems.push(`stale running should show Refresh, got ${JSON.stringify(els.refresh.textContent)}`);
store.refresh = { running: true, started: Date.now() };
ctx.render();
if (!els.refresh.disabled) staleProblems.push('a fresh running refresh should disable the button');
store.refresh = {};
els.refresh.disabled = false;
ctx.render();
if (staleProblems.length) {
  console.error(staleProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Stuck refresh.running older than 2.5 min unlocks the Refresh button');

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
  ver: el(),
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
      getManifest: () => ({ version: '1.2.1' }),
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
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), reloadCtx, { filename: 'agents.js' });
vm.runInContext(readFileSync(resolve(root, 'update.js'), 'utf8'), reloadCtx, { filename: 'update.js' });
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
