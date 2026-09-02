// Exercise background.js: serialized storage writes, badge, low-quota
// notifications, and the hourly quiet-check alarm. Storage callbacks are
// async (setTimeout) exactly so an unserialized implementation would
// interleave and lose an update.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (v) => JSON.parse(JSON.stringify(v));
const tick = (n = 3) => new Promise((r) => setTimeout(r, n));

const store = {};
let onMessage = null;
const removedTabs = [];
const createdTabs = [];
const badge = { texts: [], colors: [] };
const alarms = { created: [], cleared: 0, listener: null };
const notifications = [];
const storageListeners = [];
const onRemovedListeners = [];
let nextTabId = 100;

const ctxObj = {
  setTimeout,
  clearTimeout,
  chrome: {
    storage: {
      local: {
        get: (keys, cb) => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (store[k] !== undefined) out[k] = clone(store[k]);
          });
          setTimeout(() => cb(out), 0);
        },
        set: (obj, cb) => {
          setTimeout(() => {
            const changes = {};
            Object.keys(obj).forEach((k) => { changes[k] = { newValue: clone(obj[k]) }; });
            Object.assign(store, clone(obj));
            if (cb) cb();
            storageListeners.forEach((fn) => fn(changes, 'local'));
          }, 0);
        },
      },
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
    },
    runtime: {
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      lastError: null,
    },
    tabs: {
      create: (opts, cb) => {
        createdTabs.push(clone(opts));
        const id = nextTabId++;
        setTimeout(() => {
          if (cb) cb({ id });
          // 标签页"抓完自动关"：马上触发 onRemoved，让 openAndWait 尽快 resolve
          setTimeout(() => onRemovedListeners.slice().forEach((fn) => fn(id)), 0);
        }, 0);
      },
      remove: (id, cb) => { removedTabs.push(id); if (cb) cb(); },
      onRemoved: {
        addListener: (fn) => onRemovedListeners.push(fn),
        removeListener: (fn) => {
          const i = onRemovedListeners.indexOf(fn);
          if (i >= 0) onRemovedListeners.splice(i, 1);
        },
      },
    },
    action: {
      setBadgeText: ({ text }) => badge.texts.push(text),
      setBadgeBackgroundColor: ({ color }) => badge.colors.push(color),
    },
    alarms: {
      create: (name, info) => alarms.created.push({ name, ...info }),
      clear: (_name, cb) => { alarms.cleared++; if (cb) cb(); },
      onAlarm: { addListener: (fn) => { alarms.listener = fn; } },
    },
    notifications: {
      create: (id, opts, cb) => { notifications.push({ id, ...opts }); if (cb) cb(); },
    },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
  },
};
const ctx = vm.createContext(ctxObj);
ctxObj.importScripts = (...files) => files.forEach((f) =>
  vm.runInContext(readFileSync(resolve(root, f), 'utf8'), ctx, { filename: f }));
vm.runInContext(readFileSync(resolve(root, 'background.js'), 'utf8'), ctx, { filename: 'background.js' });

if (typeof onMessage !== 'function') {
  console.error('background.js should register an onMessage listener');
  process.exit(1);
}

function send(msg) {
  return new Promise((res) => {
    const ret = onMessage(msg, { tab: { id: 7 } }, res);
    if (ret !== true) res(); // 非异步分支：立即完成
  });
}

const agentData = (agent) => ({ type: 'agentData', agent });
const problems = [];
await tick();

// 1) 两个 agent 同时抓完：都必须写进去，谁也不能覆盖谁
const now = Date.now();
await Promise.all([
  send(agentData({ id: 'claude-code', scraped_at: now, limits: [{ label: 'Weekly (All models)', percent_left: 80 }] })),
  send(agentData({ id: 'codex', scraped_at: now, limits: [{ label: 'Weekly', percent_left: 60 }] })),
]);
if (!store.agents || !store.agents['claude-code'] || !store.agents.codex) {
  problems.push(`concurrent saves lost an agent: ${JSON.stringify(Object.keys(store.agents || {}))}`);
}
if (!store.history || store.history.length !== 2) {
  problems.push(`expected 2 history entries, got ${JSON.stringify(store.history)}`);
}

// 2) Cursor 分两页：后到的一页要合并、不能丢掉先到那页的字段
await send(agentData({ id: 'cursor', scraped_at: now + 1, limits: [{ label: 'Cursor Models', percent_left: 40 }] }));
await send(agentData({ id: 'cursor', scraped_at: now + 2, tokens: { total: 5e6 } }));
const cursor = store.agents && store.agents.cursor;
if (!cursor || !cursor.limits || !cursor.tokens) {
  problems.push(`cursor pages should merge (limits + tokens), got ${JSON.stringify(cursor)}`);
}

// 3) 5 分钟内同值不重复记历史
await send(agentData({ id: 'codex', scraped_at: now + 60000, limits: [{ label: 'Weekly', percent_left: 60 }] }));
if (store.history.filter((h) => h.id === 'codex').length !== 1) {
  problems.push('unchanged pct within 5 min should not add a history entry');
}

// 4) closeMe 仍然关掉发消息的标签页
await send({ type: 'closeMe' });
if (!removedTabs.includes(7)) problems.push('closeMe should remove the sender tab');

// 5) 徽章 = 勾选产品里最低的剩余%（claude 80 / codex 60 / cursor 40 → 40，黄色）
await tick(10);
if (badge.texts[badge.texts.length - 1] !== '40') {
  problems.push(`badge should show min 40, got ${JSON.stringify(badge.texts.slice(-3))}`);
}
if (badge.colors[badge.colors.length - 1] !== '#c98a1b') {
  problems.push(`badge for 40% should be amber, got ${badge.colors[badge.colors.length - 1]}`);
}

// 6) 取消勾选 cursor 后徽章重算（min 变 60，绿色）
await new Promise((r) => ctxObj.chrome.storage.local.set({ enabledAgents: { cursor: false } }, r));
await tick(10);
if (badge.texts[badge.texts.length - 1] !== '60') {
  problems.push(`badge should recompute to 60 without cursor, got ${badge.texts[badge.texts.length - 1]}`);
}
if (badge.colors[badge.colors.length - 1] !== '#2e9e6b') {
  problems.push(`badge for 60% should be green, got ${badge.colors[badge.colors.length - 1]}`);
}

// 7) 低额度通知：只在跌破阈值那一刻触发
const notify = async (pct, t) => { await send(agentData({ id: 'codex', scraped_at: t, limits: [{ label: 'Weekly', percent_left: pct }] })); await tick(10); };
await notify(12, now + 120000); // 60 → 12：跌破 15
if (notifications.length !== 1 || !notifications[0].title.includes('12% left')) {
  problems.push(`crossing 15% should notify once, got ${JSON.stringify(notifications)}`);
}
await notify(10, now + 180000); // 12 → 10：没有新的穿越
if (notifications.length !== 1) problems.push('no crossing → no extra notification');
await notify(4, now + 240000); // 10 → 4：跌破 5
if (notifications.length !== 2) problems.push('crossing 5% should notify again');
await notify(90, now + 300000); // 重置回 90：不通知
if (notifications.length !== 2) problems.push('reset upward must not notify');
await notify(9, now + 360000); // 90 → 9：新周期再次跌破 15
if (notifications.length !== 3) problems.push('crossing 15% after a reset should notify again');

// 8) notifyLow=false 关掉通知
await new Promise((r) => ctxObj.chrome.storage.local.set({ notifyLow: false }, r));
await notify(95, now + 420000);
await notify(8, now + 480000);
if (notifications.length !== 3) problems.push('notifyLow=false should suppress notifications');
await new Promise((r) => ctxObj.chrome.storage.local.set({ notifyLow: true }, r));

// 9) 闹钟：默认创建；autoRefresh=false 清除；true 恢复
if (!alarms.created.some((a) => a.name === 'quietRefresh' && a.periodInMinutes === 60)) {
  problems.push('startup should create the hourly quietRefresh alarm');
}
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: false }, r));
await tick(10);
if (alarms.cleared < 1) problems.push('autoRefresh=false should clear the alarm');
await new Promise((r) => ctxObj.chrome.storage.local.set({ autoRefresh: true }, r));
await tick(10);

// 10) 静默检查：所有勾选产品都在后台标签页尝试（cursor 已取消勾选 → 不开）
const before = createdTabs.length;
alarms.listener({ name: 'quietRefresh' });
await tick(15);
const quiet = createdTabs.slice(before);
if (!quiet.length || quiet.some((o) => o.active !== false)) {
  problems.push(`quiet check must only open background tabs, got ${JSON.stringify(quiet)}`);
}
const urls = quiet.map((o) => o.url).join(' ');
if (!urls.includes('claude.ai') || !urls.includes('chatgpt.com') || !urls.includes('grok.com')) {
  problems.push(`quiet check should cover all enabled agents, got ${urls}`);
}
if (urls.includes('cursor.com')) problems.push('quiet check must skip unchecked agents');

// 11) 动一动提醒：默认关；打开后 2 小时内烧掉 >10% 才提醒；2 小时冷却；只算重置之后的消耗
const H = 3600000;
const T = now + 30 * 86400000; // 远离前面的历史，互不干扰
const grok = async (pct, t) => { await send(agentData({ id: 'grok-build', scraped_at: t, limits: [{ label: 'Weekly (SuperGrok)', percent_left: pct }] })); await tick(10); };
const moves = () => notifications.filter((n) => n.id.startsWith('move-'));
await grok(90, T);
await grok(78, T + 1 * H); // 掉 12，但 moveReminder 默认关
if (moves().length !== 0) problems.push('move reminder must be opt-in (no nudge by default)');
await new Promise((r) => ctxObj.chrome.storage.local.set({ moveReminder: true }, r));
await grok(75, T + 1.5 * H); // 窗口内 90→75，掉 15 → 提醒
if (moves().length !== 1 || !moves()[0].title.includes('15%')) {
  problems.push(`burning 15% in 2h should nudge once, got ${JSON.stringify(moves())}`);
}
await grok(60, T + 2 * H); // 冷却中：不再提醒
if (moves().length !== 1) problems.push('second nudge within the 2h cooldown must be suppressed');
await grok(58, T + 5 * H); // 窗口 [3h,5h] 里只有这一条 → 数据不够，不提醒
if (moves().length !== 1) problems.push('a single point in the window is not enough to nudge');
await grok(100, T + 6.5 * H); // 额度重置
await grok(88, T + 7 * H); // 窗口 [5h,7h]：58→100 是重置，只算 100→88 = 12 → 提醒
if (moves().length !== 2) problems.push(`burn after a reset should count from the reset, got ${JSON.stringify(moves())}`);
if (!moves()[1].message.includes('vibe coding')) problems.push('nudge body should carry the vibe-coding line');
if (!store.moveNudgedAt || store.moveNudgedAt['grok-build'] !== T + 7 * H) {
  problems.push(`moveNudgedAt should record the last nudge time, got ${JSON.stringify(store.moveNudgedAt)}`);
}
await grok(86, T + 9.5 * H); // 冷却已过，但窗口 [7.5h,9.5h] 里只有这一条
await grok(82, T + 10 * H); // 窗口 [8h,10h]：86→82 只掉 4，低于阈值
if (moves().length !== 2) problems.push('a small burn below 10% must not nudge');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Concurrent agentData saves are serialized (no lost update)');
console.log('ok  Cursor usage+spending pages merge into one record');
console.log('ok  History dedupe and closeMe behave as before');
console.log('ok  Badge shows the lowest remaining % across tracked agents');
console.log('ok  Low-quota notifications fire only on threshold crossings');
console.log('ok  Hourly quiet check: background tabs only, tracked agents only, toggleable');
console.log('ok  Move reminder: opt-in, >10% burned in 2h, 2h cooldown, counts from the last reset');
console.log('\nBackground test passed.');
