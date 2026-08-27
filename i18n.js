// UI strings. Default English; user can switch to Chinese and it is stored.
let uiLang = 'en';

function currentLang() {
  return uiLang === 'zh' ? 'zh' : 'en';
}

const I18N = {
  en: {
    brand: 'CODING AGENTS',
    legend: 'number = remaining',
    refresh: 'Refresh',
    fetching: 'Fetching…',
    left: 'left',
    pctLeft: '{n}% left',
    thisPeriod: 'This period',
    empty: 'No data yet — click "Refresh", or open its usage page in a normal tab.',
    firstTime: 'First time? Click "Refresh" to fetch data.',
    updated: 'Updated {time}',
    fetchingHint: 'Fetching… tabs may flash open and close. Results stay in this side panel.',
    justNow: 'just now',
    minsAgo: '{n}m ago',
    hoursAgo: '{n}h ago',
    daysAgo: '{n}d ago',
    resettingSoon: 'resetting soon',
    resetInDays: 'reset in {n}d',
    resetInHours: 'reset in {n}h',
    resetInMins: 'reset in {n}m',
    burnCollecting: 'Burn rate: collecting… (need more data)',
    burnBarely: 'Barely used lately',
    burnTillReset: 'Burning ~{n}%/day · lasts till reset',
    burnEmptyHours: '~{n}h to empty',
    burnEmptyDays: '~{n}d to empty',
    burnBefore: ' (before reset!)',
    burnLine: 'Burning ~{n}%/day · {eta}',
    credits: 'credits {n}',
    tokens: '{n} tokens',
    weeklyAll: 'Weekly (All models)',
    session5h: 'Session (5h)',
    weekly: 'Weekly',
    fiveHour: '5-hour limit',
    weeklyGrok: 'Weekly (SuperGrok)',
    cursorModels: 'Cursor Models',
    otherModels: 'Other Models',
    chat: 'Chat',
    build: 'Build',
    auto: 'Auto',
    imagine: 'Img',
    voice: 'Voice',
    api: 'API',
  },
  zh: {
    brand: 'CODING AGENTS 额度',
    legend: '数字为剩余额度',
    refresh: '刷新',
    fetching: '刷新中…',
    left: '剩余',
    pctLeft: '剩 {n}%',
    thisPeriod: '本周期',
    empty: '暂无数据 — 点「刷新」，或在普通标签页打开对应额度页面。',
    firstTime: '第一次用？点「刷新」拉取数据。',
    updated: '{time} 更新',
    fetchingHint: '正在抓取… 标签页会闪一下自动开关，结果会留在这个侧边栏里。',
    justNow: '刚刚',
    minsAgo: '{n} 分钟前',
    hoursAgo: '{n} 小时前',
    daysAgo: '{n} 天前',
    resettingSoon: '即将重置',
    resetInDays: '还 {n} 天重置',
    resetInHours: '还 {n} 小时重置',
    resetInMins: '还 {n} 分钟重置',
    burnCollecting: '消耗速度：记录中…（需更多数据）',
    burnBarely: '近期几乎没消耗',
    burnTillReset: '消耗 ~{n}%/天 · 能撑到重置',
    burnEmptyHours: '约 {n} 小时后见底',
    burnEmptyDays: '约 {n} 天后见底',
    burnBefore: ' (早于重置！)',
    burnLine: '消耗 ~{n}%/天 · {eta}',
    credits: '积分 {n}',
    tokens: '{n} tokens',
    weeklyAll: 'Weekly 额度 (All models)',
    session5h: '当前会话 (5h)',
    weekly: 'Weekly 额度',
    fiveHour: '5 小时额度',
    weeklyGrok: 'Weekly 额度 (SuperGrok)',
    cursorModels: 'Cursor Models',
    otherModels: 'Other Models',
    chat: '聊天',
    build: '构建',
    auto: '自动',
    imagine: '绘图',
    voice: '语音',
    api: 'API',
  },
};

function t(key, vars) {
  const pack = I18N[currentLang()] || I18N.en;
  let s = pack[key] || I18N.en[key] || key;
  if (vars) {
    Object.keys(vars).forEach((k) => {
      s = s.split('{' + k + '}').join(vars[k]);
    });
  }
  return s;
}

function applyI18n() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = currentLang() === 'zh' ? 'zh' : 'en';
  const brand = document.getElementById('brand-name');
  if (brand) brand.textContent = t('brand');
  const legend = document.getElementById('legend');
  if (legend) legend.textContent = t('legend');
  const btn = document.getElementById('refresh');
  if (btn && !btn.disabled) btn.textContent = t('refresh');
  const langBtn = document.getElementById('lang');
  if (langBtn) {
    langBtn.textContent = currentLang() === 'zh' ? 'EN' : '中文';
    langBtn.title = currentLang() === 'zh' ? 'Switch to English' : '切换到中文';
  }
}

function applyStoredLang(lang) {
  uiLang = lang === 'zh' ? 'zh' : 'en';
  applyI18n();
}

function loadLang(done) {
  const finish = () => { if (typeof done === 'function') done(); };
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) {
    applyStoredLang('en');
    finish();
    return;
  }
  chrome.storage.local.get(['uiLang'], (res) => {
    applyStoredLang(res && res.uiLang);
    finish();
  });
}

function setLang(lang, done) {
  applyStoredLang(lang);
  const finish = () => { if (typeof done === 'function') done(); };
  if (chrome.storage && chrome.storage.local && chrome.storage.local.set) {
    chrome.storage.local.set({ uiLang }, finish);
  } else {
    finish();
  }
}
