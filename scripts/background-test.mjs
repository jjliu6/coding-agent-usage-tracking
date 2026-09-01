// Exercise background.js's serialized storage writes: two scrape tabs that
// finish at the same moment must both be persisted (the old content.js
// read-modify-write raced and could lose one). Storage callbacks are async
// (setTimeout) exactly so an unserialized implementation would interleave.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (v) => JSON.parse(JSON.stringify(v));

const store = {};
let onMessage = null;
const removedTabs = [];

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
            Object.assign(store, clone(obj));
            if (cb) cb();
          }, 0);
        },
      },
    },
    runtime: {
      onMessage: { addListener: (fn) => { onMessage = fn; } },
      lastError: null,
    },
    tabs: {
      create: () => {},
      remove: (id, cb) => { removedTabs.push(id); if (cb) cb(); },
      onRemoved: { addListener: () => {}, removeListener: () => {} },
    },
    action: { setBadgeText: () => {}, setBadgeBackgroundColor: () => {} },
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

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Concurrent agentData saves are serialized (no lost update)');
console.log('ok  Cursor usage+spending pages merge into one record');
console.log('ok  History dedupe and closeMe behave as before');
console.log('\nBackground test passed.');
