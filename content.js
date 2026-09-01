// 在 4 个 usage 页面上运行：把页面上的数字抠下来，存起来。
// 只有真的认出数字才存，普通页面不动。

function num(s) {
  if (s == null) return null;
  s = ('' + s).trim().replace(/,/g, '');
  let m;
  if ((m = s.match(/^([\d.]+)\s*万$/))) return Math.round(parseFloat(m[1]) * 1e4);
  if ((m = s.match(/^([\d.]+)\s*[Bb]$/))) return Math.round(parseFloat(m[1]) * 1e9);
  if ((m = s.match(/^([\d.]+)\s*[Mm]$/))) return Math.round(parseFloat(m[1]) * 1e6);
  if ((m = s.match(/^([\d.]+)\s*[Kk]$/))) return Math.round(parseFloat(m[1]) * 1e3);
  if ((m = s.match(/^([\d.]+)$/))) return parseFloat(m[1]);
  return null;
}

// 有些页面（比如 Grok）把内容放进 Shadow DOM，普通 innerText 读不到。
// 这个函数会连 Shadow DOM 里的文字一起收集。脚本/样式里的 "%" 不要算进去。
function deepText(root) {
  let out = '';
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1 };
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 3) { out += node.nodeValue + '\n'; return; }
    if (node.nodeType === 1 && SKIP[node.nodeName]) return;
    if (node.shadowRoot) node.shadowRoot.childNodes.forEach(walk);
    if (node.childNodes) node.childNodes.forEach(walk);
  };
  walk(root || document.body);
  return out;
}

function makeAgent() {
  const T = (document.body.innerText || '') + '\n' + deepText(document.body);
  const h = location.hostname;
  const g = (re) => { const m = T.match(re); return m ? m[1].trim() : null; };
  const pct = (re) => { const m = T.match(re); return m ? parseInt(m[1], 10) : null; };

  if (h.includes('claude.ai')) {
    const wu = pct(/All models[\s\S]{0,60}?(\d+)%\s*used/i);
    if (wu == null) return null;
    const su = pct(/Current session[\s\S]{0,60}?(\d+)%\s*used/i);
    const limits = [{ label: 'Weekly (All models)', percent_left: 100 - wu, resets_text: g(/All models[\s\S]{0,120}?Resets\s+([^\n]+)/i) }];
    if (su != null) limits.push({ label: 'Session (5h)', percent_left: 100 - su, resets_text: g(/Current session[\s\S]{0,90}?Resets\s+([^\n]+)/i) });
    return { id: 'claude-code', name: 'Claude Code', color: '#D97757', limits };
  }

  if (h.includes('chatgpt.com')) {
    const wk = pct(/Weekly usage limit[\s\S]{0,40}?(\d+)%\s*remaining/i);
    if (wk == null) return null;
    const fh = pct(/5[\s-]?hour usage limit[\s\S]{0,40}?(\d+)%\s*remaining/i);
    const limits = [{ label: 'Weekly', percent_left: wk, resets_text: null }];
    if (fh != null) limits.push({ label: '5-hour limit', percent_left: fh, resets_text: g(/Resets\s+(\d{1,2}:\d{2}\s*[AP]M)/i) });
    return { id: 'codex', name: 'Codex', color: '#5CD6B3', limits, credits: g(/Credits remaining[\s\S]{0,20}?(\d[\d,]*)/i) };
  }

  if (h.includes('grok.com')) {
    const parsed = parseGrokUsage(T);
    if (!parsed) return null;
    return { id: 'grok-build', name: 'Grok Build', color: '#B78CF0',
      limits: [{ label: 'Weekly (SuperGrok)', percent_left: 100 - parsed.used, resets_text: parsed.reset }],
      breakdown: parsed.breakdown };
  }

  if (h.includes('cursor.com')) {
    const a = { id: 'cursor', name: 'Cursor', color: '#6E9BF5' };
    const cm = pct(/Cursor Models[\s\S]{0,90}?(\d+)%\s*used/i);
    if (cm != null) {
      const om = pct(/Other Models[\s\S]{0,60}?(\d+)%\s*used/i);
      const resets = g(/Usage limits reset on\s+([^\n(]+)/i), dl = g(/(\d+)\s*days? left/i);
      const rt = resets ? resets + (dl ? ` (${dl} days)` : '') : null;
      a.limits = [{ label: 'Cursor Models', percent_left: 100 - cm, resets_text: rt }];
      if (om != null) a.limits.push({ label: 'Other Models', percent_left: 100 - om, resets_text: rt });
      a.plan = g(/CURRENT PLAN[\s\S]{0,30}?([A-Za-z+]+\s+\$\d+\/mo)/i);
    }
    const tt = num(g(/Total tokens[\s\S]{0,25}?([\d.]+\s*[KMB万]?)/i));
    if (tt != null) {
      a.tokens = {
        total: tt,
        included: num(g(/Included[\s\S]{0,25}?([\d.]+\s*[KMB万]?)/i)),
        on_demand: num(g(/On-demand[\s\S]{0,25}?([\d.]+\s*[KMB万]?|0)/i)),
      };
    }
    if (!a.limits && !a.tokens) return null;
    return a;
  }
  return null;
}

// 抓到的数据发给 background 统一写入。多个抓取标签页可能同时完成，
// 各自 get→改→set 会互相覆盖，所以由 background 排队串行写。
function save(a, done) {
  a.scraped_at = Date.now();
  a.status = 'ok';
  try {
    chrome.runtime.sendMessage({ type: 'agentData', agent: a }, () => {
      void chrome.runtime.lastError;
      if (done) done();
    });
  } catch (e) {
    if (done) done();
  }
}

function closeIfAuto() {
  if (location.search.includes('cawrefresh')) {
    try { chrome.runtime.sendMessage({ type: 'closeMe' }); } catch (e) {}
  }
}

// 页面/弹窗可能加载很慢（Grok、Cursor 尤其）。改成"盯着页面，数字一出现就抓"，
// 最多等 60 秒，兼顾慢加载和后台标签页被浏览器降速的情况。
// Grok 的大数字会从 0 往上滚，第一次匹配到的 "N% used" 往往是动画中间值，
// 所以同一读数要稳住一小会儿才存。
let done = false, iv = null, obs = null;
let grokHold = { sig: '', t: 0 };
function grokStable(a) {
  const pct = a.limits && a.limits[0] ? a.limits[0].percent_left : '';
  const sig = pct + '|' + (a.breakdown || []).map((x) => x.percent).join(',');
  const now = Date.now();
  if (grokHold.sig !== sig) {
    grokHold = { sig, t: now };
    return false;
  }
  return now - grokHold.t >= 1200;
}
function finish() { if (obs) obs.disconnect(); if (iv) clearInterval(iv); }
function tryOnce() {
  if (done) return;
  const a = makeAgent();
  if (!a) return;
  if (a.id === 'grok-build' && !grokStable(a)) return;
  done = true;
  finish();
  save(a, closeIfAuto);
}
tryOnce();
if (!done) {
  obs = new MutationObserver(tryOnce);
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  let n = 0;
  iv = setInterval(() => { n++; tryOnce(); if (!done && n > 30) { finish(); closeIfAuto(); } }, 2000);
}
