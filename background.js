// 后台协调"Refresh":
// - 轻页面(Claude/Codex)：后台悄悄开，抓完自己关。
// - 重页面(Cursor/Grok)：浏览器会冻结后台标签页导致抓不到，所以逐个"短暂切到前台"、
//   抓到就自动关，一个接一个，尽量少打扰。
// - 只刷新用户在面板里勾选的产品（enabledAgents，缺省全开）。
// - 刷新结束后按 agent 记录成/败（refresh.results），面板据此提示"没抓到，可能未登录"。

importScripts('agents.js', 'i18n.js');

let refreshing = false;

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

// 徽章常驻显示"所有勾选产品里最低的剩余%"，不用打开面板也能扫一眼
function updateBadge() {
  if (refreshing) return; // 手动刷新期间显示 "…"，结束时再更新
  chrome.storage.local.get(['agents', 'enabledAgents'], (res) => {
    const map = res.agents || {};
    const en = res.enabledAgents || {};
    let min = null;
    AGENTS.forEach((a) => {
      if (en[a.id] === false) return;
      const ag = map[a.id];
      const pct = ag && ag.limits && ag.limits[0] ? ag.limits[0].percent_left : null;
      if (pct != null && (min == null || pct < min)) min = pct;
    });
    if (min == null) { chrome.action.setBadgeText({ text: '' }); return; }
    chrome.action.setBadgeText({ text: String(min) });
    // 深色底配白字才看得清（面板里的浅色系在徽章上对比度不够）
    chrome.action.setBadgeBackgroundColor({ color: min > 50 ? '#2e9e6b' : min >= 20 ? '#c98a1b' : '#d64545' });
  });
}

// 每小时静默自动检查（autoRefresh，默认开）：所有勾选的产品统一在后台标签页尽力抓，
// 绝不抢焦点。重页面(Cursor/Grok)在后台可能被浏览器节流渲染不出来——抓不到就保持
// 原数据、不标失败（卡片上的 "Xh ago" 反映新鲜度），要保证最新走手动 Refresh。
function syncAlarm() {
  if (!chrome.alarms) return;
  chrome.storage.local.get(['autoRefresh'], (res) => {
    if (res.autoRefresh !== false) chrome.alarms.create('quietRefresh', { periodInMinutes: 60 });
    else chrome.alarms.clear('quietRefresh', () => void chrome.runtime.lastError);
  });
}

async function runQuietRefresh() {
  if (refreshing) return; // 手动刷新进行中就别添乱
  const en = (await getLocal(['enabledAgents'])).enabledAgents || {};
  const list = AGENTS.filter((a) => en[a.id] !== false);
  await Promise.all(list.flatMap((a) => a.scrape.map((u) => openAndWait(u, false, 25000))));
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((al) => { if (al && al.name === 'quietRefresh') runQuietRefresh(); });
}

chrome.storage.onChanged.addListener((ch, area) => {
  if (area !== 'local' || !ch) return;
  if (ch.agents || ch.enabledAgents) updateBadge();
  if (ch.autoRefresh) syncAlarm();
});

syncAlarm();
updateBadge();

function setRefresh(partial) {
  chrome.storage.local.get(['refresh'], (res) => {
    chrome.storage.local.set({ refresh: Object.assign({ running: false }, res.refresh, partial) });
  });
}

function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

// content.js 抓到的数据都经这里写入。多个抓取标签页可能同时完成，
// 各自 get→改→set 会丢更新，所以全部排进一个队列串行执行。
let writeQueue = Promise.resolve();

// 低额度提醒：剩余% 从阈值上方跌破阈值那一刻才通知（重置后涨回去，下次再跌破会再提醒）。
// 只在"穿越"时触发，天然去重，不会反复轰炸。
const LOW_THRESHOLDS = [15, 5];

function maybeNotify(a, oldPct, pct) {
  if (!chrome.notifications || oldPct == null || pct == null) return;
  const crossed = LOW_THRESHOLDS.filter((T) => oldPct > T && pct <= T);
  if (!crossed.length) return;
  chrome.storage.local.get(['notifyLow', 'uiLang'], (res) => {
    if (res.notifyLow === false) return;
    applyStoredLang(res.uiLang);
    const meta = AGENTS.find((x) => x.id === a.id);
    const reset = a.limits && a.limits[0] && a.limits[0].resets_text;
    chrome.notifications.create('low-' + a.id + '-' + crossed[crossed.length - 1], {
      type: 'basic',
      iconUrl: 'icons/128.png',
      title: t('lowTitle', { name: (meta && meta.name) || a.id, n: pct }),
      message: reset ? t('lowBodyR', { r: reset }) : t('lowBody'),
    }, () => void chrome.runtime.lastError);
  });
}

function saveAgent(a) {
  const run = () => new Promise((resolve) => {
    chrome.storage.local.get(['agents', 'history'], (res) => {
      const map = res.agents || {};
      const prev = map[a.id];
      const oldPct = prev && prev.limits && prev.limits[0] ? prev.limits[0].percent_left : null;
      // Cursor 分两页，合并保留各自字段
      map[a.id] = (a.id === 'cursor' && map.cursor) ? Object.assign({}, map.cursor, a) : a;

      // 记历史：只存主额度的left%，用来算消耗速度 / 预计用完时间
      let hist = res.history || [];
      const merged = map[a.id];
      const pct = merged.limits && merged.limits[0] ? merged.limits[0].percent_left : null;
      if (pct != null) {
        let last = null;
        for (let i = hist.length - 1; i >= 0; i--) { if (hist[i].id === a.id) { last = hist[i]; break; } }
        // 同一 agent：距上次超过 5 分钟、或数值变了才记一笔，避免灌水
        if (!last || a.scraped_at - last.t > 5 * 60000 || Math.abs(last.pct - pct) >= 1) {
          hist.push({ id: a.id, t: a.scraped_at, pct });
          if (hist.length > 1200) hist = hist.slice(hist.length - 1200);
        }
      }
      maybeNotify(merged, oldPct, pct);
      chrome.storage.local.set({ agents: map, history: hist }, resolve);
    });
  });
  writeQueue = writeQueue.then(run, run);
  return writeQueue;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'agentData' && msg.agent && typeof msg.agent.id === 'string') {
    saveAgent(msg.agent).then(() => sendResponse({ ok: true }));
    return true; // 等写完再 sendResponse
  }
  if (msg && msg.type === 'closeMe' && sender.tab && sender.tab.id != null) {
    chrome.tabs.remove(sender.tab.id, () => void chrome.runtime.lastError);
  }
  if (msg && msg.type === 'refreshAll') runRefresh();
});

// 打开一个标签页，等它被 content.js 抓完自己关掉；最多等 maxMs 就强制关、继续下一个
function openAndWait(url, active, maxMs) {
  return new Promise((resolve) => {
    chrome.tabs.create({ url, active }, (tab) => {
      const tid = tab && tab.id;
      if (tid == null) return resolve();
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        chrome.tabs.onRemoved.removeListener(onRemoved);
        chrome.tabs.remove(tid, () => void chrome.runtime.lastError);
        resolve();
      }, maxMs);
      function onRemoved(id) {
        if (id !== tid || finished) return;
        finished = true;
        clearTimeout(timer);
        chrome.tabs.onRemoved.removeListener(onRemoved);
        resolve();
      }
      chrome.tabs.onRemoved.addListener(onRemoved);
    });
  });
}

async function runRefresh() {
  if (refreshing) return;
  refreshing = true;
  const started = Date.now();
  let results = null;
  setRefresh({ running: true, started, finished: null, results: null });
  try {
    chrome.action.setBadgeText({ text: '…' });
    chrome.action.setBadgeBackgroundColor({ color: '#6E9BF5' });
    const en = (await getLocal(['enabledAgents'])).enabledAgents || {};
    const list = AGENTS.filter((a) => en[a.id] !== false);
    // 轻页面：后台并行；重页面：前台逐个，抓到即关
    const bg = [];
    list.forEach((a) => {
      if (!a.foreground) a.scrape.forEach((u) => bg.push(openAndWait(u, false, 25000)));
    });
    for (const a of list) {
      if (!a.foreground) continue;
      for (const u of a.scrape) await openAndWait(u, true, 25000);
    }
    await Promise.all(bg);
    // 这轮有没有真的抓到新数据：拿 scraped_at 和本轮开始时间比
    const map = (await getLocal(['agents'])).agents || {};
    results = {};
    list.forEach((a) => {
      results[a.id] = map[a.id] && map[a.id].scraped_at >= started ? 'ok' : 'fail';
    });
  } finally {
    refreshing = false;
    setRefresh({ running: false, finished: Date.now(), results });
    updateBadge(); // 刷新结束：从 "…" 恢复成最低剩余%
  }
}
