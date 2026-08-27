// Render the Grok card with the SuperGrok fixture and check the remaining %.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parseCtx = {};
vm.runInNewContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), parseCtx, { filename: 'parse.js' });

const USER_SUPERGROK = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
33% used
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
const noisy = `Your disk is 9% used\n${USER_SUPERGROK}`;
const parsed = parseCtx.parseGrokUsage(noisy);
if (!parsed || parsed.used !== 33) {
  console.error('expected parseGrokUsage to return 33% used, got', parsed);
  process.exit(1);
}

const grok = {
  id: 'grok-build',
  name: 'Grok Build',
  color: '#B78CF0',
  scraped_at: Date.now(),
  limits: [{ label: 'Weekly (SuperGrok)', percent_left: 100 - parsed.used, resets_text: parsed.reset }],
  breakdown: parsed.breakdown,
};

const popupSrc = readFileSync(resolve(root, 'popup.js'), 'utf8');
const noop = () => {};
const popupCtx = {
  chrome: {
    storage: {
      local: { get: (_keys, cb) => cb && cb({ agents: {}, history: [] }) },
      onChanged: { addListener: noop },
    },
    runtime: { sendMessage: noop },
  },
  document: {
    getElementById: () => ({ addEventListener: noop, textContent: '', innerHTML: '' }),
  },
  setTimeout: noop,
};
vm.runInNewContext(popupSrc, popupCtx, { filename: 'popup.js' });

const html = popupCtx.card('grok-build', grok, []);
const problems = [];
if (!html.includes('>67%</b>')) problems.push('card should show 67% remaining, not the old 91%');
if (html.includes('>91%</b>')) problems.push('card still shows the buggy 91% remaining');
if (!html.includes('Chat 16%')) problems.push('missing Chat 16% in the breakdown legend');
if (!html.includes('Build 10%')) problems.push('missing Build 10% in the breakdown legend');
if (!html.includes('Auto 6%')) problems.push('missing Auto 6% in the breakdown legend');
if (!html.includes('Img 1%')) problems.push('missing Img 1% in the breakdown legend');
if (!html.includes('bar stacked')) problems.push('missing stacked usage bar');

if (problems.length) {
  console.error(html);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ok  Grok card shows 67% remaining with Chat/Build/Auto/Img slices');
console.log('\nPopup card test passed.');
