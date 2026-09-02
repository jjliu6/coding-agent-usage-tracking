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
    hidden: false,
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 200, top: 56, width: 176, height: 200, right: 376, bottom: 256 }),
    offsetWidth: 176,
    offsetHeight: 200,
    setPointerCapture: noop,
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
  hair: el({ hidden: true }),
  buddy: el({ hidden: true }),
  acts: el({ hidden: true }),
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
  clearTimeout: noop,
  setInterval: noop,
  clearInterval: noop,
  window: { innerWidth: 380, innerHeight: 720 },
};

const ctx = vm.createContext(popupCtx);
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), ctx, { filename: 'agents.js' });
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
if ((els.settings.innerHTML.match(/data-agent="[^"]+" checked/g) || []).length !== 4) {
  setProblems.push('all four agents should default to checked');
}
if ((els.settings.innerHTML.match(/data-pref="[^"]+" checked/g) || []).length !== 3) {
  setProblems.push('autoRefresh, notifyLow and showHair toggles should default to checked');
}
if (!els.settings.innerHTML.includes('data-pref="moveReminder">')) {
  setProblems.push('moveReminder toggle should exist and default to unchecked (opt-in)');
}
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
console.log('ok  Failed refresh is visible on the card with an "open page" link');

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

// --- Hair mascot: strands follow the average remaining % ---
const hairProblems = [];
const strandsOn = (html) => (html.match(/class="h"/g) || []).length;
const strandsOff = (html) => (html.match(/class="h off"/g) || []).length;
if (strandsOn(ctx.hairHead(100)) !== 24 || strandsOff(ctx.hairHead(100)) !== 0) hairProblems.push('100% should show all 24 strands');
if (strandsOn(ctx.hairHead(0)) !== 0 || strandsOff(ctx.hairHead(0)) !== 24) hairProblems.push('0% should hide all 24 strands');
if (strandsOn(ctx.hairHead(50)) !== 12) hairProblems.push('50% should show 12 strands');
if (!ctx.hairHead(80).includes('data-mood="smile"') || !ctx.hairHead(10).includes('data-mood="frown"') || !ctx.hairHead(30).includes('data-mood="flat"')) {
  hairProblems.push('mouth should smile above 50%, stay flat in the middle, and frown below 20%');
}
if (ctx.hairHead(100).includes('<line class="h"')) {
  hairProblems.push('hair should be filled tufts, not radiating lines');
}
ctx.render(); // grok at 67% is the only agent with data → average 67
if (els.hair.hidden) hairProblems.push('mascot should be visible by default once there is data');
if (!els.hair.innerHTML.includes('<svg')) hairProblems.push('mascot should render an SVG head');
if (!els.hair.title.includes('67%')) hairProblems.push(`mascot tooltip should carry the average 67%, got ${JSON.stringify(els.hair.title)}`);
if (strandsOn(els.hair.innerHTML) !== 16) hairProblems.push(`67% should show 16 strands, got ${strandsOn(els.hair.innerHTML)}`);
store.showHair = false;
ctx.render();
if (!els.hair.hidden) hairProblems.push('showHair=false should hide the mascot');
delete store.showHair;
ctx.render();
if (hairProblems.length) {
  console.error(hairProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Hair mascot thins with the average remaining % and can be switched off');

// --- Floating buddy + stage activities ---
const buddyProblems = [];
if (ctx.activityStage(80) !== 'high' || ctx.activityStage(20) !== 'mid' || ctx.activityStage(10) !== 'low') {
  buddyProblems.push('activityStage should be high >50, mid >=20, low <20');
}
if (JSON.stringify(ctx.activityIds('high')) !== JSON.stringify(['actStretch', 'actWater', 'actWindow'])) {
  buddyProblems.push('high stage should offer stretch / water / window');
}
if (JSON.stringify(ctx.activityIds('mid')) !== JSON.stringify(['actStand', 'actSquats', 'actEyes'])) {
  buddyProblems.push('mid stage should offer stand / squats / eyes');
}
if (JSON.stringify(ctx.activityIds('low')) !== JSON.stringify(['actWalk', 'actGrass', 'actTea'])) {
  buddyProblems.push('low stage should offer walk / grass / tea');
}
store.showHair = true;
delete store.activityPick;
delete store.activityDoneAt;
ctx.render();
if (els.buddy.hidden) buddyProblems.push('floating buddy should show when the mascot is on and there is data');
if (els.acts.hidden) buddyProblems.push('activity list should show until the user completes one');
if ((els.acts.innerHTML.match(/<button /g) || []).length !== 3) {
  buddyProblems.push(`high stage should list 3 activities, got ${els.acts.innerHTML}`);
}
if (!els.acts.innerHTML.includes('Drink a glass of water')) {
  buddyProblems.push('high-stage copy should include the water activity');
}
if (els.grid.style.display === 'none') {
  buddyProblems.push('cards should stay visible until the user picks an activity');
}
store.activityPick = 'actWater';
ctx.render();
if (els.grid.style.display !== 'none') {
  buddyProblems.push('picking an activity should hide the dashboard cards');
}
if (!els.acts.innerHTML.includes('Doing: Drink a glass of water')) {
  buddyProblems.push(`doing state should name the pick, got ${els.acts.innerHTML}`);
}
if (!els.acts.innerHTML.includes('data-act="done"')) {
  buddyProblems.push('doing state should offer a Done button');
}
store.activityPick = null;
store.activityDoneAt = Date.now();
ctx.render();
if (els.grid.style.display === 'none') {
  buddyProblems.push('completing an activity should show the cards again');
}
if (!els.acts.hidden) {
  buddyProblems.push('completing an activity should dismiss the reminder');
}
store.activityDoneAt = Date.now() - (ctx.ACT_SNOOZE_MS + 1000);
ctx.render();
if (els.acts.hidden) {
  buddyProblems.push('after the snooze window the 2–3 activities should come back');
}
store.showHair = false;
store.activityPick = 'actWater';
store.activityDoneAt = 0;
ctx.render();
if (!els.buddy.hidden) buddyProblems.push('showHair=false should hide the floating buddy');
if (els.grid.style.display === 'none') {
  buddyProblems.push('hiding the mascot should not hide the cards');
}
delete store.showHair;
delete store.activityPick;
delete store.activityDoneAt;
ctx.render();
if (buddyProblems.length) {
  console.error(buddyProblems.join('\n'));
  process.exit(1);
}
console.log('ok  Floating buddy lists 3 stage activities; pick hides cards, Done restores them');

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
  setInterval: noop,
  clearInterval: noop,
  window: { innerWidth: 380, innerHeight: 720 },
};
const reloadCtx = vm.createContext(reloadCtxObj);
vm.runInContext(readFileSync(resolve(root, 'agents.js'), 'utf8'), reloadCtx, { filename: 'agents.js' });
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
