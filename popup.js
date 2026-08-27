const ORDER = ['claude-code', 'codex', 'grok-build', 'cursor'];
const META = {
  'claude-code': { name: 'Claude Code', color: '#D97757' },
  'codex': { name: 'Codex', color: '#5CD6B3' },
  'grok-build': { name: 'Grok Build', color: '#B78CF0' },
  'cursor': { name: 'Cursor', color: '#6E9BF5' },
};
const REFRESH_URLS = [
  'https://claude.ai/new?cawrefresh=1#settings/usage',
  'https://chatgpt.com/codex/cloud/settings/analytics?cawrefresh=1#usage',
  'https://grok.com/?_s=usage&cawrefresh=1',
  'https://cursor.com/dashboard/usage?cawrefresh=1',
  'https://cursor.com/dashboard/spending?cawrefresh=1',
];

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
  return key ? t(key) : s;
}

function bdShort(name) {
  const key = BD_SHORT_KEY[name];
  return key ? t(key) : name;
}

function breakdownBar(bd) {
  if (!bd || !bd.length) return '';
  const segs = bd.map((x) => {
    const c = BD_COLOR[x.name] || '#8a92a0';
    return `<i title="${x.name} ${x.percent}%" style="width:${x.percent}%;background:${c}"></i>`;
  }).join('');
  const legend = bd.map((x) => `${bdShort(x.name)} ${x.percent}%`).join(' · ');
  return `<div class="barwrap"><div class="t"><span>${legend}</span></div>
    <div class="bar stacked">${segs}</div></div>`;
}

function ring(pct, color) {
  const R = 28, C = 2 * Math.PI * R, off = C * (1 - (pct || 0) / 100);
  return `<svg width="66" height="66" viewBox="0 0 66 66">
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="var(--track)" stroke-width="6"/>
    <circle cx="33" cy="33" r="${R}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
      stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 33 33)"/>
  </svg>`;
}

function card(id, a, hist) {
  const meta = META[id];
  if (!a) {
    return `<div class="card">
      <div class="chead"><div class="name">${logo(id, meta.color)}${meta.name}</div></div>
      <div class="empty">${t('empty')}</div>
    </div>`;
  }
  const L = a.limits || [], p0 = L[0], p1 = L[1];
  const pct = p0 ? p0.percent_left : null;
  const now = Date.now();
  const resetDate = p0 ? parseReset(p0.resets_text, now) : null;
  const resetLabel = untilText(resetDate, now) || (p0 && p0.resets_text) || '';
  const est = pct != null ? verdict(hist, resetDate, now) : null;
  const foot = [];
  if (a.tokens && a.tokens.total != null) foot.push(t('tokens', { n: fmtTok(a.tokens.total) }));
  if (a.credits && a.credits !== '0' && a.credits !== '$0.00') foot.push(t('credits', { n: a.credits }));
  else if (a.plan) foot.push(a.plan);

  const center = pct != null
    ? `<b style="color:${health(pct)}">${pct}%</b><span>${t('left')}</span>`
    : `<b style="font-size:13px">${fmtTok(a.tokens && a.tokens.total)}</b><span>TOKENS</span>`;
  const sec = p1
    ? `<div class="barwrap"><div class="t"><span>${limLabel(p1.label)}</span><span>${t('pctLeft', { n: p1.percent_left })}</span></div>
    <div class="bar"><i style="width:${p1.percent_left}%;background:${meta.color}"></i></div></div>`
    : breakdownBar(a.breakdown);

  let burn = '';
  if (est) burn = `<div style="font-size:10.5px;margin-top:9px;color:${est.color}">🔥 ${est.text}</div>`;

  return `<div class="card">
    <div class="chead">
      <div class="name">${logo(id, meta.color)}${a.name || meta.name}</div>
      ${a.plan ? `<span class="plan">${a.plan}</span>` : ''}
    </div>
    <div class="mid">
      <div class="ring">${ring(pct == null ? 0 : pct, meta.color)}<div class="c">${center}</div></div>
      <div class="stats">
        <div class="l0"><span>${p0 ? limLabel(p0.label) : (a.tokens ? t('thisPeriod') : '')}</span>${resetLabel ? `<span class="r">${resetLabel}</span>` : ''}</div>
        ${sec}
      </div>
    </div>
    ${burn}
    <div class="foot"><span>${foot.filter(Boolean).join(' · ')}</span><span>${ago(a.scraped_at)}</span></div>
  </div>`;
}

function render() {
  chrome.storage.local.get(['agents', 'history', 'refresh'], (res) => {
    const map = res.agents || {};
    const hist = res.history || [];
    const byId = {};
    hist.forEach((e) => { (byId[e.id] = byId[e.id] || []).push(e); });
    document.getElementById('grid').innerHTML =
      ORDER.map((id) => card(id, map[id], byId[id])).join('');
    const any = ORDER.some((id) => map[id]);
    const rf = res.refresh || {};
    const btn = document.getElementById('refresh');
    // 顶部：最后一次Refresh时间（取所有产品里最新的一次）
    let latest = 0;
    ORDER.forEach((id) => { if (map[id] && map[id].scraped_at > latest) latest = map[id].scraped_at; });
    document.getElementById('upd').textContent = latest
      ? t('updated', { time: new Date(latest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })
      : '';
    if (rf.running) {
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
