// 产品列表（名字/颜色/额度页 URL）统一放在 agents.js
const ORDER = AGENTS.map((a) => a.id);
const META = {};
AGENTS.forEach((a) => { META[a.id] = a; });

// 抓取值来自目标网页的文本，进 innerHTML 前必须转义，防止页面内容注入面板
const esc = (s) => ('' + s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const fmtTok = (n) => {
  if (n == null) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return '' + n;
};
const health = (p) => (p > 50 ? 'var(--good)' : p >= 20 ? 'var(--warn)' : 'var(--bad)');
const ago = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('justNow');
  if (m < 60) return t('minsAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('hoursAgo', { n: h });
  return t('daysAgo', { n: Math.round(h / 24) });
};

// 把各家五花八门的"重置时间"文字，统一解析成一个真实的日期
function parseReset(txt, now) {
  if (!txt) return null;
  const t = txt.trim();
  let m;
  // "(31 days)" 这种直接给了天数（Cursor）
  if ((m = t.match(/\((\d+)\s*days?\)/i))) { const d = new Date(now); d.setDate(d.getDate() + +m[1]); return d; }
  // "in 1 hr 58 min" / "in 2 days"（Claude 会话）
  if ((m = t.match(/^in\s+(.+)/i))) {
    const d = new Date(now), s = m[1]; let mm;
    if ((mm = s.match(/(\d+)\s*day/i))) d.setDate(d.getDate() + +mm[1]);
    if ((mm = s.match(/(\d+)\s*hr/i))) d.setHours(d.getHours() + +mm[1]);
    if ((mm = s.match(/(\d+)\s*min/i))) d.setMinutes(d.getMinutes() + +mm[1]);
    return d;
  }
  // 中文 "9月26日"
  if ((m = t.match(/(\d+)\s*月\s*(\d+)\s*日/))) {
    const d = new Date(now); d.setMonth(+m[1] - 1, +m[2]); d.setHours(0, 0, 0, 0);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // "August 28, 2026 at 2:20 AM"
  if (/\d{4}/.test(t) && /[A-Za-z]{3,}/.test(t)) {
    const d = new Date(t.replace(/\s+at\s+/i, ' '));
    if (!isNaN(d.getTime())) return d;
  }
  // "Sat 5:00 PM"（星期几 + 时间）
  if ((m = t.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\s+(\d{1,2}):(\d{2})\s*([AP]M)?/i))) {
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const target = days.indexOf(m[1].toLowerCase().slice(0, 3));
    let h = +m[2]; const ap = (m[4] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    const d = new Date(now); d.setHours(h, +m[3], 0, 0);
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0 && d <= now) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  // "6:20 PM"（只有时间）
  if ((m = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i))) {
    let h = +m[1]; const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    const d = new Date(now); d.setHours(h, +m[2], 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1);
    return d;
  }
  return null;
}

// "reset in X 天 / X 小时"
function untilText(d, now) {
  if (!d) return null;
  const ms = d - now;
  if (ms <= 0) return t('resettingSoon');
  const days = ms / 86400000;
  if (days >= 1) return t('resetInDays', { n: Math.round(days) });
  const hrs = ms / 3600000;
  if (hrs >= 1) return t('resetInHours', { n: Math.round(hrs) });
  return t('resetInMins', { n: Math.max(1, Math.round(ms / 60000)) });
}

// 科学的判断：要有足够历史、并且拿"预计见底时间"和"真实重置时间"比，才敢说够不够
function verdict(seg0, resetDate, now) {
  if (!seg0 || seg0.length < 3) return { text: t('burnCollecting'), color: 'var(--muted)' };
  seg0 = seg0.slice().sort((a, b) => a.t - b.t);
  let start = 0;
  for (let i = 1; i < seg0.length; i++) { if (seg0[i].pct > seg0[i - 1].pct + 2) start = i; } // 涨上去=重置过
  const seg = seg0.slice(start);
  const a = seg[0], b = seg[seg.length - 1];
  const span = (b.t - a.t) / 3600000; // 小时
  if (seg.length < 3 || span < 4) return { text: t('burnCollecting'), color: 'var(--muted)' };
  const perH = (a.pct - b.pct) / span;
  const perDay = perH * 24;
  if (perH < 0.1) return { text: t('burnBarely'), color: 'var(--ink2)' };
  const h2z = b.pct / perH; // 还能撑多少小时到 0
  const h2r = resetDate ? (resetDate - now) / 3600000 : null; // 离重置多少小时
  if (h2r != null && h2z > h2r) return { text: t('burnTillReset', { n: perDay.toFixed(0) }), color: 'var(--good)' };
  const eta = h2z < 48 ? t('burnEmptyHours', { n: Math.round(h2z) }) : t('burnEmptyDays', { n: Math.round(h2z / 24) });
  const color = h2r != null ? 'var(--bad)' : (h2z < 24 ? 'var(--bad)' : h2z < 72 ? 'var(--warn)' : 'var(--ink2)');
  return { text: t('burnLine', { n: perDay.toFixed(0), eta }) + (h2r != null ? t('burnBefore') : ''), color };
}

// 各产品的小标记（简约几何图形，不是官方 logo 的精确复制）
function logo(id, c) {
  if (id === 'claude-code') {
    let ls = '';
    for (let i = 0; i < 12; i++) { const a = i * 30 * Math.PI / 180; ls += `<line x1="${(10 + 3.6 * Math.cos(a)).toFixed(1)}" y1="${(10 + 3.6 * Math.sin(a)).toFixed(1)}" x2="${(10 + 8.4 * Math.cos(a)).toFixed(1)}" y2="${(10 + 8.4 * Math.sin(a)).toFixed(1)}"/>`; }
    return `<svg width="20" height="20"><g stroke="${c}" stroke-width="1.4" stroke-linecap="round">${ls}</g></svg>`;
  }
  if (id === 'codex') return `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.6"><polygon points="10,3 16,6.5 16,13.5 10,17 4,13.5 4,6.5"/><circle cx="10" cy="10" r="2.2"/></svg>`;
  if (id === 'grok-build') return `<svg width="20" height="20" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="13" height="13" rx="4"/><line x1="7.5" y1="12.5" x2="12.5" y2="7.5"/></svg>`;
  if (id === 'cursor') return `<svg width="20" height="20" fill="${c}"><path d="M6 4 L15 10 L10.6 11 L13 15.6 L11 16.6 L8.6 12 L6 15 Z"/></svg>`;
  return `<span style="width:10px;height:10px;border-radius:3px;background:${c};display:inline-block"></span>`;
}

const BD_COLOR = {
  Chat: '#5ccf9e',
  'App Builder': '#6E9BF5',
  Automations: '#e6b45c',
  Imagine: '#e57373',
  Voice: '#B78CF0',
  API: '#aab2c0',
};
const BD_SHORT_KEY = {
  Chat: 'chat',
  'App Builder': 'build',
  Automations: 'auto',
  Imagine: 'imagine',
  Voice: 'voice',
  API: 'api',
};
const LIMIT_KEYS = {
  'Weekly (All models)': 'weeklyAll',
  'Weekly 额度 (All models)': 'weeklyAll',
  'Session (5h)': 'session5h',
  '当前会话 (5h)': 'session5h',
  Weekly: 'weekly',
  'Weekly 额度': 'weekly',
  '5-hour limit': 'fiveHour',
  '5 小时额度': 'fiveHour',
  'Weekly (SuperGrok)': 'weeklyGrok',
  'Weekly 额度 (SuperGrok)': 'weeklyGrok',
  'Cursor Models': 'cursorModels',
  'Other Models': 'otherModels',
  'This period': 'thisPeriod',
  本周期: 'thisPeriod',
};

function limLabel(s) {
  const key = LIMIT_KEYS[s];
  return key ? t(key) : esc(s);
}

function bdShort(name) {
  const key = BD_SHORT_KEY[name];
  return key ? t(key) : esc(name);
}

function breakdownBar(bd) {
  if (!bd || !bd.length) return '';
  const segs = bd.map((x) => {
    const c = BD_COLOR[x.name] || '#8a92a0';
    const p = Math.max(0, Math.min(100, +x.percent || 0));
    return `<i title="${esc(x.name)} ${p}%" style="width:${p}%;background:${c}"></i>`;
  }).join('');
  const legend = bd.map((x) => `${bdShort(x.name)} ${Math.max(0, Math.min(100, +x.percent || 0))}%`).join(' · ');
  return `<div class="barwrap"><div class="t"><span>${legend}</span></div>
    <div class="bar stacked">${segs}</div></div>`;
}

// 近 7 天剩余额度的迷你走势图（额度重置会画出"锯齿"，一眼看出使用节奏）
function sparkline(entries, color) {
  const now = Date.now();
  const from = now - 7 * 86400000;
  const pts = (entries || [])
    .filter((e) => e && e.t >= from && e.pct != null)
    .slice()
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return '';
  const W = 100, H = 26, P = 2;
  const t0 = pts[0].t;
  const span = Math.max(pts[pts.length - 1].t - t0, 1);
  const xy = pts.map((e) => [
    ((e.t - t0) / span * W).toFixed(1),
    (P + (100 - e.pct) / 100 * (H - 2 * P)).toFixed(1),
  ]);
  const line = xy.map((p) => p.join(',')).join(' ');
  const area = `0,${H} ${line} ${W},${H}`;
  return `<div class="spark" title="${t('spark7d')}">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polygon points="${area}" fill="${color}" fill-opacity="0.10"/>
      <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2"
        vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
    </svg></div>`;
}

function ring(pct, color) {
  const R = 28, C = 2 * Math.PI * R, off = C * (1 - (pct || 0) / 100);
  return `<svg width="66" height="66" viewBox="0 0 66 66">
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="var(--track)" stroke-width="6"/>
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 33 33)"/>
  </svg>`;
}

// ---- 发量小人（程序员们的头发量）----
// 把"平均剩余额度"画成一个小脑袋：额度越少头发越少，额度重置时头发长回来。
// 头发是 24 根固定的 SVG 线段，用 class="off" 隐藏掉的那几根，配合 CSS 过渡就有"掉发"动画。
const HAIR_N = 24;

// 剩余 pct 时哪几根头发还在。(k*7)%24 是一个打乱后的固定顺序（7 和 24 互质，
// 所以 k=0..23 恰好走遍每一根），这样掉发是"东一根西一根"，不是从一边整齐剃过去。
function hairSet(pct) {
  const shown = Math.round(Math.max(0, Math.min(100, pct == null ? 0 : pct)) / 100 * HAIR_N);
  const on = new Set();
  for (let k = 0; k < shown; k++) on.add((k * 7) % HAIR_N);
  return on;
}

// 嘴巴跟着心情走：>50 微笑，20–50 面无表情，<20 哭丧脸
function mouthPath(pct) {
  if (pct > 50) return 'M12.5 23.5 Q16 26.5 19.5 23.5';
  if (pct >= 20) return 'M12.5 24 L19.5 24';
  return 'M12.5 25 Q16 22.5 19.5 25';
}

function hairHead(pct) {
  const on = hairSet(pct);
  const cx = 16, cy = 20, r = 9.5;
  let strands = '';
  for (let i = 0; i < HAIR_N; i++) {
    // 头顶 195°→345° 这段弧上均匀分布；长短交替一下更像头发
    const a = (195 + i * (150 / (HAIR_N - 1))) * Math.PI / 180;
    const len = i % 2 ? 6 : 4.5;
    const x1 = (cx + r * Math.cos(a)).toFixed(1), y1 = (cy + r * Math.sin(a)).toFixed(1);
    const x2 = (cx + (r + len) * Math.cos(a)).toFixed(1), y2 = (cy + (r + len) * Math.sin(a)).toFixed(1);
    strands += `<line class="h${on.has(i) ? '' : ' off'}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  return `<svg viewBox="0 0 32 32" aria-hidden="true">
    <g stroke="#b8895c" stroke-width="1.6" stroke-linecap="round">${strands}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9c4a0"/>
    <circle cx="12.5" cy="19" r="1.2" fill="#2b2222"/><circle cx="19.5" cy="19" r="1.2" fill="#2b2222"/>
    <path class="m" d="${mouthPath(pct)}" fill="none" stroke="#2b2222" stroke-width="1.3" stroke-linecap="round"/>
  </svg>`;
}

// 所有显示中的产品的平均剩余%（只算有数据的），没有任何数据就返回 null
function avgPct(map, ids) {
  let sum = 0, n = 0;
  ids.forEach((id) => {
    const a = map[id];
    const p = a && a.limits && a.limits[0] ? a.limits[0].percent_left : null;
    if (p != null) { sum += p; n++; }
  });
  return n ? Math.round(sum / n) : null;
}

function renderHair(pct, show) {
  const box = document.getElementById('hair');
  if (!box) return;
  box.hidden = show === false || pct == null;
  if (box.hidden) return;
  box.title = t('hairTip', { n: pct });
  // 已经画过就只切换 class，保留原来的 DOM 节点，CSS 过渡才会播放"掉发"动画
  const strands = box.querySelectorAll ? box.querySelectorAll('.h') : null;
  if (strands && strands.length === HAIR_N) {
    const on = hairSet(pct);
    strands.forEach((el, i) => el.classList.toggle('off', !on.has(i)));
    const m = box.querySelector('.m');
    if (m) m.setAttribute('d', mouthPath(pct));
  } else {
    box.innerHTML = hairHead(pct);
  }
}

function openLink(id) {
  return `<a href="#" data-open="${id}">${t('openPage')} ↗</a>`;
}

function card(id, a, hist, fail) {
  const meta = META[id];
  if (!a) {
    return `<div class="card">
      <div class="chead"><div class="name">${logo(id, meta.color)}${meta.name}</div></div>
      <div class="empty">${t('empty')} ${openLink(id)}</div>
      ${fail ? `<div class="fail">⚠ ${t('fetchFailed')}</div>` : ''}
    </div>`;
  }
  const L = a.limits || [], p0 = L[0], p1 = L[1];
  const pct = p0 ? p0.percent_left : null;
  const now = Date.now();
  const resetDate = p0 ? parseReset(p0.resets_text, now) : null;
  const resetLabel = untilText(resetDate, now) || (p0 && p0.resets_text && esc(p0.resets_text)) || '';
  const est = pct != null ? verdict(hist, resetDate, now) : null;
  const plan = a.plan ? esc(a.plan) : null;
  const foot = [];
  if (a.tokens && a.tokens.total != null) foot.push(t('tokens', { n: fmtTok(a.tokens.total) }));
  if (a.credits && a.credits !== '0' && a.credits !== '$0.00') foot.push(t('credits', { n: esc(a.credits) }));
  else if (plan) foot.push(plan);

  const center = pct != null
    ? `<b style="color:${health(pct)}">${pct}%</b><span>${t('left')}</span>`
    : `<b style="font-size:13px">${fmtTok(a.tokens && a.tokens.total)}</b><span>TOKENS</span>`;
  const sec = p1
    ? `<div class="barwrap"><div class="t"><span>${limLabel(p1.label)}</span><span>${t('pctLeft', { n: p1.percent_left })}</span></div>
    <div class="bar"><i style="width:${p1.percent_left}%;background:${meta.color}"></i></div></div>`
    : breakdownBar(a.breakdown);

  let burn = '';
  if (est) burn = `<div style="font-size:10.5px;margin-top:9px;color:${est.color}">🔥 ${est.text}</div>`;
  const failLine = fail
    ? `<div class="fail">⚠ ${t('fetchFailed')} ${openLink(id)}</div>`
    : '';

  return `<div class="card">
    <div class="chead">
      <div class="name">${logo(id, meta.color)}${a.name ? esc(a.name) : meta.name}</div>
      ${plan ? `<span class="plan">${plan}</span>` : ''}
    </div>
    <div class="mid">
      <div class="ring">${ring(pct == null ? 0 : pct, meta.color)}<div class="c">${center}</div></div>
      <div class="stats">
        <div class="l0"><span>${p0 ? limLabel(p0.label) : (a.tokens ? t('thisPeriod') : '')}</span>${resetLabel ? `<span class="r">${resetLabel}</span>` : ''}</div>
        ${sec}
      </div>
    </div>
    ${burn}
    ${sparkline(hist, meta.color)}
    ${failLine}
    <div class="foot"><span>${foot.filter(Boolean).join(' · ')}</span><span>${ago(a.scraped_at)}</span></div>
  </div>`;
}

function renderSettings(en, prefs) {
  const box = document.getElementById('settings');
  if (!box) return;
  const agents = AGENTS.map((a) =>
    `<label><input type="checkbox" data-agent="${a.id}"${en[a.id] !== false ? ' checked' : ''}>${a.name}</label>`
  ).join('');
  // 功能开关：每小时静默自动检查、低额度通知、发量小人（默认开）；动一动提醒（默认关）
  const toggles = [
    ['autoRefresh', t('autoCheck'), t('autoCheckTip'), true],
    ['notifyLow', t('notifyLow'), t('notifyLowTip'), true],
    ['showHair', t('showHair'), t('showHairTip'), true],
    ['moveReminder', t('moveReminder'), t('moveReminderTip'), false],
  ].map(([k, label, tip, dflt]) => {
    const on = prefs[k] == null ? dflt : prefs[k] !== false;
    return `<label title="${tip}"><input type="checkbox" data-pref="${k}"${on ? ' checked' : ''}>${label}</label>`;
  }).join('');
  box.innerHTML = `<span class="st">${t('tracked')}</span>${agents}<span class="brk"></span>${toggles}`;
}

let staleTimer = null;

function render() {
  chrome.storage.local.get(['agents', 'history', 'refresh', 'enabledAgents', 'autoRefresh', 'notifyLow', 'showHair', 'moveReminder'], (res) => {
    const map = res.agents || {};
    const hist = res.history || [];
    const en = res.enabledAgents || {};
    const shown = ORDER.filter((id) => en[id] !== false);
    const byId = {};
    hist.forEach((e) => { (byId[e.id] = byId[e.id] || []).push(e); });
    const rf = res.refresh || {};
    // 兜底：MV3 service worker 可能中途被回收，refresh.running 会永远留在 true。
    // 一轮刷新最长约 100 秒，started 超过 2.5 分钟仍 running 就当它已经死了，别把按钮锁死。
    const STALE_MS = 150000;
    const running = !!(rf.running && rf.started && Date.now() - rf.started < STALE_MS);
    if (running) {
      // 面板开着不动也要能解锁：到过期时刻再重绘一次
      clearTimeout(staleTimer);
      staleTimer = setTimeout(render, STALE_MS - (Date.now() - rf.started) + 1000);
    }
    // 上一轮 Refresh 没抓到、且之后也没有更新的数据 → 卡片上提示失败
    const failed = (id) => !running && rf.results && rf.results[id] === 'fail' &&
      !(map[id] && rf.started && map[id].scraped_at >= rf.started);
    document.getElementById('grid').innerHTML =
      shown.map((id) => card(id, map[id], byId[id], failed(id))).join('');
    renderSettings(en, { autoRefresh: res.autoRefresh, notifyLow: res.notifyLow, showHair: res.showHair, moveReminder: res.moveReminder });
    renderHair(avgPct(map, shown), res.showHair);
    const any = shown.some((id) => map[id]);
    const btn = document.getElementById('refresh');
    // 顶部：最后一次Refresh时间（取所有产品里最新的一次）
    let latest = 0;
    shown.forEach((id) => { if (map[id] && map[id].scraped_at > latest) latest = map[id].scraped_at; });
    document.getElementById('upd').textContent = latest
      ? t('updated', { time: new Date(latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
      : '';
    if (running) {
      if (btn) { btn.textContent = t('fetching'); btn.disabled = true; }
      document.getElementById('hint').textContent = t('fetchingHint');
    } else {
      if (btn) { btn.textContent = t('refresh'); btn.disabled = false; }
      document.getElementById('hint').textContent = any ? '' : t('firstTime');
    }
  });
}

// Refresh only scrapes. The dashboard already lives in the side panel —
// do not open the toolbar popup or extra windows (that stacks flashing UIs).
function startRefresh() {
  const btn = document.getElementById('refresh');
  if (btn) {
    if (btn.disabled) return;
    btn.textContent = t('fetching');
    btn.disabled = true;
  }
  chrome.storage.local.set({ refresh: { running: true, started: Date.now() } });
  chrome.runtime.sendMessage({ type: 'refreshAll' });
}

document.getElementById('refresh').addEventListener('click', startRefresh);
const gearBtn = document.getElementById('gear');
if (gearBtn) {
  gearBtn.addEventListener('click', () => {
    const box = document.getElementById('settings');
    if (box) box.hidden = !box.hidden;
  });
}
const settingsBox = document.getElementById('settings');
if (settingsBox) {
  settingsBox.addEventListener('change', (e) => {
    const el = e.target;
    if (!el || !el.dataset) return;
    const checked = !!el.checked;
    const id = el.dataset.agent;
    if (id) {
      chrome.storage.local.get(['enabledAgents'], (res) => {
        const en = res.enabledAgents || {};
        en[id] = checked;
        chrome.storage.local.set({ enabledAgents: en }); // onChanged 会触发重绘
      });
      return;
    }
    const pref = el.dataset.pref;
    if (pref === 'autoRefresh' || pref === 'notifyLow' || pref === 'showHair' || pref === 'moveReminder') {
      chrome.storage.local.set({ [pref]: checked });
    }
  });
}
const gridEl = document.getElementById('grid');
if (gridEl && gridEl.addEventListener) {
  // 卡片里的 "打开页面 ↗"：在普通标签页打开该产品的额度页（顺便也就完成了一次抓取）
  gridEl.addEventListener('click', (e) => {
    let n = e.target;
    while (n && n !== e.currentTarget && !(n.dataset && n.dataset.open)) n = n.parentNode;
    const id = n && n.dataset && n.dataset.open;
    if (!id || !META[id]) return;
    e.preventDefault();
    chrome.tabs.create({ url: META[id].page });
  });
}
const langBtn = document.getElementById('lang');
if (langBtn) {
  langBtn.addEventListener('click', () => {
    setLang(currentLang() === 'zh' ? 'en' : 'zh', render);
  });
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes && changes.uiLang) applyStoredLang(changes.uiLang.newValue);
  render();
});
loadLang(render);
