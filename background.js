// 后台协调"Refresh":
// - 轻页面(Claude/Codex)：后台悄悄开，抓完自己关。
// - 重页面(Cursor/Grok)：浏览器会冻结后台标签页导致抓不到，所以逐个"短暂切到前台"、
//   抓到就自动关，一个接一个，尽量少打扰。

const BG_URLS = [
  'https://claude.ai/new?cawrefresh=1#settings/usage',
  'https://chatgpt.com/codex/cloud/settings/analytics?cawrefresh=1#usage',
];
const FG_URLS = [
  'https://cursor.com/dashboard/usage?cawrefresh=1',
  'https://cursor.com/dashboard/spending?cawrefresh=1',
  'https://grok.com/?_s=usage&cawrefresh=1',
];

let refreshing = false;

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
  try {
    // 轻页面：后台并行
    BG_URLS.forEach((u) => openAndWait(u, false, 25000));
    // 重页面：前台逐个，抓到即关
    for (const u of FG_URLS) {
      await openAndWait(u, true, 25000);
    }
  } finally {
    refreshing = false;
  }
}
