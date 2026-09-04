// 版本号 & "有没有新版本"检查的公共部分。
// background（importScripts）和 popup（<script>）共用，跟 agents.js 一样是纯常量 + 纯函数。
//
// 版本号的唯一来源是 manifest.json 里的 "version"（Chrome 装扩展时读的就是它），
// 代码里不要再手写一份，否则发布时改漏一处就对不上了。
const UPDATE_REPO = 'jjliu6/token-police';
// GitHub 的公开 API：返回这个仓库"最新一次 Release"的信息（tag_name 就是版本号，如 "v1.2.1"）。
// 这个接口带 CORS 头，扩展不需要额外的 host_permissions 就能请求；不登录、不带任何用户数据。
const UPDATE_API = 'https://api.github.com/repos/' + UPDATE_REPO + '/releases/latest';
// 给用户点开看的发布页（有新版时链接到这里下载）
const UPDATE_PAGE = 'https://github.com/' + UPDATE_REPO + '/releases/latest';
// 多久查一次：一天。GitHub 匿名 API 每小时 60 次限额，一天一次绰绰有余，也不打扰用户。
const UPDATE_INTERVAL_MS = 24 * 60 * 60000;
// 查失败（断网等）后最少隔多久再试，避免每次唤醒 service worker 都去撞网络
const UPDATE_RETRY_MS = 60 * 60000;

// 当前安装的版本（读 manifest）。在没有 chrome.runtime 的环境（测试）里返回空串。
function currentVersion() {
  try {
    return chrome.runtime.getManifest().version || '';
  } catch (e) {
    return '';
  }
}

// Release 的 tag 长这样："v1.2.1"，去掉前面的 v 得到纯版本号 "1.2.1"。
// 不像版本号的（空的、乱的）返回 null，调用方据此判断"这次没查到"。
function parseVersionTag(tag) {
  if (typeof tag !== 'string') return null;
  const m = tag.trim().match(/^v?(\d+(?:\.\d+)*)$/i);
  return m ? m[1] : null;
}

// 比较两个版本号：a 比 b 新 → 1，旧 → -1，一样 → 0。
// 不能直接比字符串："1.2.10" 按字符串会小于 "1.2.9"，所以要按点拆开逐段比数字。
// 段数不同时缺的段按 0 算（"1.2" == "1.2.0"）。
function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// storage 里的 updateCheck = { checkedAt, latest, url, failedAt }。
// 有新版 = 查到过 latest，且比"现在装的"新。注意是跟当前版本比，不是存一个 true/false：
// 用户更新完扩展后，上次存的 latest 就等于当前版本了，自然不再提示，不用等下一次检查。
function updateAvailable(info, cur) {
  const mine = cur == null ? currentVersion() : cur;
  if (!info || !info.latest || !mine) return false;
  return cmpVersion(info.latest, mine) > 0;
}
