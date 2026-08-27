// Pure text parsers for usage pages (no DOM). Loaded before content.js.

function grokUsageSection(T) {
  const start = T.search(/Weekly SuperGrok Limit|Total Usage/i);
  if (start < 0) return T;
  const rest = T.slice(start);
  const endRel = rest.search(/Extra Usage Credits|Auto Top-Up/i);
  const end = endRel < 0 ? Math.min(rest.length, 3000) : Math.min(rest.length, endRel + 40);
  return rest.slice(0, end);
}

function grokCategories(section) {
  const names = ['Chat', 'App Builder', 'Automations', 'Imagine', 'Voice', 'API'];
  const bd = [];
  for (const nm of names) {
    const re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(\\d+)\\s*%', 'i');
    const m = section.match(re);
    if (m) bd.push({ name: nm, percent: parseInt(m[1], 10) });
  }
  return bd;
}

function grokReset(T) {
  const m = T.match(/Resets\s+([A-Z][a-z]+\s+\d{1,2},?\s*\d{4}[^\n]*?[AP]M)/i);
  return m ? m[1].trim() : null;
}

function grokTotalUsed(section, catSum, catCount) {
  let used = null;
  const total = section.match(/Total Usage[\s\S]{0,200}?(\d+)\s*%/i);
  if (total) used = parseInt(total[1], 10);
  if (used == null) {
    const m = section.match(/(\d+)\s*%\s*used/i);
    if (m) used = parseInt(m[1], 10);
  }
  // Category slices on this page always add up to the weekly total. Prefer
  // that sum when the first "N% used" is a red herring or a mid-animation frame.
  if (catCount >= 2 && catSum >= 0 && catSum <= 100) {
    if (used == null || used < catSum - 1) used = catSum;
  }
  if (used == null || used < 0 || used > 100) return null;
  return used;
}

function parseGrokUsage(T) {
  if (!T || !/SuperGrok/i.test(T)) return null;
  const section = grokUsageSection(T);
  const breakdown = grokCategories(section);
  const catSum = breakdown.reduce((s, x) => s + x.percent, 0);
  const used = grokTotalUsed(section, catSum, breakdown.length);
  if (used == null) return null;
  return {
    used,
    reset: grokReset(section) || grokReset(T),
    breakdown,
  };
}
