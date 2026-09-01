// 后台协调"Refresh":
// - 轻页面(Claude/Codex)：后台悄悄开，抓完自己关。
// - 重页面(Cursor/Grok)：浏览器会冻结后台标签页导致抓不到，所以逐个"短暂切到前台"、
//   抓到就自动关，一个接一个，尽量少打扰。
// - 只刷新用户在面板里勾选的产品（enabledAgents，缺省全开）。
// - 刷新结束后按 agent 记录成/败（refresh.results），面板据此提示"没抓到，可能未登录"。

importScripts('agents.js');

let refreshing = false;

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}

function setRefresh(partial) {
  chrome.storage.local.get(['refresh'], (res) => {
    chrome.storage.local.set({ refresh: Object.assign({ running: false }, res.refresh, partial) });
  });
}

function getLocal(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

chrome.runtime.onMessage.addListener((msg, sender) => {
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
    chrome.action.setBadgeText({ text: '' });
  }
}
