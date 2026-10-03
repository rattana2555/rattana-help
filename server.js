'use strict';
// RATTANA HELP — HTTP server (Node built-ins only)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { init, tx, hashPassword, verifyPassword, STATUSES, PHOTO_STAGES, TIMELINE_STEPS, UPLOAD_DIR } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'docs');
const SESSION_DAYS = 7;
const COOKIE = 'rh_admin';

const { db, credFile, seeded } = init();

// ─────────────────────────── helpers ───────────────────────────
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};
const PAGE_CSP = [
  "default-src 'self'",
  "script-src 'self' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://lh3.googleusercontent.com",
  "connect-src 'self' https://nominatim.openstreetmap.org https://script.google.com https://script.googleusercontent.com https://tiles.openfreemap.org",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
function json(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'ไฟล์หรือข้อมูลมีขนาดใหญ่เกินไป')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ── input validation ──
const str = (v, max = 500) => (v === undefined || v === null) ? null : String(v).trim().slice(0, max) || null;
const reqStr = (v, field, max) => { const s = str(v, max); if (!s) throw new HttpError(400, `กรุณาระบุ${field}`); return s; };
const int = v => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(+v) ? Math.trunc(+v) : null);
const num = v => (v === '' || v === null || v === undefined) ? null : (Number.isFinite(+v) ? +v : null);
const nonNeg = v => Math.max(0, int(v) || 0);
const date = v => { const s = str(v, 10); if (!s) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s))) throw new HttpError(400, 'รูปแบบวันที่ไม่ถูกต้อง'); return s; };
const oneOf = (v, list, fallback) => list.includes(v) ? v : fallback;
const idParam = v => { const n = int(v); if (!n || n < 1) throw new HttpError(400, 'invalid id'); return n; };

// ─────────────────────────── queries ───────────────────────────
const LOC_SELECT = `
  SELECT l.*, p.round_no, p.name AS project_name, p.status AS project_status,
         pv.name_th AS province, d.name_th AS district, s.name_th AS subdistrict,
         COALESCE(ph.thumb_path, (SELECT thumb_path FROM relief_photos x WHERE x.location_id = l.id ORDER BY (x.stage = 'deliver') DESC, x.sort_order, x.id LIMIT 1)) AS cover_thumb,
         COALESCE(ph.file_path,  (SELECT file_path  FROM relief_photos x WHERE x.location_id = l.id ORDER BY (x.stage = 'deliver') DESC, x.sort_order, x.id LIMIT 1)) AS cover_url,
         (SELECT COUNT(*) FROM relief_photos x WHERE x.location_id = l.id) AS photo_count,
         (SELECT COALESCE(SUM(quantity), 0) FROM relief_items i WHERE i.location_id = l.id) AS items_total
  FROM relief_locations l
  JOIN relief_projects p ON p.id = l.project_id
  LEFT JOIN provinces pv ON pv.id = l.province_id
  LEFT JOIN districts d ON d.id = l.district_id
  LEFT JOIN subdistricts s ON s.id = l.subdistrict_id
  LEFT JOIN relief_photos ph ON ph.id = l.cover_photo_id`;

const PHOTO_SELECT = `
  SELECT ph.*, l.code AS location_code, l.name AS location_name, l.project_id,
         p.round_no, p.name AS project_name,
         pv.name_th AS province, d.name_th AS district, s.name_th AS subdistrict,
         l.province_id, l.district_id, l.subdistrict_id
  FROM relief_photos ph
  JOIN relief_locations l ON l.id = ph.location_id
  JOIN relief_projects p ON p.id = l.project_id
  LEFT JOIN provinces pv ON pv.id = l.province_id
  LEFT JOIN districts d ON d.id = l.district_id
  LEFT JOIN subdistricts s ON s.id = l.subdistrict_id`;

const plain = rows => rows.map(r => ({ ...r }));

function getStats(publicOnly = true) {
  const pub = publicOnly ? 'AND p.is_published = 1' : '';
  const d = db.prepare(`
    SELECT COUNT(*) AS delivered_locations,
           COUNT(DISTINCT COALESCE(l.subdistrict_id, -l.id)) AS areas,
           COUNT(DISTINCT l.province_id) AS provinces,
           COUNT(DISTINCT l.project_id) AS rounds_delivered,
           COALESCE(SUM(l.beneficiaries), 0) AS beneficiaries,
           COALESCE(SUM(l.households), 0) AS households
    FROM relief_locations l JOIN relief_projects p ON p.id = l.project_id
    WHERE l.status = 'delivered' ${pub}`).get();
  const items = db.prepare(`
    SELECT COALESCE(SUM(i.quantity), 0) AS n FROM relief_items i
    JOIN relief_locations l ON l.id = i.location_id JOIN relief_projects p ON p.id = l.project_id
    WHERE l.status = 'delivered' ${pub}`).get().n;
  const all = db.prepare(`
    SELECT COUNT(*) AS total_locations,
           SUM(l.status = 'preparing') AS preparing, SUM(l.status = 'in_transit') AS in_transit, SUM(l.status = 'delivered') AS delivered
    FROM relief_locations l JOIN relief_projects p ON p.id = l.project_id WHERE 1=1 ${pub}`).get();
  const rounds = db.prepare(`SELECT COUNT(*) AS n FROM relief_projects p WHERE 1=1 ${pub}`).get().n;
  const photos = db.prepare(`SELECT COUNT(*) AS n FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id JOIN relief_projects p ON p.id = l.project_id WHERE 1=1 ${pub}`).get().n;
  const last = db.prepare(`SELECT MAX(l.updated_at) AS t FROM relief_locations l JOIN relief_projects p ON p.id = l.project_id WHERE 1=1 ${pub}`).get().t;
  return {
    ...d, items_delivered: items, rounds_total: rounds, photos, updated_at: last,
    status: { preparing: all.preparing || 0, in_transit: all.in_transit || 0, delivered: all.delivered || 0, total: all.total_locations || 0 },
  };
}

function projectAggregates(where = 'p.is_published = 1', params = []) {
  return plain(db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM relief_locations l WHERE l.project_id = p.id) AS location_count,
      (SELECT COUNT(*) FROM relief_locations l WHERE l.project_id = p.id AND l.status = 'delivered') AS delivered_count,
      (SELECT COALESCE(SUM(beneficiaries), 0) FROM relief_locations l WHERE l.project_id = p.id AND l.status = 'delivered') AS beneficiaries,
      (SELECT COALESCE(SUM(beneficiaries), 0) FROM relief_locations l WHERE l.project_id = p.id) AS beneficiaries_planned,
      (SELECT COALESCE(SUM(i.quantity), 0) FROM relief_items i JOIN relief_locations l ON l.id = i.location_id WHERE l.project_id = p.id) AS items_total,
      (SELECT COUNT(*) FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id WHERE l.project_id = p.id) AS photo_count,
      (SELECT GROUP_CONCAT(name_th, ', ') FROM (SELECT DISTINCT pv.name_th FROM relief_locations l JOIN provinces pv ON pv.id = l.province_id WHERE l.project_id = p.id)) AS provinces,
      (SELECT MIN(delivery_date) FROM relief_locations l WHERE l.project_id = p.id) AS first_date,
      (SELECT MAX(delivery_date) FROM relief_locations l WHERE l.project_id = p.id) AS last_date,
      (SELECT ph.thumb_path FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id
         WHERE l.project_id = p.id ORDER BY (ph.id = l.cover_photo_id) DESC, (ph.stage = 'deliver') DESC, ph.id LIMIT 1) AS cover_thumb
    FROM relief_projects p WHERE ${where}
    ORDER BY COALESCE(p.start_date, p.created_at) DESC, p.id DESC`).all(...params));
}

function locationDetail(id, publicOnly) {
  const loc = db.prepare(`${LOC_SELECT} WHERE l.id = ? ${publicOnly ? 'AND p.is_published = 1' : ''}`).get(id);
  if (!loc) return null;
  const out = { ...loc };
  out.items = plain(db.prepare('SELECT id, name, quantity, unit FROM relief_items WHERE location_id = ? ORDER BY sort_order, id').all(id));
  out.photos = plain(db.prepare(`${PHOTO_SELECT} WHERE ph.location_id = ? ORDER BY CASE ph.stage WHEN 'collect' THEN 1 WHEN 'prepare' THEN 2 WHEN 'transit' THEN 3 WHEN 'deliver' THEN 4 ELSE 5 END, ph.sort_order, ph.id`).all(id));
  if (publicOnly) out.photos.forEach(p => { delete p.uploaded_by; });
  out.updates = plain(db.prepare('SELECT step, update_date, note, photo_id FROM relief_updates WHERE location_id = ?').all(id));
  out.siblings = plain(db.prepare(`${LOC_SELECT} WHERE l.project_id = ? AND l.id != ? ORDER BY l.delivery_date DESC`).all(out.project_id, id))
    .map(s => ({ id: s.id, code: s.code, name: s.name, status: s.status, delivery_date: s.delivery_date, province: s.province, district: s.district, subdistrict: s.subdistrict, cover_thumb: s.cover_thumb }));
  return out;
}

function photoQuery(q, publicOnly) {
  const where = [], params = [];
  if (publicOnly) where.push('p.is_published = 1');
  const eq = (col, v) => { const n = int(v); if (n) { where.push(`${col} = ?`); params.push(n); } };
  eq('l.province_id', q.get('province_id'));
  eq('l.district_id', q.get('district_id'));
  eq('l.subdistrict_id', q.get('subdistrict_id'));
  eq('l.project_id', q.get('project_id'));
  eq('ph.location_id', q.get('location_id'));
  const stage = q.get('stage'); if (PHOTO_STAGES.includes(stage)) { where.push('ph.stage = ?'); params.push(stage); }
  const from = q.get('date_from'), to = q.get('date_to');
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('COALESCE(ph.taken_date, l.delivery_date) >= ?'); params.push(from); }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('COALESCE(ph.taken_date, l.delivery_date) <= ?'); params.push(to); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Math.max(int(q.get('limit')) || 30, 1), 200);
  const offset = Math.max(int(q.get('offset')) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id JOIN relief_projects p ON p.id = l.project_id ${w}`).get(...params).n;
  const rows = plain(db.prepare(`${PHOTO_SELECT} ${w} ORDER BY COALESCE(ph.taken_date, l.delivery_date) DESC, ph.location_id DESC, ph.sort_order, ph.id LIMIT ? OFFSET ?`).all(...params, limit, offset));
  if (publicOnly) rows.forEach(r => { delete r.uploaded_by; });
  return { total, limit, offset, photos: rows };
}

// ─────────────────────────── uploads ───────────────────────────
const IMAGE_TYPES = {
  'image/jpeg': { ext: 'jpg', magic: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  'image/png': { ext: 'png', magic: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) },
  'image/webp': { ext: 'webp', magic: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
};
function decodeImage(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP');
  const buf = Buffer.from(m[2], 'base64');
  const type = IMAGE_TYPES[m[1]];
  if (!type.magic(buf)) throw new HttpError(400, 'ไฟล์ภาพไม่ถูกต้อง');
  return { buf, ext: type.ext };
}
function saveUpload(buf, ext, suffix = '') {
  const now = new Date();
  const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
  const name = crypto.randomBytes(12).toString('hex');
  const rel = `${dir}/${name}${suffix}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, rel), buf);
  return { rel, name };
}
function unlinkUpload(urlPath) {
  if (!urlPath || !urlPath.startsWith('/uploads/')) return;
  const abs = path.normalize(path.join(UPLOAD_DIR, urlPath.slice('/uploads/'.length)));
  if (abs.startsWith(UPLOAD_DIR + path.sep)) fs.rmSync(abs, { force: true });
}
function removePhotoFiles(rows) {
  for (const r of rows) { unlinkUpload(r.file_path); if (r.thumb_path !== r.file_path) unlinkUpload(r.thumb_path); }
}

// ─────────────────────────── auth ───────────────────────────
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
// Behind a hosting proxy (Render, Railway, Nginx…) set TRUST_PROXY=1 so login limits apply per real visitor
const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
const loginAttempts = new Map(); // ip -> { n, until }

function currentAdmin(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const row = db.prepare(`SELECT a.id, a.username, a.display_name, a.role, s.expires_at FROM admin_sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?`).get(sha256(token));
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username, display_name: row.display_name, role: row.role };
}
function isHttps(req) { return req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'; }
function sessionCookie(req, token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
}

// ─────────────────────────── routes ───────────────────────────
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler, ...opts });

// ── Public API ──
route('GET', '/api/health', (req, res) => json(res, 200, { ok: true, db: !!db.prepare('SELECT 1 AS ok').get() }));
route('GET', '/api/stats', (req, res) => json(res, 200, getStats(true)));

route('GET', '/api/impact', (req, res) => {
  const byProvince = plain(db.prepare(`
    SELECT pv.name_th AS province, COUNT(*) AS locations, COALESCE(SUM(l.beneficiaries), 0) AS beneficiaries,
           (SELECT COALESCE(SUM(i.quantity), 0) FROM relief_items i JOIN relief_locations l2 ON l2.id = i.location_id JOIN relief_projects p2 ON p2.id = l2.project_id
             WHERE l2.province_id = pv.id AND l2.status = 'delivered' AND p2.is_published = 1) AS items
    FROM relief_locations l JOIN relief_projects p ON p.id = l.project_id JOIN provinces pv ON pv.id = l.province_id
    WHERE l.status = 'delivered' AND p.is_published = 1
    GROUP BY pv.id ORDER BY beneficiaries DESC`).all());
  const byItem = plain(db.prepare(`
    SELECT i.name, i.unit, SUM(i.quantity) AS quantity, COUNT(DISTINCT i.location_id) AS locations
    FROM relief_items i JOIN relief_locations l ON l.id = i.location_id JOIN relief_projects p ON p.id = l.project_id
    WHERE l.status = 'delivered' AND p.is_published = 1
    GROUP BY i.name, i.unit ORDER BY quantity DESC LIMIT 12`).all());
  const recent = plain(db.prepare(`${LOC_SELECT} WHERE p.is_published = 1 ORDER BY l.delivery_date DESC, l.id DESC LIMIT 6`).all());
  json(res, 200, { stats: getStats(true), byProvince, byItem, projects: projectAggregates(), recent });
});

route('GET', '/api/projects', (req, res) => json(res, 200, projectAggregates()));

route('GET', '/api/projects/(\\d+)', (req, res, [id]) => {
  const [project] = projectAggregates('p.is_published = 1 AND p.id = ?', [idParam(id)]);
  if (!project) throw new HttpError(404, 'ไม่พบโครงการ');
  project.locations = plain(db.prepare(`${LOC_SELECT} WHERE l.project_id = ? ORDER BY l.delivery_date DESC, l.code DESC`).all(project.id));
  project.photos = plain(db.prepare(`${PHOTO_SELECT} WHERE l.project_id = ? ORDER BY COALESCE(ph.taken_date, l.delivery_date) DESC, ph.id LIMIT 24`).all(project.id));
  project.photos.forEach(p => { delete p.uploaded_by; });
  json(res, 200, project);
});

route('GET', '/api/locations', (req, res) => {
  json(res, 200, plain(db.prepare(`${LOC_SELECT} WHERE p.is_published = 1 ORDER BY l.delivery_date DESC, l.code DESC`).all()));
});

route('GET', '/api/locations/(\\d+)', (req, res, [id]) => {
  const loc = locationDetail(idParam(id), true);
  if (!loc) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
  json(res, 200, loc);
});

route('GET', '/api/photos', (req, res, _, url) => json(res, 200, photoQuery(url.searchParams, true)));

// Filter options for the gallery (only areas that actually have photos)
route('GET', '/api/filters', (req, res) => {
  const base = `FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id JOIN relief_projects p ON p.id = l.project_id WHERE p.is_published = 1`;
  json(res, 200, {
    provinces: plain(db.prepare(`SELECT DISTINCT pv.id, pv.name_th AS name ${base.replace('WHERE', 'JOIN provinces pv ON pv.id = l.province_id WHERE')} ORDER BY pv.name_th`).all()),
    districts: plain(db.prepare(`SELECT DISTINCT d.id, d.name_th AS name, d.province_id ${base.replace('WHERE', 'JOIN districts d ON d.id = l.district_id WHERE')} ORDER BY d.name_th`).all()),
    projects: plain(db.prepare(`SELECT DISTINCT p.id, p.round_no, p.name ${base} ORDER BY p.round_no DESC`).all()),
  });
});

// Geography (public read — admin uses it for dropdowns)
route('GET', '/api/geo/provinces', (req, res) => json(res, 200, plain(db.prepare('SELECT id, name_th, region FROM provinces ORDER BY name_th').all())));
route('GET', '/api/geo/districts', (req, res, _, url) => json(res, 200, plain(db.prepare('SELECT id, province_id, name_th FROM districts WHERE province_id = ? ORDER BY name_th').all(int(url.searchParams.get('province_id')) || 0))));
route('GET', '/api/geo/subdistricts', (req, res, _, url) => json(res, 200, plain(db.prepare('SELECT id, district_id, name_th FROM subdistricts WHERE district_id = ? ORDER BY name_th').all(int(url.searchParams.get('district_id')) || 0))));

// ── Admin auth ──
route('POST', '/api/admin/login', async (req, res) => {
  const ip = clientIp(req);
  const att = loginAttempts.get(ip);
  if (att && att.n >= 8 && att.until > Date.now()) throw new HttpError(429, 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที');
  const body = await readBody(req, 10_000);
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(String(body.username || '').trim().toLowerCase());
  if (!admin || !verifyPassword(body.password || '', admin.password_hash)) {
    const cur = att && att.until > Date.now() ? att : { n: 0, until: Date.now() + 15 * 60_000 };
    cur.n++; loginAttempts.set(ip, cur);
    throw new HttpError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), admin.id, Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
  json(res, 200, { id: admin.id, username: admin.username, display_name: admin.display_name, role: admin.role },
    { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
}, { public: true });

route('POST', '/api/admin/logout', (req, res) => {
  const token = parseCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
  json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}, { public: true });

route('GET', '/api/admin/me', (req, res, _, __, admin) => json(res, 200, admin), { field: true });

// ── Admin: dashboard ──
route('GET', '/api/admin/dashboard', (req, res) => {
  json(res, 200, {
    stats: getStats(false),
    recent: plain(db.prepare(`${LOC_SELECT} ORDER BY l.updated_at DESC LIMIT 8`).all()),
  });
}, { field: true });

// ── Admin: projects ──
function projectInput(b) {
  return [
    reqStr(b.round_no, 'รอบที่', 20), reqStr(b.name, 'ชื่อโครงการ', 200), str(b.summary, 500), str(b.description, 5000),
    oneOf(b.status, STATUSES, 'preparing'), date(b.start_date), date(b.end_date), str(b.supporters, 1000), b.is_published === false || b.is_published === 0 ? 0 : 1,
  ];
}
route('GET', '/api/admin/projects', (req, res) => json(res, 200, projectAggregates('1=1')), { field: true });
route('POST', '/api/admin/projects', async (req, res) => {
  const v = projectInput(await readBody(req, 100_000));
  const r = db.prepare('INSERT INTO relief_projects (round_no, name, summary, description, status, start_date, end_date, supporters, is_published) VALUES (?,?,?,?,?,?,?,?,?)').run(...v);
  json(res, 201, { id: Number(r.lastInsertRowid) });
});
route('PUT', '/api/admin/projects/(\\d+)', async (req, res, [id]) => {
  const v = projectInput(await readBody(req, 100_000));
  const r = db.prepare("UPDATE relief_projects SET round_no=?, name=?, summary=?, description=?, status=?, start_date=?, end_date=?, supporters=?, is_published=?, updated_at=datetime('now') WHERE id=?").run(...v, idParam(id));
  if (!r.changes) throw new HttpError(404, 'ไม่พบโครงการ');
  json(res, 200, { ok: true });
});
route('DELETE', '/api/admin/projects/(\\d+)', (req, res, [id]) => {
  const pid = idParam(id);
  const photos = db.prepare('SELECT ph.file_path, ph.thumb_path FROM relief_photos ph JOIN relief_locations l ON l.id = ph.location_id WHERE l.project_id = ?').all(pid);
  const r = db.prepare('DELETE FROM relief_projects WHERE id = ?').run(pid);
  if (!r.changes) throw new HttpError(404, 'ไม่พบโครงการ');
  removePhotoFiles(photos);
  json(res, 200, { ok: true });
});

// ── Admin: locations ──
route('GET', '/api/admin/locations', (req, res) => json(res, 200, plain(db.prepare(`${LOC_SELECT} ORDER BY l.delivery_date DESC, l.id DESC`).all())), { field: true });
route('GET', '/api/admin/locations/next-code', (req, res) => {
  const max = db.prepare("SELECT MAX(CAST(code AS INTEGER)) AS n FROM relief_locations WHERE code GLOB '[0-9]*'").get().n || 0;
  json(res, 200, { code: String(max + 1).padStart(3, '0') });
});
route('GET', '/api/admin/locations/(\\d+)', (req, res, [id]) => {
  const loc = locationDetail(idParam(id), false);
  if (!loc) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
  loc.photos = withUploader(loc.photos);
  json(res, 200, loc);
}, { field: true });

function saveUpdates(lid, updates) {
  db.prepare('DELETE FROM relief_updates WHERE location_id = ?').run(lid);
  const insUpd = db.prepare('INSERT INTO relief_updates (location_id, step, update_date, note, photo_id) VALUES (?,?,?,?,?)');
  const photoOk = db.prepare('SELECT 1 FROM relief_photos WHERE id = ? AND location_id = ?');
  for (const u of updates) {
    if (!u || !TIMELINE_STEPS.includes(u.step)) continue;
    const d = date(u.update_date), note = str(u.note, 1000);
    let photo = int(u.photo_id); if (photo && !photoOk.get(photo, lid)) photo = null;
    if (d || note || photo) insUpd.run(lid, u.step, d, note, photo);
  }
}

function saveLocation(b, id) {
  const projectId = idParam(b.project_id);
  if (!db.prepare('SELECT 1 FROM relief_projects WHERE id = ?').get(projectId)) throw new HttpError(400, 'ไม่พบโครงการที่เลือก');
  const provinceId = int(b.province_id), districtId = int(b.district_id), subdistrictId = int(b.subdistrict_id);
  if (districtId && !db.prepare('SELECT 1 FROM districts WHERE id = ? AND province_id = ?').get(districtId, provinceId)) throw new HttpError(400, 'อำเภอไม่ตรงกับจังหวัด');
  if (subdistrictId && !db.prepare('SELECT 1 FROM subdistricts WHERE id = ? AND district_id = ?').get(subdistrictId, districtId)) throw new HttpError(400, 'ตำบลไม่ตรงกับอำเภอ');
  const lat = num(b.lat), lng = num(b.lng);
  if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) throw new HttpError(400, 'พิกัดไม่ถูกต้อง');
  const vals = [projectId, reqStr(b.code, 'รหัสจุด', 20), reqStr(b.name, 'ชื่อจุด', 200), provinceId, districtId, subdistrictId, str(b.village, 200),
    lat, lng, date(b.delivery_date), oneOf(b.status, STATUSES, 'preparing'), str(b.description, 5000), nonNeg(b.beneficiaries), nonNeg(b.households), str(b.supporters, 1000)];
  const items = Array.isArray(b.items) ? b.items.slice(0, 100) : [];
  const updates = Array.isArray(b.updates) ? b.updates : [];

  return tx(db, () => {
    let lid = id;
    try {
      if (id) {
        const r = db.prepare(`UPDATE relief_locations SET project_id=?, code=?, name=?, province_id=?, district_id=?, subdistrict_id=?, village=?, lat=?, lng=?, delivery_date=?, status=?, description=?, beneficiaries=?, households=?, supporters=?, updated_at=datetime('now') WHERE id=?`).run(...vals, id);
        if (!r.changes) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
      } else {
        lid = Number(db.prepare(`INSERT INTO relief_locations (project_id, code, name, province_id, district_id, subdistrict_id, village, lat, lng, delivery_date, status, description, beneficiaries, households, supporters) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals).lastInsertRowid);
      }
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, `รหัสจุด #${vals[1]} ถูกใช้แล้ว`);
      throw e;
    }
    db.prepare('DELETE FROM relief_items WHERE location_id = ?').run(lid);
    const insItem = db.prepare('INSERT INTO relief_items (location_id, name, quantity, unit, sort_order) VALUES (?,?,?,?,?)');
    items.forEach((it, i) => { const n = str(it.name, 200); if (n) insItem.run(lid, n, Math.max(0, num(it.quantity) || 0), str(it.unit, 30), i); });

    saveUpdates(lid, updates);
    return lid;
  });
}
route('POST', '/api/admin/locations', async (req, res) => json(res, 201, { id: saveLocation(await readBody(req, 500_000), null) }));
route('PUT', '/api/admin/locations/(\\d+)', async (req, res, [id]) => json(res, 200, { id: saveLocation(await readBody(req, 500_000), idParam(id)) }));
route('PATCH', '/api/admin/locations/(\\d+)/status', async (req, res, [id]) => {
  const b = await readBody(req, 1000);
  if (!STATUSES.includes(b.status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
  const r = db.prepare("UPDATE relief_locations SET status = ?, updated_at = datetime('now') WHERE id = ?").run(b.status, idParam(id));
  if (!r.changes) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
  json(res, 200, { ok: true });
}, { field: true });

// Field update: what the on-site team may change — status, GPS position, timeline (never name, area or items)
route('PATCH', '/api/admin/locations/(\\d+)/field', async (req, res, [id]) => {
  const lid = idParam(id), b = await readBody(req, 100_000);
  if (!db.prepare('SELECT 1 FROM relief_locations WHERE id = ?').get(lid)) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
  tx(db, () => {
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw new HttpError(400, 'สถานะไม่ถูกต้อง');
      db.prepare('UPDATE relief_locations SET status = ? WHERE id = ?').run(b.status, lid);
    }
    if (b.lat !== undefined || b.lng !== undefined) {
      const lat = num(b.lat), lng = num(b.lng);
      if ((lat === null) !== (lng === null) || (lat !== null && (lat < -90 || lat > 90 || lng < -180 || lng > 180))) throw new HttpError(400, 'พิกัดไม่ถูกต้อง');
      db.prepare('UPDATE relief_locations SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, lid);
    }
    if (Array.isArray(b.updates)) saveUpdates(lid, b.updates);
    db.prepare("UPDATE relief_locations SET updated_at = datetime('now') WHERE id = ?").run(lid);
  });
  json(res, 200, { ok: true });
}, { field: true });
route('PUT', '/api/admin/locations/(\\d+)/cover', async (req, res, [id]) => {
  const lid = idParam(id), b = await readBody(req, 1000), pid = int(b.photo_id);
  if (pid && !db.prepare('SELECT 1 FROM relief_photos WHERE id = ? AND location_id = ?').get(pid, lid)) throw new HttpError(400, 'ภาพไม่อยู่ในจุดนี้');
  db.prepare("UPDATE relief_locations SET cover_photo_id = ?, updated_at = datetime('now') WHERE id = ?").run(pid || null, lid);
  json(res, 200, { ok: true });
}, { field: true });
route('DELETE', '/api/admin/locations/(\\d+)', (req, res, [id]) => {
  const lid = idParam(id);
  const photos = db.prepare('SELECT file_path, thumb_path FROM relief_photos WHERE location_id = ?').all(lid);
  const r = db.prepare('DELETE FROM relief_locations WHERE id = ?').run(lid);
  if (!r.changes) throw new HttpError(404, 'ไม่พบจุดช่วยเหลือ');
  removePhotoFiles(photos);
  json(res, 200, { ok: true });
});

// ── Admin: photos ──
// Field staff may only edit or delete photos they uploaded themselves
function assertPhotoOwner(admin, pid) {
  if (admin.role === 'super') return;
  const row = db.prepare('SELECT uploaded_by FROM relief_photos WHERE id = ?').get(pid);
  if (!row) throw new HttpError(404, 'ไม่พบภาพ');
  if (row.uploaded_by !== admin.id) throw new HttpError(403, 'แก้ไขหรือลบได้เฉพาะภาพที่คุณอัปโหลดเอง');
}
function withUploader(photos) {
  const names = new Map(db.prepare('SELECT id, COALESCE(display_name, username) AS n FROM admins').all().map(a => [a.id, a.n]));
  return photos.map(p => ({ ...p, uploader_name: names.get(p.uploaded_by) || null }));
}
route('GET', '/api/admin/photos', (req, res, _, url) => { const r = photoQuery(url.searchParams, false); r.photos = withUploader(r.photos); json(res, 200, r); }, { field: true });
route('POST', '/api/admin/photos', async (req, res, _, __, admin) => {
  const b = await readBody(req, 25 * 1024 * 1024);
  const lid = idParam(b.location_id);
  if (!db.prepare('SELECT 1 FROM relief_locations WHERE id = ?').get(lid)) throw new HttpError(400, 'ไม่พบจุดช่วยเหลือ');
  const full = decodeImage(b.image);
  const thumb = b.thumb ? decodeImage(b.thumb) : null;
  const saved = saveUpload(full.buf, full.ext);
  const thumbRel = thumb ? saveUpload(thumb.buf, thumb.ext, '_t').rel : saved.rel;
  const sort = (db.prepare('SELECT MAX(sort_order) AS n FROM relief_photos WHERE location_id = ?').get(lid).n ?? -1) + 1;
  const r = db.prepare('INSERT INTO relief_photos (location_id, stage, file_path, thumb_path, caption, taken_date, width, height, sort_order, uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(lid, oneOf(b.stage, PHOTO_STAGES, 'deliver'), `/uploads/${saved.rel}`, `/uploads/${thumbRel}`, str(b.caption, 500), date(b.taken_date), int(b.width), int(b.height), sort, admin.id);
  db.prepare("UPDATE relief_locations SET updated_at = datetime('now') WHERE id = ?").run(lid);
  json(res, 201, { id: Number(r.lastInsertRowid), file_path: `/uploads/${saved.rel}`, thumb_path: `/uploads/${thumbRel}` });
}, { field: true });
route('PUT', '/api/admin/photos/(\\d+)', async (req, res, [id], __, admin) => {
  assertPhotoOwner(admin, idParam(id));
  const b = await readBody(req, 10_000);
  const r = db.prepare('UPDATE relief_photos SET stage = ?, caption = ?, taken_date = ? WHERE id = ?').run(oneOf(b.stage, PHOTO_STAGES, 'deliver'), str(b.caption, 500), date(b.taken_date), idParam(id));
  if (!r.changes) throw new HttpError(404, 'ไม่พบภาพ');
  json(res, 200, { ok: true });
}, { field: true });
route('DELETE', '/api/admin/photos/(\\d+)', (req, res, [id], __, admin) => {
  const pid = idParam(id);
  assertPhotoOwner(admin, pid);
  const row = db.prepare('SELECT file_path, thumb_path FROM relief_photos WHERE id = ?').get(pid);
  if (!row) throw new HttpError(404, 'ไม่พบภาพ');
  tx(db, () => {
    db.prepare('UPDATE relief_locations SET cover_photo_id = NULL WHERE cover_photo_id = ?').run(pid);
    db.prepare('DELETE FROM relief_photos WHERE id = ?').run(pid);
  });
  removePhotoFiles([row]);
  json(res, 200, { ok: true });
}, { field: true });

// ── Admin: geography ──
function geoCrud(table, parentCol) {
  const label = { provinces: 'จังหวัด', districts: 'อำเภอ', subdistricts: 'ตำบล' }[table];
  const conflict = e => {
    if (String(e.message).includes('UNIQUE')) throw new HttpError(409, `มี${label}นี้อยู่แล้ว`);
    if (String(e.message).includes('FOREIGN KEY')) throw new HttpError(409, `ไม่สามารถลบได้ เนื่องจากมีจุดช่วยเหลือใช้${label}นี้อยู่`);
    throw e;
  };
  route('POST', `/api/admin/${table}`, async (req, res) => {
    const b = await readBody(req, 5000);
    const name = reqStr(b.name_th, `ชื่อ${label}`, 100);
    try {
      const r = parentCol
        ? db.prepare(`INSERT INTO ${table} (${parentCol}, name_th) VALUES (?, ?)`).run(idParam(b[parentCol]), name)
        : db.prepare(`INSERT INTO ${table} (name_th, region) VALUES (?, ?)`).run(name, str(b.region, 50));
      json(res, 201, { id: Number(r.lastInsertRowid), name_th: name });
    } catch (e) { conflict(e); }
  });
  route('PUT', `/api/admin/${table}/(\\d+)`, async (req, res, [id]) => {
    const b = await readBody(req, 5000);
    try {
      const r = db.prepare(`UPDATE ${table} SET name_th = ? WHERE id = ?`).run(reqStr(b.name_th, `ชื่อ${label}`, 100), idParam(id));
      if (!r.changes) throw new HttpError(404, `ไม่พบ${label}`);
      json(res, 200, { ok: true });
    } catch (e) { if (e instanceof HttpError) throw e; conflict(e); }
  });
  route('DELETE', `/api/admin/${table}/(\\d+)`, (req, res, [id]) => {
    try {
      const r = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(idParam(id));
      if (!r.changes) throw new HttpError(404, `ไม่พบ${label}`);
      json(res, 200, { ok: true });
    } catch (e) { if (e instanceof HttpError) throw e; conflict(e); }
  });
}
geoCrud('provinces', null);
geoCrud('districts', 'province_id');
geoCrud('subdistricts', 'district_id');

// ── Admin: admins ──
route('GET', '/api/admin/admins', (req, res) => json(res, 200, plain(db.prepare('SELECT id, username, display_name, role, created_at, last_login_at FROM admins ORDER BY id').all())));
const ROLES = ['super', 'field'];
const superCount = () => db.prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'super'").get().n;
route('POST', '/api/admin/admins', async (req, res) => {
  const b = await readBody(req, 5000);
  const username = reqStr(b.username, 'ชื่อผู้ใช้', 50).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new HttpError(400, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (อย่างน้อย 3 ตัว)');
  if (String(b.password || '').length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  try {
    const r = db.prepare('INSERT INTO admins (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)').run(username, hashPassword(b.password), str(b.display_name, 100), oneOf(b.role, ROLES, 'field'));
    json(res, 201, { id: Number(r.lastInsertRowid) });
  } catch (e) { if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'ชื่อผู้ใช้นี้มีอยู่แล้ว'); throw e; }
});
// Main admin: rename, change role, or reset another account's password
route('PUT', '/api/admin/admins/(\\d+)', async (req, res, [id], __, admin) => {
  const aid = idParam(id), b = await readBody(req, 5000);
  const row = db.prepare('SELECT id, role FROM admins WHERE id = ?').get(aid);
  if (!row) throw new HttpError(404, 'ไม่พบผู้ดูแล');
  tx(db, () => {
    if (b.display_name !== undefined) db.prepare('UPDATE admins SET display_name = ? WHERE id = ?').run(str(b.display_name, 100), aid);
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, 'สิทธิ์ไม่ถูกต้อง');
      if (aid === admin.id && b.role !== 'super') throw new HttpError(400, 'ไม่สามารถลดสิทธิ์ของตัวเองได้');
      if (row.role === 'super' && b.role !== 'super' && superCount() <= 1) throw new HttpError(400, 'ต้องมีผู้ดูแลหลักอย่างน้อย 1 คน');
      db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(b.role, aid);
      if (b.role !== row.role) db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(aid);
    }
    if (b.password !== undefined) {
      if (String(b.password).length < 8) throw new HttpError(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(b.password), aid);
      if (aid !== admin.id) db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(aid);
    }
  });
  json(res, 200, { ok: true });
});
route('PUT', '/api/admin/me/password', async (req, res, _, __, admin) => {
  const b = await readBody(req, 5000);
  const row = db.prepare('SELECT password_hash FROM admins WHERE id = ?').get(admin.id);
  if (!verifyPassword(b.current_password || '', row.password_hash)) throw new HttpError(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (String(b.new_password || '').length < 8) throw new HttpError(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(b.new_password), admin.id);
  // Sign out other sessions
  const token = parseCookies(req)[COOKIE];
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?').run(admin.id, sha256(token));
  json(res, 200, { ok: true });
}, { field: true });
route('DELETE', '/api/admin/admins/(\\d+)', (req, res, [id], __, admin) => {
  const aid = idParam(id);
  if (aid === admin.id) throw new HttpError(400, 'ไม่สามารถลบบัญชีของตัวเองได้');
  if (db.prepare('SELECT role FROM admins WHERE id = ?').get(aid)?.role === 'super' && superCount() <= 1) throw new HttpError(400, 'ต้องมีผู้ดูแลหลักอย่างน้อย 1 คน');
  const r = db.prepare('DELETE FROM admins WHERE id = ?').run(aid);
  if (!r.changes) throw new HttpError(404, 'ไม่พบผู้ดูแล');
  json(res, 200, { ok: true });
});

// ─────────────────────────── static files ───────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
function serveFile(req, res, abs, { cache = 'no-cache', csp = PAGE_CSP } = {}) {
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = {
      ...SECURITY_HEADERS, 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': cache, 'Content-Security-Policy': csp, ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
}
function serveStatic(req, res, pathname) {
  if (pathname === '/' || pathname === '/index.html') return serveFile(req, res, path.join(PUBLIC_DIR, 'index.html'));
  if (pathname === '/admin/') return send(res, 301, '', { Location: '/admin' }); // keep relative asset paths working
  if (pathname === '/admin' || pathname === '/admin.html') return serveFile(req, res, path.join(PUBLIC_DIR, 'admin.html'));
  if (pathname.startsWith('/uploads/')) {
    const abs = path.normalize(path.join(UPLOAD_DIR, pathname.slice(9)));
    if (!abs.startsWith(UPLOAD_DIR + path.sep)) return send(res, 403, 'Forbidden');
    return serveFile(req, res, abs, { cache: 'public, max-age=31536000, immutable', csp: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:" });
  }
  const abs = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!abs.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  serveFile(req, res, abs);
}

// ─────────────────────────── server ───────────────────────────
const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, 'Bad request'); }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, pathname);
  }

  try {
    let matched = false;
    for (const r of routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      matched = true;
      if (r.method !== req.method) continue;
      let admin = null;
      if (pathname.startsWith('/api/admin/')) {
        // CSRF guard: mutating admin calls must carry our custom header (forces a CORS preflight cross-site)
        if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'rattana-help') throw new HttpError(403, 'Forbidden');
        if (!r.public) {
          admin = currentAdmin(req);
          if (!admin) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ');
          // Everything not marked { field: true } is for the main admin team only
          if (admin.role !== 'super' && !r.field) throw new HttpError(403, 'บัญชีทีมภาคสนามไม่มีสิทธิ์ทำรายการนี้');
        }
      }
      return await r.handler(req, res, m.slice(1), url, admin);
    }
    throw new HttpError(matched ? 405 : 404, matched ? 'Method not allowed' : 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { error: e.message });
    console.error(e);
    json(res, 500, { error: 'เกิดข้อผิดพลาดในระบบ' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RATTANA HELP running at http://localhost:${PORT}`);
  console.log(`Admin:  http://localhost:${PORT}/admin`);
  if (seeded) console.log('Demo data seeded (ข้อมูลตัวอย่าง).');
  if (credFile) console.log(`First admin account created — credentials saved to ${credFile}`);
});
