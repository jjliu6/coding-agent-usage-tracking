# coding-agent-usage-tracking

A Chrome (Manifest V3) browser extension that shows remaining usage for Claude
Code, Codex, Grok Build and Cursor at a glance.

## Layout

- `manifest.json` — MV3 extension manifest
- `background.js` — service worker that coordinates the "Refresh" flow
- `content.js` — content script that scrapes usage numbers from each product page
- `popup.html` / `popup.js` — the toolbar popup UI
- `icons/` — extension icons

## Development

The extension is zero-dependency vanilla JS. The only tooling is dev-time
helpers for validating and packaging it (installed with `npm install`).

- `npm run validate` — check the manifest is valid MV3 and every referenced
  script parses.
- `npm run build` — package the extension into `dist/coding_agents_usage-<version>.zip`.
- `npm start` — launch Chrome with the extension loaded for interactive testing
  (uses `web-ext run -t chromium`).

### Load the extension manually

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's root directory.
