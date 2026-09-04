// Renders the landing page into a temp dir and checks the result is complete:
// every language page exists, nothing is left untranslated or unfilled, the
// SEO tags point at the right URLs, and no asset path is relative (the pages
// live one folder deep, so "icon.png" would 404 while "/icon.png" works).

import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from './build-pages.mjs';

const out = mkdtempSync(join(tmpdir(), 'pages-'));
try {
  await build(out);
  const page = (rel) => readFileSync(join(out, rel), 'utf8');
  const root = page('index.html');
  const en = page('en/index.html');
  const zh = page('zh/index.html');

  // Assets copied, build inputs left out.
  assert.ok(existsSync(join(out, 'icon-128.png')), 'assets are copied to the site root');
  assert.ok(existsSync(join(out, 'og-image.png')), 'social card image is copied to the site root');
  const og = readFileSync(join(out, 'og-image.png'));
  assert.equal(og.readUInt32BE(16), 1200, 'og-image.png is 1200px wide (X/Facebook minimum for a large card)');
  assert.equal(og.readUInt32BE(20), 630, 'og-image.png is 630px tall');
  assert.ok(og.length < 5 * 1024 * 1024, 'og-image.png is under X\'s 5 MB cap');
  assert.ok(!existsSync(join(out, 'i18n')), 'translation source is not deployed');

  for (const [name, html] of [['/', root], ['/en/', en], ['/zh/', zh]]) {
    assert.ok(!/\{\{\w+\}\}/.test(html), `${name}: every {{placeholder}} filled`);
    assert.ok(!html.includes('build:root-redirect'), `${name}: build marker removed`);
    assert.ok(!html.includes('TEMPLATE'), `${name}: template banner removed`);
    assert.ok(!/\sdata-i18n/.test(html), `${name}: data-i18n attributes stripped`);
    assert.ok(!/<html[^>]*>[\s\S]*?\bsrc="[^/h]/.test(html), `${name}: no relative src= paths`);
    assert.ok(!/href="[a-z0-9-]+\.(png|json|webm)"/.test(html), `${name}: no relative href= paths`);
    assert.ok(html.includes('hreflang="en" href="https://token-police.philosophie.ai/en/"'), `${name}: hreflang en`);
    assert.ok(html.includes('hreflang="zh-CN" href="https://token-police.philosophie.ai/zh/"'), `${name}: hreflang zh`);
    assert.ok(html.includes('hreflang="x-default"'), `${name}: hreflang x-default`);
    assert.ok(html.includes("fetch('/version.json'"), `${name}: version.json fetched from site root`);
    assert.ok(html.includes('property="og:image" content="https://token-police.philosophie.ai/og-image.png"'), `${name}: og:image is the 1200x630 card, not the 128px icon`);
    assert.ok(html.includes('name="twitter:card" content="summary_large_image"'), `${name}: twitter:card so X renders a large preview`);
    assert.ok(html.includes('name="twitter:image" content="https://token-police.philosophie.ai/og-image.png"'), `${name}: twitter:image matches og:image`);
    assert.ok(!html.includes('Coding Agents Usage'), `${name}: old brand name is gone`);
    assert.ok(!html.includes('coding-agent-usage-tracking'), `${name}: old GitHub repo path is gone`);
    assert.ok(html.includes('github.com/jjliu6/token-police'), `${name}: GitHub links use the renamed repo`);
  }

  // English pages.
  assert.ok(en.includes('<html lang="en">'));
  assert.ok(en.includes('<link rel="canonical" href="https://token-police.philosophie.ai/en/">'));
  assert.ok(en.includes('<title>Token Police —'));
  assert.ok(en.includes('href="/zh/" hreflang="zh-CN" lang="zh-CN" title="切换到中文">中文</a>'), 'en page links to /zh/');
  assert.ok(en.includes('src="/shot-panel-en.png"') && en.includes('src="/install-demo-en.webm"'), 'en assets');
  assert.ok(!en.includes('location.replace'), '/en/ has no redirect script');

  // Root = English + redirect script.
  assert.ok(root.includes("location.replace('/zh/'"), 'root redirects Chinese readers');
  assert.ok(root.includes("history.replaceState(null, '', '/en/'"), 'root rewrites the URL to /en/');
  assert.equal(root.replace(/<script>\n\/\* Root URL only[\s\S]*?<\/script>\n/, ''), en, 'root is otherwise identical to /en/');
  assert.ok(root.indexOf('location.replace') < root.indexOf('<style>'), 'redirect runs before the stylesheet');

  // Chinese page.
  assert.ok(zh.includes('<html lang="zh-CN">'));
  assert.ok(zh.includes('<link rel="canonical" href="https://token-police.philosophie.ai/zh/">'));
  assert.ok(zh.includes('<title>Token Police 额度'));
  assert.ok(zh.includes('<meta name="description" content="免费开源的 Chrome 扩展'), 'meta description translated');
  assert.ok(zh.includes('<meta property="og:locale" content="zh_CN">'));
  assert.ok(zh.includes('href="/en/" hreflang="en" lang="en" title="Switch to English">EN</a>'), 'zh page links to /en/');
  assert.ok(zh.includes('src="/shot-panel-zh.png"') && zh.includes('src="/install-demo-zh.webm"'), 'zh assets');
  assert.ok(zh.includes('<h2>准备好了？完全免费。</h2>'), 'body text translated');
  assert.ok(zh.includes('<span class="hl">还剩多少</span>'), 'inline HTML translations kept their tags');
  assert.ok(!zh.includes('Ready? It\'s free.'), 'no English body text left on /zh/');

  // English body text is untouched on /en/ (spot checks: first and last translatable strings).
  assert.ok(en.includes('<span>Token Police</span>'), 'first English string kept');
  assert.ok(en.includes("<p>Unofficial. Not affiliated with Anthropic, OpenAI, xAI, Cursor or Google."), 'last English string kept');

  console.log('pages-test: OK');
} finally {
  rmSync(out, { recursive: true, force: true });
}
