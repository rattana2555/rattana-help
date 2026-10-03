// Builds docs/data/donations.json for the public "บริจาค" page from the donation tab of the order sheet.
// Only what the page needs leaves this script: never phone numbers, payment slips or full names.
//   · approved donations only (slip checked); pending ones are counted, not listed
//   · donor names partly hidden ("ออม" → "อ**")
//   · test orders are skipped
// The sheet id comes from the DONATIONS_SHEET_ID secret so the spreadsheet link is not published.
// Logs print counts only: workflow logs of a public repository are public.
//
//   DONATIONS_SHEET_ID=… node scripts/donations.mjs docs/data/donations.json
import { writeFileSync } from 'node:fs';

const ID = (process.env.DONATIONS_SHEET_ID || '').trim();
const SHEET = process.env.DONATIONS_SHEET || 'บริจาค';
const OUT = process.argv[2] || 'docs/data/donations.json';
if (!ID) { console.log('DONATIONS_SHEET_ID not set: skipping donations'); process.exit(0); }

// ── CSV ──
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
  return rows.filter(r => r.some(v => v.trim()));
}

async function fetchCsv() {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(ID)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET)}`;
  let last;
  for (let i = 1; i <= 4; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'rattana-help donations' } });
      const text = await res.text();
      if (res.ok && !/^\s*</.test(text)) return text;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, i * 4000));
  }
  throw last;
}

// ── helpers ──
const num = v => { const n = Number(String(v ?? '').replace(/[,\s฿]/g, '')); return Number.isFinite(n) ? n : 0; };
const graphemes = s => Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(s), x => x.segment);
// Keep about the first third of the name (at least one character), hide the rest with up to 3 stars
// Each word (first two words only) keeps about its first third: "สุรัตน์ รัตนไพบูลย์" → "สุรั** รัต***"
function maskWord(w) {
  const g = graphemes(w);
  const keep = Math.max(1, Math.ceil(g.length / 3));
  return g.slice(0, keep).join('') + '*'.repeat(Math.min(3, Math.max(1, g.length - keep)));
}
function mask(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'ผู้ไม่ประสงค์ออกนาม';
  return words.slice(0, 2).map(maskWord).join(' ');
}
function isoDate(v) {
  const s = String(v || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s); // dd/mm/yyyy (ค.ศ. or พ.ศ.)
  if (m) { let y = +m[3]; if (y > 2400) y -= 543; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = /^Date\((\d+),(\d+),(\d+)/.exec(s); // gviz Date(y,m0,d)
  if (m) return `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return null;
}
const APPROVED = /อนุมัติ|ยืนยัน|ตรวจแล้ว|ตรวจสอบแล้ว|สำเร็จ|ผ่าน|ได้รับ|approved/i;
const NOT_YET = /ไม่|รอ|ปฏิเสธ|ยกเลิก|reject|pending/i;
const approved = s => APPROVED.test(s || '') && !NOT_YET.test(s || '');

// ── build ──
const rows = parseCsv(await fetchCsv());
const head = rows.shift().map(h => h.trim());
const col = name => head.findIndex(h => h === name);
const C = {
  date: col('วัน'), time: col('เวลา'), order: col('orderId'), name: col('ชื่อร้าน'), kind: col('รูปแบบ'),
  item: col('ชื่อสินค้า'), qty: col('จำนวน'), unit: col('หน่วย'), amount: col('ยอดเงินรวม'), dest: col('ปลายทาง'), status: col('สถานะอนุมัติ'),
};
for (const k of ['date', 'order', 'name', 'item', 'qty', 'amount', 'status']) {
  if (C[k] < 0) throw new Error(`column missing: ${k}`);
}
const get = (r, k) => (C[k] >= 0 ? String(r[C[k]] ?? '').trim() : '');

const orders = new Map();
for (const r of rows) {
  const id = get(r, 'order');
  if (!id) continue;
  const test = /test/i.test(id) || /ทดสอบ/.test(get(r, 'name')) || /ทดสอบ/.test(get(r, 'dest'));
  if (test || /ยกเลิก/.test(get(r, 'kind'))) continue;
  let o = orders.get(id);
  if (!o) {
    o = { date: isoDate(get(r, 'date')), time: get(r, 'time').replace(':', '.'), donor: get(r, 'name'), status: get(r, 'status'), items: [], amount: 0 };
    orders.set(id, o);
  }
  if (!o.status) o.status = get(r, 'status');
  o.items.push({ name: get(r, 'item'), qty: num(get(r, 'qty')), unit: get(r, 'unit') });
  o.amount += num(get(r, 'amount'));
}

const list = [...orders.values()];
const ok = list.filter(o => approved(o.status));
const pend = list.filter(o => !approved(o.status) && !/ไม่|ปฏิเสธ|ยกเลิก|reject/i.test(o.status || ''));
const itemTotals = new Map();
for (const o of ok) for (const it of o.items) {
  const k = `${it.name}|${it.unit}`;
  itemTotals.set(k, { name: it.name, unit: it.unit, qty: (itemTotals.get(k)?.qty || 0) + it.qty });
}
const round2 = n => Math.round(n * 100) / 100;
const data = {
  total_amount: round2(ok.reduce((s, o) => s + o.amount, 0)),
  order_count: ok.length,
  donor_count: new Set(ok.map(o => o.donor.toLowerCase())).size,
  items: [...itemTotals.values()].sort((a, b) => b.qty - a.qty),
  donations: ok
    .sort((a, b) => `${b.date || ''} ${b.time}`.localeCompare(`${a.date || ''} ${a.time}`))
    .map(o => ({ date: o.date, time: o.time, name: mask(o.donor), items: o.items, amount: round2(o.amount) })),
  pending: { count: pend.length, amount: round2(pend.reduce((s, o) => s + o.amount, 0)) },
};
writeFileSync(OUT, JSON.stringify(data));
console.log(`donations: ${ok.length} approved, ${pend.length} pending → ${OUT}`);
