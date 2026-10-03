'use strict';
// RATTANA HELP — database layer (SQLite via Node's built-in node:sqlite, no npm deps)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
// On a host with a persistent disk, point these at the mounted volume (see DEPLOY.md)
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'rattana-help.db');

const STATUSES = ['preparing', 'in_transit', 'delivered'];
const PHOTO_STAGES = ['collect', 'prepare', 'transit', 'deliver', 'after'];
const TIMELINE_STEPS = ['support', 'collect', 'prepare', 'transit', 'deliver'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS provinces (
  id        INTEGER PRIMARY KEY,
  name_th   TEXT NOT NULL UNIQUE,
  region    TEXT
);
CREATE TABLE IF NOT EXISTS districts (
  id          INTEGER PRIMARY KEY,
  province_id INTEGER NOT NULL REFERENCES provinces(id) ON DELETE CASCADE,
  name_th     TEXT NOT NULL,
  UNIQUE (province_id, name_th)
);
CREATE TABLE IF NOT EXISTS subdistricts (
  id          INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name_th     TEXT NOT NULL,
  UNIQUE (district_id, name_th)
);
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'super' CHECK (role IN ('super','field')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS relief_projects (
  id           INTEGER PRIMARY KEY,
  round_no     TEXT NOT NULL,
  name         TEXT NOT NULL,
  summary      TEXT,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','in_transit','delivered')),
  start_date   TEXT,
  end_date     TEXT,
  supporters   TEXT,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS relief_locations (
  id             INTEGER PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES relief_projects(id) ON DELETE CASCADE,
  code           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  province_id    INTEGER REFERENCES provinces(id),
  district_id    INTEGER REFERENCES districts(id),
  subdistrict_id INTEGER REFERENCES subdistricts(id),
  village        TEXT,
  lat            REAL,
  lng            REAL,
  delivery_date  TEXT,
  status         TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','in_transit','delivered')),
  description    TEXT,
  beneficiaries  INTEGER NOT NULL DEFAULT 0,
  households     INTEGER NOT NULL DEFAULT 0,
  supporters     TEXT,
  cover_photo_id INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_loc_project ON relief_locations(project_id);
CREATE INDEX IF NOT EXISTS idx_loc_province ON relief_locations(province_id);
CREATE TABLE IF NOT EXISTS relief_items (
  id          INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES relief_locations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    REAL NOT NULL DEFAULT 0,
  unit        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_loc ON relief_items(location_id);
CREATE TABLE IF NOT EXISTS relief_photos (
  id          INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES relief_locations(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL DEFAULT 'deliver' CHECK (stage IN ('collect','prepare','transit','deliver','after')),
  file_path   TEXT NOT NULL,
  thumb_path  TEXT,
  caption     TEXT,
  taken_date  TEXT,
  width       INTEGER,
  height      INTEGER,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_loc ON relief_photos(location_id);
CREATE TABLE IF NOT EXISTS relief_updates (
  id          INTEGER PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES relief_locations(id) ON DELETE CASCADE,
  step        TEXT NOT NULL CHECK (step IN ('support','collect','prepare','transit','deliver')),
  update_date TEXT,
  note        TEXT,
  photo_id    INTEGER REFERENCES relief_photos(id) ON DELETE SET NULL,
  UNIQUE (location_id, step)
);
`;

// All 77 provinces of Thailand
const PROVINCES = {
  'ภาคเหนือ': ['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์'],
  'ภาคตะวันออกเฉียงเหนือ': ['กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี'],
  'ภาคกลาง': ['กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สระบุรี', 'อ่างทอง', 'อุทัยธานี'],
  'ภาคตะวันออก': ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'],
  'ภาคตะวันตก': ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'],
  'ภาคใต้': ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ระนอง', 'สตูล', 'สงขลา', 'สุราษฎร์ธานี', 'ยะลา'],
};

// ── Password hashing (scrypt) ──
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [algo, saltHex, hashHex] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

// Add columns introduced after v1.0 to databases created earlier
function migrate(db) {
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  if (!cols('admins').includes('role')) db.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'super'");
  if (!cols('relief_photos').includes('uploaded_by')) db.exec('ALTER TABLE relief_photos ADD COLUMN uploaded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL');
}

function openDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

function seedProvinces(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM provinces').get().n;
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO provinces (name_th, region) VALUES (?, ?)');
  tx(db, () => {
    for (const [region, list] of Object.entries(PROVINCES)) for (const p of list) ins.run(p, region);
  });
}

// First admin: username "admin", password from ADMIN_PASSWORD or a random one written to data/ADMIN_CREDENTIALS.txt
function ensureAdmin(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM admins').get().n;
  if (n > 0) return null;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO admins (username, password_hash, display_name) VALUES (?, ?, ?)')
    .run('admin', hashPassword(password), 'ทีมรัตนไพบูลย์');
  const file = path.join(DATA_DIR, 'ADMIN_CREDENTIALS.txt');
  if (!process.env.ADMIN_PASSWORD) {
    fs.writeFileSync(file,
      `RATTANA HELP — บัญชีผู้ดูแลระบบเริ่มต้น\n\nusername: admin\npassword: ${password}\n\n` +
      `กรุณาเข้าสู่ระบบที่ /admin แล้วเปลี่ยนรหัสผ่านทันที จากนั้นลบไฟล์นี้\n`, 'utf8');
  }
  return file;
}

// ── Demo data (clearly labelled "ข้อมูลตัวอย่าง") ──
const STAGE_TH = { collect: 'รวบรวมสิ่งของ', prepare: 'จัดเตรียมสิ่งของ', transit: 'ระหว่างเดินทาง', deliver: 'ส่งมอบ', after: 'หลังการช่วยเหลือ' };

function demoSvg(stage, label, seed) {
  const [c1, c2] = [['#5DB3F7', '#1C2E86'], ['#2C96EE', '#132063'], ['#7CC4FA', '#2940A8'], ['#4AA8F2', '#1A2A78'], ['#9DD0FF', '#2940A8']][seed % 5];
  const art = {
    collect: `<g fill="#F9A602"><rect x="470" y="330" width="120" height="100" rx="6"/><rect x="600" y="330" width="120" height="100" rx="6" opacity=".8"/><rect x="535" y="225" width="120" height="100" rx="6" opacity=".9"/></g><g stroke="#132063" stroke-width="4" opacity=".35"><path d="M470 380h120M600 380h120M535 275h120"/></g>`,
    prepare: `<g fill="#F9A602"><rect x="440" y="300" width="320" height="130" rx="10"/></g><g fill="#fff" opacity=".9"><circle cx="520" cy="270" r="26"/><circle cx="600" cy="262" r="26"/><circle cx="680" cy="270" r="26"/></g><path d="M440 350h320" stroke="#132063" stroke-width="5" opacity=".3"/>`,
    transit: `<g fill="#F9A602"><rect x="420" y="270" width="250" height="140" rx="10"/><path d="M670 310h80l50 50v50H670z"/></g><g fill="#fff"><circle cx="480" cy="420" r="30"/><circle cx="740" cy="420" r="30"/></g><g fill="#132063"><circle cx="480" cy="420" r="12"/><circle cx="740" cy="420" r="12"/></g>`,
    deliver: `<path d="M600 430c-90-60-150-110-150-170 0-45 35-75 75-75 30 0 55 18 75 45 20-27 45-45 75-45 40 0 75 30 75 75 0 60-60 110-150 170z" fill="#F9A602"/><path d="M560 300l30 30 60-60" stroke="#132063" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    after: `<circle cx="720" cy="230" r="50" fill="#F9A602"/><path d="M450 430V320l100-80 100 80v110z" fill="#fff" opacity=".9"/><rect x="530" y="360" width="40" height="70" fill="#132063" opacity=".5"/>`,
  }[stage];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="1200" height="800" fill="url(#g)"/>
<g opacity=".08" fill="#fff"><circle cx="160" cy="680" r="260"/><circle cx="1080" cy="120" r="200"/></g>
<path d="M0 560c150-40 300 40 450 0s300-40 450 0 300 40 300 0v240H0z" fill="#fff" opacity=".06"/>
${art}
<text x="600" y="560" text-anchor="middle" font-family="Noto Sans Thai, Tahoma, sans-serif" font-size="44" font-weight="700" fill="#fff">${STAGE_TH[stage]}</text>
<text x="600" y="612" text-anchor="middle" font-family="Noto Sans Thai, Tahoma, sans-serif" font-size="28" fill="#F9A602">${label}</text>
<text x="600" y="740" text-anchor="middle" font-family="Noto Sans Thai, Tahoma, sans-serif" font-size="24" fill="#fff" opacity=".55">ภาพตัวอย่าง — แทนที่ด้วยภาพถ่ายจริงในหน้า Admin</text>
</svg>`;
}

function seedDemo(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM relief_projects').get().n;
  if (n > 0) return false;
  const demoDir = path.join(UPLOAD_DIR, 'demo');
  fs.mkdirSync(demoDir, { recursive: true });

  const provId = name => db.prepare('SELECT id FROM provinces WHERE name_th = ?').get(name).id;
  const distId = (pid, name) => {
    db.prepare('INSERT OR IGNORE INTO districts (province_id, name_th) VALUES (?, ?)').run(pid, name);
    return db.prepare('SELECT id FROM districts WHERE province_id = ? AND name_th = ?').get(pid, name).id;
  };
  const subId = (did, name) => {
    db.prepare('INSERT OR IGNORE INTO subdistricts (district_id, name_th) VALUES (?, ?)').run(did, name);
    return db.prepare('SELECT id FROM subdistricts WHERE district_id = ? AND name_th = ?').get(did, name).id;
  };

  const projects = [
    {
      round_no: '001', name: 'ส่งต่อน้ำใจ สู้ภัยน้ำท่วม จังหวัดสุพรรณบุรี', status: 'delivered',
      start_date: '2026-09-08', end_date: '2026-09-16',
      summary: 'ส่งมอบน้ำดื่ม ข้าวสาร และอาหารแห้งให้ครัวเรือนริมแม่น้ำท่าจีน (ข้อมูลตัวอย่าง)',
      description: 'รอบการช่วยเหลือแรกของโครงการ ทีมรัตนไพบูลย์ร่วมกับผู้สนับสนุนรวบรวมสินค้าจำเป็นจากการสั่งซื้อของผู้ร่วมโครงการ และนำส่งถึงพื้นที่ที่ได้รับผลกระทบจากน้ำล้นตลิ่งแม่น้ำท่าจีน\n\n(ข้อมูลตัวอย่างสำหรับทดสอบระบบ — ลบหรือแก้ไขได้ในหน้า Admin)',
      supporters: 'ผู้ร่วมสั่งซื้อสินค้าผ่านช่องทางรัตนไพบูลย์, ทีมงานคลังสินค้า W2 สุพรรณบุรี',
      locations: [
        { code: '001', name: 'ศาลาวัดริมน้ำ ตำบลโคกคราม', prov: 'สุพรรณบุรี', dist: 'บางปลาม้า', sub: 'โคกคราม', lat: 14.4312, lng: 100.1268, date: '2026-09-12', status: 'delivered', ben: 500, hh: 140 },
        { code: '002', name: 'จุดแจกจ่าย อบต.ตะค่า', prov: 'สุพรรณบุรี', dist: 'บางปลาม้า', sub: 'ตะค่า', lat: 14.3712, lng: 100.1631, date: '2026-09-14', status: 'delivered', ben: 380, hh: 105 },
        { code: '003', name: 'ชุมชนริมคลอง ตำบลบางเลน', prov: 'สุพรรณบุรี', dist: 'สองพี่น้อง', sub: 'บางเลน', lat: 14.2186, lng: 100.0583, date: '2026-09-16', status: 'delivered', ben: 420, hh: 118 },
      ],
    },
    {
      round_no: '002', name: 'ส่งต่อกำลังใจ ลุ่มน้ำเจ้าพระยา จังหวัดพระนครศรีอยุธยา', status: 'in_transit',
      start_date: '2026-09-24', end_date: '2026-10-03',
      summary: 'ส่งมอบถุงยังชีพและของใช้จำเป็นในพื้นที่น้ำท่วมขังอำเภอผักไห่และเสนา (ข้อมูลตัวอย่าง)',
      description: 'รอบที่สองของโครงการ เน้นถุงยังชีพสำหรับครอบครัวที่มีผู้สูงอายุและเด็กเล็ก พร้อมยาสามัญประจำบ้าน\n\n(ข้อมูลตัวอย่างสำหรับทดสอบระบบ)',
      supporters: 'ผู้ร่วมสั่งซื้อสินค้า, ร้านค้าคู่ค้าของรัตนไพบูลย์',
      locations: [
        { code: '004', name: 'วัดผักไห่ จุดรับของบริจาคชุมชน', prov: 'พระนครศรีอยุธยา', dist: 'ผักไห่', sub: 'ผักไห่', lat: 14.4589, lng: 100.3712, date: '2026-09-26', status: 'delivered', ben: 650, hh: 190 },
        { code: '005', name: 'ชุมชนบ้านแพน ริมแม่น้ำน้อย', prov: 'พระนครศรีอยุธยา', dist: 'เสนา', sub: 'บ้านแพน', lat: 14.3305, lng: 100.4021, date: '2026-09-28', status: 'delivered', ben: 540, hh: 150 },
        { code: '006', name: 'โรงเรียนวัดบางบาล (ศูนย์พักพิงชั่วคราว)', prov: 'พระนครศรีอยุธยา', dist: 'บางบาล', sub: 'บางบาล', lat: 14.3829, lng: 100.4867, date: '2026-10-03', status: 'in_transit', ben: 300, hh: 85 },
      ],
    },
    {
      round_no: '003', name: 'ร่วมใจช่วยเหลือ นครปฐม–ราชบุรี', status: 'preparing',
      start_date: '2026-10-02', end_date: null,
      summary: 'กำลังรวบรวมและจัดเตรียมสิ่งของสำหรับพื้นที่อำเภอบางเลนและโพธาราม (ข้อมูลตัวอย่าง)',
      description: 'รอบที่สามอยู่ระหว่างรวบรวมสินค้าจากการสนับสนุน คาดว่าจะเริ่มนำส่งภายในสัปดาห์หน้า\n\n(ข้อมูลตัวอย่างสำหรับทดสอบระบบ)',
      supporters: 'ผู้ร่วมสั่งซื้อสินค้า, ทีมงานคลังสินค้า W3 ราชบุรี และ W4 นครปฐม',
      locations: [
        { code: '007', name: 'ชุมชนตลาดบางเลน', prov: 'นครปฐม', dist: 'บางเลน', sub: 'บางเลน', lat: 14.0236, lng: 100.1708, date: '2026-10-06', status: 'preparing', ben: 450, hh: 0 },
        { code: '008', name: 'ชุมชนริมแม่น้ำแม่กลอง ตำบลโพธาราม', prov: 'ราชบุรี', dist: 'โพธาราม', sub: 'โพธาราม', lat: 13.6929, lng: 99.8535, date: '2026-10-08', status: 'preparing', ben: 350, hh: 0 },
      ],
    },
  ];

  const itemSets = [
    [['น้ำดื่ม (แพ็ค 12 ขวด)', 200, 'แพ็ค'], ['ข้าวสาร 5 กก.', 120, 'ถุง'], ['อาหารแห้ง', 150, 'ชุด'], ['ของใช้จำเป็น', 140, 'ชุด']],
    [['น้ำดื่ม (แพ็ค 12 ขวด)', 160, 'แพ็ค'], ['ข้าวสาร 5 กก.', 100, 'ถุง'], ['บะหมี่กึ่งสำเร็จรูป', 60, 'ลัง'], ['ยาสามัญประจำบ้าน', 50, 'ชุด']],
    [['ถุงยังชีพ', 200, 'ถุง'], ['น้ำดื่ม (แพ็ค 12 ขวด)', 180, 'แพ็ค'], ['ผ้าห่ม', 80, 'ผืน'], ['ของใช้จำเป็น', 120, 'ชุด']],
  ];

  const insProject = db.prepare(`INSERT INTO relief_projects (round_no, name, summary, description, status, start_date, end_date, supporters) VALUES (?,?,?,?,?,?,?,?)`);
  const insLoc = db.prepare(`INSERT INTO relief_locations (project_id, code, name, province_id, district_id, subdistrict_id, lat, lng, delivery_date, status, description, beneficiaries, households, supporters) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insItem = db.prepare('INSERT INTO relief_items (location_id, name, quantity, unit, sort_order) VALUES (?,?,?,?,?)');
  const insPhoto = db.prepare('INSERT INTO relief_photos (location_id, stage, file_path, thumb_path, caption, taken_date, width, height, sort_order) VALUES (?,?,?,?,?,?,?,?,?)');
  const insUpd = db.prepare('INSERT INTO relief_updates (location_id, step, update_date, note, photo_id) VALUES (?,?,?,?,?)');
  const setCover = db.prepare('UPDATE relief_locations SET cover_photo_id = ? WHERE id = ?');

  const shift = (d, days) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10); };
  let seed = 0;

  tx(db, () => {
    projects.forEach((p, pi) => {
      const pid = Number(insProject.run(p.round_no, p.name, p.summary, p.description, p.status, p.start_date, p.end_date, p.supporters).lastInsertRowid);
      p.locations.forEach((l, li) => {
        const prov = provId(l.prov), dist = distId(prov, l.dist), sub = subId(dist, l.sub);
        const desc = l.status === 'delivered'
          ? `ทีมงานนำส่งสิ่งของถึงจุดแจกจ่าย ${l.name} และส่งมอบให้ตัวแทนชุมชนเพื่อแจกจ่ายต่อให้ครัวเรือนที่ได้รับผลกระทบ (ข้อมูลตัวอย่าง)`
          : l.status === 'in_transit'
            ? `รถขนส่งของรัตนไพบูลย์กำลังเดินทางนำสิ่งของไปยัง ${l.name} (ข้อมูลตัวอย่าง)`
            : `อยู่ระหว่างรวบรวมและจัดเตรียมสิ่งของสำหรับ ${l.name} (ข้อมูลตัวอย่าง)`;
        const lid = Number(insLoc.run(pid, l.code, l.name, prov, dist, sub, l.lat, l.lng, l.date, l.status, desc, l.ben, l.hh, p.supporters).lastInsertRowid);
        itemSets[(pi + li) % itemSets.length].forEach(([name, qty, unit], i) => insItem.run(lid, name, Math.round(qty * (0.8 + ((li + 1) * 0.15))), unit, i));

        // Photos per stage reached so far
        const reached = l.status === 'delivered' ? PHOTO_STAGES : l.status === 'in_transit' ? ['collect', 'prepare', 'transit'] : ['collect'];
        const stageDate = { collect: shift(l.date, -4), prepare: shift(l.date, -2), transit: l.date, deliver: l.date, after: shift(l.date, 1) };
        const photoIds = {};
        reached.forEach((stage, si) => {
          const count = stage === 'deliver' ? 2 : 1;
          for (let k = 0; k < count; k++) {
            const file = `demo/loc${l.code}-${stage}-${k + 1}.svg`;
            fs.writeFileSync(path.join(UPLOAD_DIR, file), demoSvg(stage, `จุด #${l.code} · ${l.name}`, seed++), 'utf8');
            const caption = {
              collect: 'รวบรวมสินค้าจากการสนับสนุนที่คลังสินค้า',
              prepare: 'ทีมงานคัดแยกและบรรจุสิ่งของเป็นชุด',
              transit: 'รถขนส่งเดินทางเข้าพื้นที่',
              deliver: k === 0 ? 'ส่งมอบสิ่งของให้ตัวแทนชุมชน' : 'แจกจ่ายถึงมือผู้ประสบภัย',
              after: 'ชุมชนหลังได้รับความช่วยเหลือ',
            }[stage];
            const phid = Number(insPhoto.run(lid, stage, `/uploads/${file}`, `/uploads/${file}`, caption, stageDate[stage], 1200, 800, si * 10 + k).lastInsertRowid);
            if (!photoIds[stage]) photoIds[stage] = phid;
          }
        });
        setCover.run(photoIds.deliver || photoIds.transit || photoIds.collect, lid);

        // Timeline
        const steps = l.status === 'delivered' ? TIMELINE_STEPS : l.status === 'in_transit' ? ['support', 'collect', 'prepare', 'transit'] : ['support', 'collect'];
        const stepDate = { support: shift(l.date, -6), collect: shift(l.date, -4), prepare: shift(l.date, -2), transit: l.date, deliver: l.date };
        const stepNote = {
          support: 'ได้รับการสนับสนุนจากการสั่งซื้อสินค้าของผู้ร่วมโครงการ',
          collect: 'รวบรวมสิ่งของที่คลังสินค้ารัตนไพบูลย์',
          prepare: 'คัดแยก บรรจุ และตรวจนับจำนวน',
          transit: 'ออกเดินทางนำส่งพื้นที่',
          deliver: `ส่งมอบถึงมือผู้ประสบภัย ${l.ben.toLocaleString('en-US')} คน`,
        };
        steps.forEach(s => insUpd.run(lid, s, stepDate[s], stepNote[s], s === 'support' ? null : (photoIds[s] || null)));
      });
    });
  });
  return true;
}

function init({ demo = process.env.SEED_DEMO !== '0' } = {}) {
  const db = openDb();
  seedProvinces(db);
  const credFile = ensureAdmin(db);
  const seeded = demo ? seedDemo(db) : false;
  return { db, credFile, seeded };
}

module.exports = { demoSvg, init, tx, hashPassword, verifyPassword, STATUSES, PHOTO_STAGES, TIMELINE_STEPS, UPLOAD_DIR, DATA_DIR, DB_FILE };

// CLI: node db.js --reset [--no-demo]
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--reset')) {
    for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm', path.join(DATA_DIR, 'ADMIN_CREDENTIALS.txt')]) fs.rmSync(f, { force: true });
    fs.rmSync(path.join(UPLOAD_DIR, 'demo'), { recursive: true, force: true });
    console.log('Database reset.');
  }
  const { credFile, seeded } = init({ demo: !args.includes('--no-demo') });
  console.log(seeded ? 'Demo data seeded.' : 'No demo data added.');
  if (credFile) console.log(`Admin credentials written to ${credFile}`);
}
