# coding-agent-usage-tracking

A Chrome (Manifest V3) browser extension that shows your remaining usage for
**Claude Code, Codex, Grok Build and Cursor** at a glance — in one popup.

![The Coding Agents Usage popup showing quota, resets, and burn-rate for Claude Code, Codex, Grok, and Cursor](docs/dashboard.webp)

<sub>Example popup with sample data.</sub>

## Download

[![Download the extension (.zip)](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F%20Download-Chrome%20extension%20(.zip)-1a73e8?style=for-the-badge)](https://github.com/jjliu6/coding-agent-usage-tracking/releases/latest/download/coding-agents-usage.zip)

No GitHub account, no git, no build step — [download the latest release](https://github.com/jjliu6/coding-agent-usage-tracking/releases/latest/download/coding-agents-usage.zip),
unzip it, and load the folder in Chrome. See [Install](#install) below.

<sub>Want the newest unreleased code instead? Grab the
[source zip of `main`](https://github.com/jjliu6/coding-agent-usage-tracking/archive/refs/heads/main.zip) —
it installs the same way, just with a few extra development files in the folder.</sub>

## What it does

- One click shows the remaining weekly / short-term quota for all four agents, and when each one resets.
- Once it has a few hours of history, it estimates your burn rate and warns when you'll run out **before** the next reset. Each card also draws a 7-day sparkline of your remaining quota.
- The ⚙ button lets you pick which agents to track — unchecked ones are skipped by Refresh and hidden from the dashboard.
- If a refresh can't read a page (usually because you're signed out), the card says so and links straight to that product's usage page.
- No API and no account linking — it reads the numbers straight off each tool's own usage page that you're already logged into.
- Everything stays local in your browser (`chrome.storage.local`). Nothing is sent to any server.

## Install

1. **[Download the extension as a .zip](https://github.com/jjliu6/coding-agent-usage-tracking/releases/latest/download/coding-agents-usage.zip)**
   (or clone this repository, if you prefer git).
2. **Unzip** the file (double-click on macOS, right-click → **Extract All…** on Windows).
   You'll get a folder with `manifest.json` inside — keep it somewhere permanent
   (not the Downloads folder you might clean up later); Chrome loads the extension from this
   folder every time it starts.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (toggle in the top-right corner).
5. Click **Load unpacked** and select the unzipped folder (the one that contains `manifest.json`).
6. Click the toolbar icon. The dashboard opens in the **side panel** so it stays visible while Refresh scrapes.
7. Click **Refresh** (or open a product's usage page in a normal tab) to populate the data.
8. The dashboard defaults to **English**. Click **中文** / **EN** in the header to switch; the choice is stored locally (`uiLang`) and does not follow Chrome's UI language.

To update later: download the zip again, replace the folder's contents, then click the ↻ reload
button on the extension's card in `chrome://extensions`.

## Files

- `manifest.json` — extension manifest (Manifest V3)
- `agents.js` — shared registry of the four agents (names, colors, usage-page URLs)
- `background.js` — service worker that coordinates the "Refresh" flow
- `content.js` — content script that reads usage numbers from each product page
- `popup.html` / `popup.js` / `i18n.js` — the side-panel dashboard (English / 中文)
- `_locales/` — Chrome Store / `chrome://extensions` name and description
- `icons/` — extension icons

## Development

The extension is zero-dependency vanilla JS. The only tooling is dev-time
helpers for validating and packaging it (installed with `npm install`).

- `npm run validate` — check the manifest is valid MV3 and every referenced script parses.
- `npm run build` — package the extension into `dist/coding_agents_usage-<version>.zip`.
- `npm start` — launch Chrome with the extension loaded for interactive testing (uses `web-ext run -t chromium`).

### Releasing

Releases are automatic — just merge to `main`. The Release workflow
(`.github/workflows/release.yml`) runs on every push to `main` that touches the
extension (docs-only changes are skipped): it validates, tests, and builds the
zip with `npm run build`, then publishes it as a GitHub Release with a
stable-named asset `coding-agents-usage.zip` — which is what the Download button
at the top of this README points to.

Versioning is automatic too: if `manifest.json`'s current version is already
released, the workflow bumps the patch version and commits the bump back to
`main`. For a minor/major release, bump `version` in `manifest.json` and
`package.json` in your PR — that exact version is released when it lands. The
workflow can also be run manually from the Actions tab.

## Disclaimer

Unofficial and not affiliated with Anthropic, OpenAI, xAI, or Cursor. It only
reads usage numbers already shown on each product's own page.

---

Built by [Junjie Liu](https://www.linkedin.com/in/junjieliu/) at [Philosophie AI](https://philosophie.ai).
