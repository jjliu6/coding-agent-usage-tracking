// Render the Grok card with the SuperGrok fixture and check the remaining %.

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
const popupSrc = readFileSync(resolve(root, 'popup.js'), 'utf8');
const noop = () => {};
const popupCtx = {
  chrome: {
    storage: {
      local: { get: (_keys, cb) => cb && cb({ agents: {}, history: [] }), set: noop },
      onChanged: { addListener: noop },
    },
    runtime: {
      sendMessage: (msg) => { sent.push(msg); },
      getContexts: () => Promise.resolve([]),
      getURL: (p) => p,
      lastError: null,
    },
    sidePanel: { open: ({ windowId }) => { sideOpened++; popupCtx._openedWindowId = windowId; return Promise.resolve(); } },
    windows: { getLastFocused: (_opts, cb) => cb({ id: 42, type: 'normal' }) },
  },
  document: {
    getElementById: () => ({ addEventListener: noop, textContent: '', innerHTML: '', disabled: false, classList: { add: noop } }),
    body: { classList: { add: noop }, style: {} },
  },
  location: { href: 'chrome-extension://id/popup.html' },
  setTimeout: noop,
};
vm.runInNewContext(popupSrc, popupCtx, { filename: 'popup.js' });

const html = popupCtx.card('grok-build', grok, []);
const problems = [];
if (!html.includes('>67%</b>')) problems.push('card should show 67% remaining, not the old 91%');
if (html.includes('>91%</b>')) problems.push('card still shows the buggy 91% remaining');
if (!html.includes('聊天 16%')) problems.push('missing 聊天 16% in the breakdown legend');
if (!html.includes('构建 10%')) problems.push('missing 构建 10% in the breakdown legend');
if (!html.includes('自动 6%')) problems.push('missing 自动 6% in the breakdown legend');
if (!html.includes('绘图 1%')) problems.push('missing 绘图 1% in the breakdown legend');
if (!html.includes('bar stacked')) problems.push('missing stacked usage bar');
if (!html.includes('剩余')) problems.push('card should use 剩余 instead of left');

if (problems.length) {
  console.error(html);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Grok 卡片显示 67% 剩余，以及 聊天/构建/自动/绘图 分类');

sent = [];
sideOpened = 0;
popupCtx.startRefresh();
await Promise.resolve();
await Promise.resolve();
if (sideOpened !== 1) {
  console.error('expected side panel to open once on Refresh, got', sideOpened);
  process.exit(1);
}
if (popupCtx._openedWindowId !== 42) {
  console.error('side panel should open on the current window');
  process.exit(1);
}
if (!sent.some((m) => m && m.type === 'refreshAll')) {
  console.error('expected refreshAll after opening the side panel, got', sent);
  process.exit(1);
}
console.log('ok  刷新会先打开侧边栏再开始抓取');
console.log('\nPopup card test passed.');
