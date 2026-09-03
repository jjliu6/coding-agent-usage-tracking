// 所有产品的统一注册表，background（importScripts）和 popup（<script>）共用。
// - page:   给用户手动打开的额度页
// - scrape: Refresh 时后台打开的抓取页（带 cawrefresh 标记，抓完自动关）
// - foreground: 重页面（后台标签页会被浏览器冻结），刷新时需要短暂切到前台
const AGENTS = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    color: '#D97757',
    page: 'https://claude.ai/new#settings/usage',
    scrape: ['https://claude.ai/new?cawrefresh=1#settings/usage'],
    foreground: false,
  },
  {
    id: 'codex',
    name: 'Codex',
    color: '#5CD6B3',
    page: 'https://chatgpt.com/codex/cloud/settings/analytics#usage',
    scrape: ['https://chatgpt.com/codex/cloud/settings/analytics?cawrefresh=1#usage'],
    foreground: false,
  },
  {
    id: 'grok-build',
    name: 'Grok',
    color: '#B78CF0',
    page: 'https://grok.com/?_s=usage',
    scrape: ['https://grok.com/?_s=usage&cawrefresh=1'],
    foreground: true,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    color: '#6E9BF5',
    page: 'https://cursor.com/dashboard/usage',
    scrape: [
      'https://cursor.com/dashboard/usage?cawrefresh=1',
      'https://cursor.com/dashboard/spending?cawrefresh=1',
    ],
    foreground: true,
  },
  {
    // Grok Bot 的额度和 Cursor 在同一个 spending 页上（"Grok Bot › Weekly usage"），
    // 抓取 URL 与 Cursor 重复，background 会去重、只开一次页
    id: 'grok-bot',
    name: 'Grok Bot',
    color: '#F49AC1',
    page: 'https://cursor.com/dashboard/spending',
    scrape: ['https://cursor.com/dashboard/spending?cawrefresh=1'],
    foreground: true,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    color: '#3B78E7',
    page: 'https://gemini.google.com/usage',
    scrape: ['https://gemini.google.com/usage?cawrefresh=1'],
    foreground: false,
  },
];
