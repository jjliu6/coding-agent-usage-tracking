// Fixture tests for SuperGrok usage parsing (no browser required).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.runInNewContext(readFileSync(resolve(root, 'parse.js'), 'utf8'), ctx, { filename: 'parse.js' });
const { parseGrokUsage } = ctx;
if (typeof parseGrokUsage !== 'function') {
  console.error('parseGrokUsage was not loaded from parse.js');
  process.exit(1);
}

const USER_SUPERGROK = `
Settings
General
Account
Appearance
Behavior
Grok
Customize
Payments
Billing
Usage
Data & Information
Data Controls

Weekly SuperGrok Limit
Resets August 28, 2026 at 2:20 AM
Total Usage
33% used
Chat
16%
App Builder
10%
Automations
6%
Imagine
1%
Extra Usage Credits
$0.00
Buy Credits
Auto Top-Up
Automatically top-up when your credit balance runs low
Set up
`;

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`fail  ${name}\n  got  ${g}\n  want ${w}`);
}

function leftover(used) {
  return 100 - used;
}

{
  const p = parseGrokUsage(USER_SUPERGROK);
  check('user screenshot: used %', p && p.used, 33);
  check('user screenshot: remaining %', p && leftover(p.used), 67);
  check('user screenshot: reset', p && p.reset, 'August 28, 2026 at 2:20 AM');
  check('user screenshot: category sum', p && p.breakdown.reduce((s, x) => s + x.percent, 0), 33);
  check('user screenshot: App Builder slice', p && p.breakdown.find((x) => x.name === 'App Builder')?.percent, 10);
  check('user screenshot: category order', p && p.breakdown.map((x) => x.name), ['Chat', 'App Builder', 'Automations', 'Imagine']);
}

{
  const noisy = `Grok\nYour disk is 9% used\ncontinue the task\n${USER_SUPERGROK}`;
  const p = parseGrokUsage(noisy);
  check('ignores earlier "9% used" on grok.com (the 91%-left bug)', p && leftover(p.used), 67);
  check('noisy page still reports 33% used', p && p.used, 33);
}

{
  const oldFirstMatch = (T) => {
    const m = T.match(/(\d+)\s*%\s*used/i);
    return m ? parseInt(m[1], 10) : null;
  };
  const noisy = `chat history\n9% used\n${USER_SUPERGROK}`;
  check('old whole-page regex would have returned 9', oldFirstMatch(noisy), 9);
}

{
  const aria = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
App Builder 10% used
Automations 6% used
Chat 16% used
Imagine 1% used
Extra Usage Credits
`;
  const p = parseGrokUsage(aria);
  check('category aria-labels summing to total', p && p.used, 33);
  check('does not treat App Builder 10% as the weekly total', p && leftover(p.used), 67);
}

{
  const splitDigits = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
3
3
%
used
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
  const p = parseGrokUsage(splitDigits);
  check('split "33% used" digits still resolve via category sum', p && p.used, 33);
}

{
  const noTotal = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Chat 16%
App Builder 10%
Automations 6%
Imagine 1%
Extra Usage Credits
`;
  const p = parseGrokUsage(noTotal);
  check('fallback to category sum when Total Usage is not in the text', p && p.used, 33);
}

{
  const empty = `
Weekly SuperGrok Limit SuperGrok
Resets August 28, 2026 at 2:20 AM
Total Usage
0% used
Extra Usage Credits
$0.00
`;
  const p = parseGrokUsage(empty);
  check('0% used is valid (100% remaining)', p && leftover(p.used), 100);
}

{
  check('not the usage view', parseGrokUsage('just chatting with grok about code'), null);
}

if (failed) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll parse tests passed.');
