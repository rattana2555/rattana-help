// Builds docs/data/products.json for the admin item editor: product names and their units only
// (e.g. "น้ำดื่ม …" → ["ชิ้นx1(EA)", "แพ็คx12(CS)"]), so an item entered as 1 แพ็ค counts as 12 pieces.
// The product sheet also holds prices, stock and suppliers — none of that leaves this script.
// The sheet id comes from the PRODUCTS_SHEET_ID secret (optional PRODUCTS_GID for the tab).
// Logs print counts only: workflow logs of a public repository are public.
//
//   PRODUCTS_SHEET_ID=… node scripts/products.mjs docs/data/products.json
import { writeFileSync } from 'node:fs';

const ID = (process.env.PRODUCTS_SHEET_ID || '').trim();
const GID = (process.env.PRODUCTS_GID || '635140262').trim();
const OUT = process.argv[2] || 'docs/data/products.json';
if (!ID) { console.log('PRODUCTS_SHEET_ID not set: skipping products'); process.exit(0); }

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Only the name and the four unit columns are requested from Google (not the whole sheet)
const tq = 'select A, J, K, L, M where A is not null';
const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(ID)}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(GID)}&tq=${encodeURIComponent(tq)}`;
let text = null, last;
for (let i = 1; i <= 4 && text === null; i++) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'rattana-help products' } });
    const t = await res.text();
    if (res.ok && !/^\s*</.test(t)) text = t; else last = new Error(`HTTP ${res.status}`);
  } catch (e) { last = e; }
  if (text === null) await new Promise(r => setTimeout(r, i * 4000));
}
if (text === null) throw last;

const rows = parseCsv(text);
const head = rows.shift().map(h => h.trim().toUpperCase());
const iName = head.indexOf('PRODUCT NAME');
const iUnits = ['UNIT EA', 'UNIT PA', 'UNIT BP', 'UNIT CS'].map(h => head.indexOf(h)).filter(i => i >= 0);
if (iName < 0 || !iUnits.length) throw new Error('product sheet columns not found');

const byName = new Map();
for (const r of rows) {
  const name = String(r[iName] || '').trim().replace(/\s+/g, ' ');
  if (!name) continue;
  const units = byName.get(name) || new Set();
  for (const i of iUnits) {
    const u = String(r[i] || '').trim();
    if (/x\s*\d+/i.test(u)) units.add(u);
  }
  if (units.size) byName.set(name, units);
}
// [[name, "unit|unit"], …] sorted by name — small enough to load once in the admin page
const list = [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'th')).map(([n, u]) => [n, [...u].join('|')]);
writeFileSync(OUT, JSON.stringify({ v: 1, products: list }));
console.log(`products: ${list.length} names → ${OUT}`);
