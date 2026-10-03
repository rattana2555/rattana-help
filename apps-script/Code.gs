/**
 * RATTANA HELP — Google Apps Script backend (Google Sheets = database, Google Drive = photos)
 *
 * Setup (once): see apps-script/SETUP.md
 *   1. Create a Google Sheet → Extensions → Apps Script → paste this file
 *   2. Run setup() → allow permissions → read the first admin password in the Execution log
 *   3. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → copy the /exec URL
 *   4. Put that URL in docs/assets/js/config.js → apiUrl
 *
 * The public site reads with GET ?action=data. Every write is a POST with a session token and is checked
 * here for login and role — the web page itself is never trusted.
 */

// Leave empty to generate a random first-admin password (printed in the Execution log by setup()).
var FIRST_ADMIN_PASSWORD = '';
var SESSION_DAYS = 7;
var TZ = 'Asia/Bangkok';

var STATUSES = ['preparing', 'in_transit', 'delivered'];
var STAGES = ['collect', 'prepare', 'transit', 'deliver', 'after'];
var STEPS = ['support', 'collect', 'prepare', 'transit', 'deliver'];
var ROLES = ['super', 'field'];

var TABLES = {
  projects: ['id', 'round_no', 'name', 'summary', 'description', 'status', 'start_date', 'end_date', 'supporters', 'is_published', 'created_at', 'updated_at'],
  locations: ['id', 'project_id', 'code', 'name', 'province_id', 'district_id', 'subdistrict_id', 'village', 'lat', 'lng', 'delivery_date', 'status', 'description', 'beneficiaries', 'households', 'supporters', 'cover_photo_id', 'created_at', 'updated_at'],
  items: ['id', 'location_id', 'name', 'quantity', 'unit', 'sort_order'],
  photos: ['id', 'location_id', 'stage', 'file_id', 'caption', 'taken_date', 'width', 'height', 'sort_order', 'uploaded_by', 'created_at'],
  updates: ['id', 'location_id', 'step', 'update_date', 'note', 'photo_id'],
  provinces: ['id', 'name_th', 'region'],
  districts: ['id', 'province_id', 'name_th'],
  subdistricts: ['id', 'district_id', 'name_th'],
  admins: ['id', 'username', 'password_hash', 'salt', 'display_name', 'role', 'created_at', 'last_login_at']
};
var NUMERIC = ['id', 'project_id', 'province_id', 'district_id', 'subdistrict_id', 'location_id', 'lat', 'lng', 'beneficiaries', 'households', 'cover_photo_id', 'quantity', 'sort_order', 'width', 'height', 'uploaded_by', 'photo_id', 'is_published'];

var PROVINCES = {
  'ภาคเหนือ': ['เชียงใหม่', 'เชียงราย', 'ลำปาง', 'ลำพูน', 'แม่ฮ่องสอน', 'น่าน', 'พะเยา', 'แพร่', 'อุตรดิตถ์'],
  'ภาคตะวันออกเฉียงเหนือ': ['กาฬสินธุ์', 'ขอนแก่น', 'ชัยภูมิ', 'นครพนม', 'นครราชสีมา', 'บึงกาฬ', 'บุรีรัมย์', 'มหาสารคาม', 'มุกดาหาร', 'ยโสธร', 'ร้อยเอ็ด', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อำนาจเจริญ', 'อุดรธานี', 'อุบลราชธานี'],
  'ภาคกลาง': ['กรุงเทพมหานคร', 'กำแพงเพชร', 'ชัยนาท', 'นครนายก', 'นครปฐม', 'นครสวรรค์', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'ลพบุรี', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สระบุรี', 'อ่างทอง', 'อุทัยธานี'],
  'ภาคตะวันออก': ['จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ตราด', 'ปราจีนบุรี', 'ระยอง', 'สระแก้ว'],
  'ภาคตะวันตก': ['กาญจนบุรี', 'ตาก', 'ประจวบคีรีขันธ์', 'เพชรบุรี', 'ราชบุรี'],
  'ภาคใต้': ['กระบี่', 'ชุมพร', 'ตรัง', 'นครศรีธรรมราช', 'นราธิวาส', 'ปัตตานี', 'พังงา', 'พัทลุง', 'ภูเก็ต', 'ระนอง', 'สตูล', 'สงขลา', 'สุราษฎร์ธานี', 'ยะลา']
};

// ───────────────────────── one-time setup ─────────────────────────
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLES).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // store everything as text: no auto date/number conversion
    if (sh.getLastRow() === 0) sh.appendRow(TABLES[name]);
    sh.setFrozenRows(1);
  });
  ss.getSheets().forEach(function (sh) { // drop the empty default sheet
    if (!TABLES[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  if (!rows_('provinces').length) {
    var out = [];
    Object.keys(PROVINCES).forEach(function (region) { PROVINCES[region].forEach(function (p) { out.push({ name_th: p, region: region }); }); });
    insertMany_('provinces', out);
  }
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FOLDER_ID')) {
    props.setProperty('FOLDER_ID', DriveApp.createFolder('RATTANA HELP — ภาพการช่วยเหลือ').getId());
  }
  if (!rows_('admins').length) {
    var pw = FIRST_ADMIN_PASSWORD || Utilities.getUuid().replace(/-/g, '').slice(0, 14);
    var salt = Utilities.getUuid();
    insert_('admins', { username: 'admin', password_hash: hash_(pw, salt), salt: salt, display_name: 'ทีมรัตนไพบูลย์', role: 'super', created_at: now_() });
    Logger.log('First admin → username: admin · password: ' + pw + '  (change it after signing in)');
  }
  clearPublicCache_();
  Logger.log('Setup complete. Photos folder id: ' + props.getProperty('FOLDER_ID'));
}

// Lost the admin password? Run this from the Apps Script editor (only the sheet owner can):
// it gives the "admin" account a new password, prints it in the Execution log and signs out its old sessions.
function resetAdminPassword() {
  var pw = Utilities.getUuid().replace(/-/g, '').slice(0, 14), salt = Utilities.getUuid();
  var a = rows_('admins').filter(function (x) { return x.username === 'admin'; })[0];
  if (a) {
    update_('admins', a.id, { salt: salt, password_hash: hash_(pw, salt), role: 'super' });
    dropSessions_(a.id, null);
  } else {
    insert_('admins', { username: 'admin', password_hash: hash_(pw, salt), salt: salt, display_name: 'ทีมรัตนไพบูลย์', role: 'super', created_at: now_() });
  }
  Logger.log('admin → username: admin · new password: ' + pw + '  (change it after signing in)');
}

// ───────────────────────── web entry points ─────────────────────────
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'data';
    if (action === 'data') return out_({ ok: true, data: publicDataCached_() });
    if (action === 'ping') return out_({ ok: true, data: { time: now_() } });
    throw err_(404, 'Not found');
  } catch (x) { return fail_(x); }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var def = ACTIONS[body.action];
    if (!def) throw err_(404, 'Not found');
    var me = null;
    if (!def.public) {
      me = currentAdmin_(body.token);
      if (!me) throw err_(401, 'กรุณาเข้าสู่ระบบ');
      if (me.role !== 'super' && !def.field) throw err_(403, 'บัญชีทีมภาคสนามไม่มีสิทธิ์ทำรายการนี้');
    }
    var result;
    if (def.write) {
      var lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try { result = def.fn(body, me); clearPublicCache_(); } finally { lock.releaseLock(); }
      return out_({ ok: true, data: { result: result, data: adminData_(me) } });
    }
    return out_({ ok: true, data: def.fn(body, me) });
  } catch (x) { return fail_(x); }
}

var ACTIONS = {
  login: { public: true, fn: login_ },
  logout: { public: true, fn: logout_ },
  adminData: { field: true, fn: function (b, me) { return adminData_(me); } },
  saveProject: { write: true, fn: saveProject_ },
  deleteProject: { write: true, fn: deleteProject_ },
  saveLocation: { write: true, fn: saveLocation_ },
  deleteLocation: { write: true, fn: deleteLocation_ },
  setStatus: { write: true, field: true, fn: setStatus_ },
  fieldUpdate: { write: true, field: true, fn: fieldUpdate_ },
  setCover: { write: true, field: true, fn: setCover_ },
  uploadPhoto: { write: true, field: true, fn: uploadPhoto_ },
  updatePhoto: { write: true, field: true, fn: updatePhoto_ },
  deletePhoto: { write: true, field: true, fn: deletePhoto_ },
  geoAdd: { write: true, fn: geoAdd_ },
  geoRename: { write: true, fn: geoRename_ },
  geoDelete: { write: true, fn: geoDelete_ },
  adminCreate: { write: true, fn: adminCreate_ },
  adminUpdate: { write: true, fn: adminUpdate_ },
  adminDelete: { write: true, fn: adminDelete_ },
  changePassword: { field: true, fn: changePassword_ }
};

function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function err_(status, msg) { var e = new Error(msg); e.status = status; return e; }
function fail_(x) {
  if (!x.status) console.error(x && x.stack || x);
  return out_({ ok: false, status: x.status || 500, error: x.status ? x.message : 'เกิดข้อผิดพลาดในระบบ' });
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

// ───────────────────────── sheet storage ─────────────────────────
var _rows = {};
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function rows_(name) {
  if (_rows[name]) return _rows[name];
  var vals = sheet_(name).getDataRange().getValues();
  var head = vals.shift() || TABLES[name];
  var list = [];
  vals.forEach(function (r, i) {
    if (r[0] === '' || r[0] === null) return;
    var o = { _row: i + 2 };
    head.forEach(function (h, j) {
      var v = r[j];
      if (v === '' || v === null || v === undefined) v = null;
      else if (NUMERIC.indexOf(h) >= 0) { v = Number(v); if (isNaN(v)) v = null; }
      else v = String(v);
      o[h] = v;
    });
    list.push(o);
  });
  _rows[name] = list;
  return list;
}
// Text cells only; a leading quote stops "=…" from ever becoming a formula
function cell_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function nextId_(name) {
  var props = PropertiesService.getScriptProperties(), key = 'SEQ_' + name;
  var cur = Number(props.getProperty(key)) || 0;
  rows_(name).forEach(function (r) { if (r.id > cur) cur = r.id; });
  props.setProperty(key, String(cur + 1));
  return cur + 1;
}
function insert_(name, obj) { return insertMany_(name, [obj])[0]; }
function insertMany_(name, list) {
  if (!list.length) return [];
  var head = TABLES[name], sh = sheet_(name), ids = [];
  var values = list.map(function (o) { o.id = nextId_(name); ids.push(o.id); return head.map(function (h) { return cell_(o[h]); }); });
  sh.getRange(sh.getLastRow() + 1, 1, values.length, head.length).setValues(values);
  delete _rows[name];
  return ids;
}
function find_(name, id) { var list = rows_(name); for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
function update_(name, id, patch) {
  var row = find_(name, id);
  if (!row) return false;
  var head = TABLES[name];
  Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
  sheet_(name).getRange(row._row, 1, 1, head.length).setValues([head.map(function (h) { return cell_(row[h]); })]);
  return true;
}
function deleteWhere_(name, pred) {
  var hit = rows_(name).filter(pred);
  var sh = sheet_(name);
  hit.map(function (r) { return r._row; }).sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
  delete _rows[name];
  return hit;
}

// ───────────────────────── validation ─────────────────────────
function str_(v, max) { if (v === undefined || v === null) return null; var s = String(v).trim().slice(0, max || 500); return s || null; }
function reqStr_(v, label, max) { var s = str_(v, max); if (!s) throw err_(400, 'กรุณาระบุ' + label); return s; }
function int_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? Math.trunc(n) : null; }
function num_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function nonNeg_(v) { return Math.max(0, int_(v) || 0); }
function date_(v) {
  var s = str_(v, 10); if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T00:00:00Z'))) throw err_(400, 'รูปแบบวันที่ไม่ถูกต้อง');
  return s;
}
function oneOf_(v, list, fallback) { return list.indexOf(v) >= 0 ? v : fallback; }
function idParam_(v) { var n = int_(v); if (!n || n < 1) throw err_(400, 'invalid id'); return n; }

// ───────────────────────── auth ─────────────────────────
function hash_(pw, salt) {
  var h = salt + '|' + pw;
  for (var i = 0; i < 400; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  return h;
}
function sha_(s) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function publicAdmin_(a) { return { id: a.id, username: a.username, display_name: a.display_name, role: a.role }; }

function currentAdmin_(token) {
  if (!token) return null;
  var raw = PropertiesService.getScriptProperties().getProperty('S_' + sha_(String(token)));
  if (!raw) return null;
  var s = JSON.parse(raw);
  if (s.e < Date.now()) return null;
  var a = find_('admins', s.a);
  return a ? publicAdmin_(a) : null;
}
function login_(b) {
  var username = String(b.username || '').trim().toLowerCase();
  var cache = CacheService.getScriptCache(), failKey = 'F_' + sha_(username);
  var fails = Number(cache.get(failKey)) || 0;
  if (fails >= 8) throw err_(429, 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที');
  var admin = rows_('admins').filter(function (a) { return a.username === username; })[0];
  if (!admin || hash_(String(b.password || ''), admin.salt) !== admin.password_hash) {
    cache.put(failKey, String(fails + 1), 900);
    throw err_(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
  }
  cache.remove(failKey);
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) { // drop expired sessions
    if (k.indexOf('S_') === 0) { try { if (JSON.parse(all[k]).e < Date.now()) props.deleteProperty(k); } catch (x) { props.deleteProperty(k); } }
  });
  var token = Utilities.getUuid() + Utilities.getUuid();
  props.setProperty('S_' + sha_(token), JSON.stringify({ a: admin.id, e: Date.now() + SESSION_DAYS * 86400000 }));
  update_('admins', admin.id, { last_login_at: now_() });
  return { token: token, me: publicAdmin_(admin), data: adminData_(publicAdmin_(admin)) };
}
function logout_(b) {
  if (b.token) PropertiesService.getScriptProperties().deleteProperty('S_' + sha_(String(b.token)));
  return { ok: true };
}
function dropSessions_(adminId, keepToken) {
  var props = PropertiesService.getScriptProperties(), all = props.getProperties();
  var keep = keepToken ? 'S_' + sha_(String(keepToken)) : null;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0 || k === keep) return;
    try { if (JSON.parse(all[k]).a === adminId) props.deleteProperty(k); } catch (x) { /* ignore */ }
  });
}

// ───────────────────────── datasets ─────────────────────────
function strip_(list, fields) {
  return list.map(function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k !== '_row' && fields.indexOf(k) < 0) o[k] = r[k]; }); return o; });
}
function publicData_() {
  var projects = rows_('projects').filter(function (p) { return p.is_published !== 0; });
  var pids = projects.map(function (p) { return p.id; });
  var locations = rows_('locations').filter(function (l) { return pids.indexOf(l.project_id) >= 0; });
  var lids = locations.map(function (l) { return l.id; });
  var inLoc = function (r) { return lids.indexOf(r.location_id) >= 0; };
  var dIds = locations.map(function (l) { return l.district_id; }), sIds = locations.map(function (l) { return l.subdistrict_id; });
  return {
    projects: strip_(projects, []),
    locations: strip_(locations, []),
    items: strip_(rows_('items').filter(inLoc), []),
    photos: strip_(rows_('photos').filter(inLoc), ['uploaded_by']),
    updates: strip_(rows_('updates').filter(inLoc), []),
    provinces: strip_(rows_('provinces'), []),
    districts: strip_(rows_('districts').filter(function (d) { return dIds.indexOf(d.id) >= 0; }), []),
    subdistricts: strip_(rows_('subdistricts').filter(function (s) { return sIds.indexOf(s.id) >= 0; }), []),
    generated_at: now_()
  };
}
// Public data is cached for 5 minutes (split into 90 KB chunks: CacheService values max 100 KB)
function publicDataCached_() {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('PUB_N'));
  if (n) {
    var keys = []; for (var i = 0; i < n; i++) keys.push('PUB_' + i);
    var parts = cache.getAll(keys);
    if (keys.every(function (k) { return parts[k] !== undefined && parts[k] !== null; })) return JSON.parse(keys.map(function (k) { return parts[k]; }).join(''));
  }
  var data = publicData_(), json = JSON.stringify(data), chunks = {};
  var count = Math.ceil(json.length / 90000) || 1;
  for (var j = 0; j < count; j++) chunks['PUB_' + j] = json.slice(j * 90000, (j + 1) * 90000);
  if (count <= 50) { cache.putAll(chunks, 300); cache.put('PUB_N', String(count), 300); }
  return data;
}
function clearPublicCache_() { CacheService.getScriptCache().remove('PUB_N'); }

function adminData_(me) {
  var people = rows_('admins').map(function (a) { return { id: a.id, name: a.display_name || a.username }; });
  return {
    me: me,
    projects: strip_(rows_('projects'), []),
    locations: strip_(rows_('locations'), []),
    items: strip_(rows_('items'), []),
    photos: strip_(rows_('photos'), []),
    updates: strip_(rows_('updates'), []),
    provinces: strip_(rows_('provinces'), []),
    districts: strip_(rows_('districts'), []),
    subdistricts: strip_(rows_('subdistricts'), []),
    people: people,
    admins: me && me.role === 'super' ? strip_(rows_('admins'), ['password_hash', 'salt']) : []
  };
}

// ───────────────────────── projects ─────────────────────────
function saveProject_(b) {
  var p = b.project || {};
  var v = {
    round_no: reqStr_(p.round_no, 'รอบที่', 20), name: reqStr_(p.name, 'ชื่อโครงการ', 200), summary: str_(p.summary, 500),
    description: str_(p.description, 5000), status: oneOf_(p.status, STATUSES, 'preparing'), start_date: date_(p.start_date),
    end_date: date_(p.end_date), supporters: str_(p.supporters, 1000), is_published: p.is_published === false || p.is_published === 0 ? 0 : 1,
    updated_at: now_()
  };
  if (b.id) {
    if (!update_('projects', idParam_(b.id), v)) throw err_(404, 'ไม่พบโครงการ');
    return { id: idParam_(b.id) };
  }
  v.created_at = now_();
  return { id: insert_('projects', v) };
}
function deleteProject_(b) {
  var pid = idParam_(b.id);
  if (!find_('projects', pid)) throw err_(404, 'ไม่พบโครงการ');
  rows_('locations').filter(function (l) { return l.project_id === pid; }).forEach(function (l) { removeLocation_(l.id); });
  deleteWhere_('projects', function (p) { return p.id === pid; });
  return { ok: true };
}

// ───────────────────────── locations ─────────────────────────
function saveUpdates_(lid, updates) {
  deleteWhere_('updates', function (u) { return u.location_id === lid; });
  var photoIds = rows_('photos').filter(function (p) { return p.location_id === lid; }).map(function (p) { return p.id; });
  var list = [];
  (updates || []).forEach(function (u) {
    if (!u || STEPS.indexOf(u.step) < 0) return;
    if (list.some(function (x) { return x.step === u.step; })) return;
    var d = date_(u.update_date), note = str_(u.note, 1000), photo = int_(u.photo_id);
    if (photo && photoIds.indexOf(photo) < 0) photo = null;
    if (d || note || photo) list.push({ location_id: lid, step: u.step, update_date: d, note: note, photo_id: photo });
  });
  insertMany_('updates', list);
}
function saveLocation_(b) {
  var l = b.location || {}, id = b.id ? idParam_(b.id) : null;
  var projectId = idParam_(l.project_id);
  if (!find_('projects', projectId)) throw err_(400, 'ไม่พบโครงการที่เลือก');
  var provinceId = int_(l.province_id), districtId = int_(l.district_id), subdistrictId = int_(l.subdistrict_id);
  var dist = districtId && find_('districts', districtId), sub = subdistrictId && find_('subdistricts', subdistrictId);
  if (districtId && (!dist || dist.province_id !== provinceId)) throw err_(400, 'อำเภอไม่ตรงกับจังหวัด');
  if (subdistrictId && (!sub || sub.district_id !== districtId)) throw err_(400, 'ตำบลไม่ตรงกับอำเภอ');
  var lat = num_(l.lat), lng = num_(l.lng);
  if ((lat !== null && (lat < -90 || lat > 90)) || (lng !== null && (lng < -180 || lng > 180))) throw err_(400, 'พิกัดไม่ถูกต้อง');
  var code = reqStr_(l.code, 'รหัสจุด', 20);
  if (rows_('locations').some(function (x) { return x.code === code && x.id !== id; })) throw err_(409, 'รหัสจุด #' + code + ' ถูกใช้แล้ว');
  var v = {
    project_id: projectId, code: code, name: reqStr_(l.name, 'ชื่อจุด', 200), province_id: provinceId, district_id: districtId,
    subdistrict_id: subdistrictId, village: str_(l.village, 200), lat: lat, lng: lng, delivery_date: date_(l.delivery_date),
    status: oneOf_(l.status, STATUSES, 'preparing'), description: str_(l.description, 5000), beneficiaries: nonNeg_(l.beneficiaries),
    households: nonNeg_(l.households), supporters: str_(l.supporters, 1000), updated_at: now_()
  };
  if (id) { if (!update_('locations', id, v)) throw err_(404, 'ไม่พบจุดช่วยเหลือ'); }
  else { v.created_at = now_(); id = insert_('locations', v); }
  deleteWhere_('items', function (it) { return it.location_id === id; });
  var items = [];
  (Array.isArray(l.items) ? l.items.slice(0, 100) : []).forEach(function (it, i) {
    var n = str_(it.name, 200); if (n) items.push({ location_id: id, name: n, quantity: Math.max(0, num_(it.quantity) || 0), unit: str_(it.unit, 30), sort_order: i });
  });
  insertMany_('items', items);
  if (Array.isArray(l.updates)) saveUpdates_(id, l.updates);
  return { id: id };
}
function removeLocation_(lid) {
  deleteWhere_('photos', function (p) { return p.location_id === lid; }).forEach(trashFile_);
  deleteWhere_('items', function (i) { return i.location_id === lid; });
  deleteWhere_('updates', function (u) { return u.location_id === lid; });
  deleteWhere_('locations', function (l) { return l.id === lid; });
}
function deleteLocation_(b) {
  var lid = idParam_(b.id);
  if (!find_('locations', lid)) throw err_(404, 'ไม่พบจุดช่วยเหลือ');
  removeLocation_(lid);
  return { ok: true };
}
function setStatus_(b) {
  if (STATUSES.indexOf(b.status) < 0) throw err_(400, 'สถานะไม่ถูกต้อง');
  if (!update_('locations', idParam_(b.id), { status: b.status, updated_at: now_() })) throw err_(404, 'ไม่พบจุดช่วยเหลือ');
  return { ok: true };
}
// What the on-site team may change: status, GPS position, timeline (never name, area or items)
function fieldUpdate_(b) {
  var lid = idParam_(b.id);
  if (!find_('locations', lid)) throw err_(404, 'ไม่พบจุดช่วยเหลือ');
  var patch = { updated_at: now_() };
  if (b.status !== undefined) { if (STATUSES.indexOf(b.status) < 0) throw err_(400, 'สถานะไม่ถูกต้อง'); patch.status = b.status; }
  if (b.lat !== undefined || b.lng !== undefined) {
    var lat = num_(b.lat), lng = num_(b.lng);
    if ((lat === null) !== (lng === null) || (lat !== null && (lat < -90 || lat > 90 || lng < -180 || lng > 180))) throw err_(400, 'พิกัดไม่ถูกต้อง');
    patch.lat = lat; patch.lng = lng;
  }
  update_('locations', lid, patch);
  if (Array.isArray(b.updates)) saveUpdates_(lid, b.updates);
  return { ok: true };
}
function setCover_(b) {
  var lid = idParam_(b.id), pid = int_(b.photo_id);
  if (pid) { var p = find_('photos', pid); if (!p || p.location_id !== lid) throw err_(400, 'ภาพไม่อยู่ในจุดนี้'); }
  if (!update_('locations', lid, { cover_photo_id: pid || null, updated_at: now_() })) throw err_(404, 'ไม่พบจุดช่วยเหลือ');
  return { ok: true };
}

// ───────────────────────── photos (Google Drive) ─────────────────────────
function decodeImage_(dataUrl) {
  var m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw err_(400, 'รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP');
  var bytes = Utilities.base64Decode(m[3]);
  var b = function (i) { return bytes[i] & 0xff; };
  var ok = m[2] === 'jpeg' ? (b(0) === 0xFF && b(1) === 0xD8 && b(2) === 0xFF)
    : m[2] === 'png' ? (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4E && b(3) === 0x47)
      : (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50);
  if (!ok) throw err_(400, 'ไฟล์ภาพไม่ถูกต้อง');
  return { bytes: bytes, mime: m[1], ext: m[2] === 'jpeg' ? 'jpg' : m[2] };
}
function uploadPhoto_(b, me) {
  var p = b.photo || {}, lid = idParam_(p.location_id);
  var loc = find_('locations', lid);
  if (!loc) throw err_(400, 'ไม่พบจุดช่วยเหลือ');
  var img = decodeImage_(p.image);
  var stage = oneOf_(p.stage, STAGES, 'deliver');
  var folder = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var file = folder.createFile(Utilities.newBlob(img.bytes, img.mime, 'loc' + loc.code + '_' + stage + '_' + Date.now() + '.' + img.ext));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (x) { file.setTrashed(true); throw err_(500, 'Google Drive ไม่อนุญาตให้แชร์ภาพแบบ “ทุกคนที่มีลิงก์” — ให้ผู้ดูแล Google Workspace เปิดสิทธิ์นี้ หรือ deploy ด้วยบัญชี Gmail'); }
  var sort = rows_('photos').filter(function (x) { return x.location_id === lid; }).reduce(function (m, x) { return Math.max(m, x.sort_order || 0); }, -1) + 1;
  var id = insert_('photos', {
    location_id: lid, stage: stage, file_id: file.getId(), caption: str_(p.caption, 500), taken_date: date_(p.taken_date),
    width: int_(p.width), height: int_(p.height), sort_order: sort, uploaded_by: me.id, created_at: now_()
  });
  update_('locations', lid, { updated_at: now_() });
  return { id: id, file_id: file.getId() };
}
// Field staff may only edit or delete photos they uploaded themselves
function ownPhoto_(me, pid) {
  var p = find_('photos', pid);
  if (!p) throw err_(404, 'ไม่พบภาพ');
  if (me.role !== 'super' && p.uploaded_by !== me.id) throw err_(403, 'แก้ไขหรือลบได้เฉพาะภาพที่คุณอัปโหลดเอง');
  return p;
}
function updatePhoto_(b, me) {
  var pid = idParam_(b.id);
  ownPhoto_(me, pid);
  update_('photos', pid, { stage: oneOf_(b.stage, STAGES, 'deliver'), caption: str_(b.caption, 500), taken_date: date_(b.taken_date) });
  return { ok: true };
}
function trashFile_(p) { if (p.file_id) { try { DriveApp.getFileById(p.file_id).setTrashed(true); } catch (x) { /* already gone */ } } }
function deletePhoto_(b, me) {
  var pid = idParam_(b.id);
  ownPhoto_(me, pid);
  rows_('locations').filter(function (l) { return l.cover_photo_id === pid; }).forEach(function (l) { update_('locations', l.id, { cover_photo_id: null }); });
  rows_('updates').filter(function (u) { return u.photo_id === pid; }).forEach(function (u) { update_('updates', u.id, { photo_id: null }); });
  deleteWhere_('photos', function (p) { return p.id === pid; }).forEach(trashFile_);
  return { ok: true };
}

// ───────────────────────── geography ─────────────────────────
var GEO = {
  provinces: { label: 'จังหวัด', parent: null },
  districts: { label: 'อำเภอ', parent: 'province_id' },
  subdistricts: { label: 'ตำบล', parent: 'district_id' }
};
function geoKind_(k) { if (!GEO[k]) throw err_(400, 'invalid kind'); return GEO[k]; }
function geoAdd_(b) {
  var g = geoKind_(b.kind), name = reqStr_(b.name_th, 'ชื่อ' + g.label, 100), parentId = g.parent ? idParam_(b[g.parent]) : null;
  if (g.parent && !find_(g.parent === 'province_id' ? 'provinces' : 'districts', parentId)) throw err_(400, 'ไม่พบรายการหลัก');
  if (rows_(b.kind).some(function (r) { return r.name_th === name && (!g.parent || r[g.parent] === parentId); })) throw err_(409, 'มี' + g.label + 'นี้อยู่แล้ว');
  var row = { name_th: name };
  if (g.parent) row[g.parent] = parentId; else row.region = str_(b.region, 50);
  return { id: insert_(b.kind, row), name_th: name };
}
function geoRename_(b) {
  var g = geoKind_(b.kind), id = idParam_(b.id), name = reqStr_(b.name_th, 'ชื่อ' + g.label, 100);
  var cur = find_(b.kind, id);
  if (!cur) throw err_(404, 'ไม่พบ' + g.label);
  if (rows_(b.kind).some(function (r) { return r.id !== id && r.name_th === name && (!g.parent || r[g.parent] === cur[g.parent]); })) throw err_(409, 'มี' + g.label + 'นี้อยู่แล้ว');
  update_(b.kind, id, { name_th: name });
  return { ok: true };
}
function geoDelete_(b) {
  var g = geoKind_(b.kind), id = idParam_(b.id);
  if (!find_(b.kind, id)) throw err_(404, 'ไม่พบ' + g.label);
  var dIds = [], sIds = [];
  if (b.kind === 'provinces') { dIds = rows_('districts').filter(function (d) { return d.province_id === id; }).map(function (d) { return d.id; }); }
  if (b.kind === 'districts') dIds = [id];
  sIds = rows_('subdistricts').filter(function (s) { return dIds.indexOf(s.district_id) >= 0; }).map(function (s) { return s.id; });
  if (b.kind === 'subdistricts') sIds = [id];
  var used = rows_('locations').some(function (l) {
    return (b.kind === 'provinces' && l.province_id === id) || dIds.indexOf(l.district_id) >= 0 || sIds.indexOf(l.subdistrict_id) >= 0;
  });
  if (used) throw err_(409, 'ไม่สามารถลบได้ เนื่องจากมีจุดช่วยเหลือใช้' + g.label + 'นี้อยู่');
  deleteWhere_('subdistricts', function (s) { return sIds.indexOf(s.id) >= 0; });
  deleteWhere_('districts', function (d) { return dIds.indexOf(d.id) >= 0; });
  if (b.kind === 'provinces') deleteWhere_('provinces', function (p) { return p.id === id; });
  return { ok: true };
}

// ───────────────────────── team accounts ─────────────────────────
function superCount_() { return rows_('admins').filter(function (a) { return a.role === 'super'; }).length; }
function adminCreate_(b) {
  var username = reqStr_(b.username, 'ชื่อผู้ใช้', 50).toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw err_(400, 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (อย่างน้อย 3 ตัว)');
  if (String(b.password || '').length < 8) throw err_(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
  if (rows_('admins').some(function (a) { return a.username === username; })) throw err_(409, 'ชื่อผู้ใช้นี้มีอยู่แล้ว');
  var salt = Utilities.getUuid();
  return { id: insert_('admins', { username: username, password_hash: hash_(String(b.password), salt), salt: salt, display_name: str_(b.display_name, 100), role: oneOf_(b.role, ROLES, 'field'), created_at: now_() }) };
}
function adminUpdate_(b, me) {
  var id = idParam_(b.id), row = find_('admins', id);
  if (!row) throw err_(404, 'ไม่พบผู้ดูแล');
  var oldRole = row.role; // update_ mutates the cached row
  var patch = {};
  if (b.display_name !== undefined) patch.display_name = str_(b.display_name, 100);
  if (b.role !== undefined) {
    if (ROLES.indexOf(b.role) < 0) throw err_(400, 'สิทธิ์ไม่ถูกต้อง');
    if (id === me.id && b.role !== 'super') throw err_(400, 'ไม่สามารถลดสิทธิ์ของตัวเองได้');
    if (row.role === 'super' && b.role !== 'super' && superCount_() <= 1) throw err_(400, 'ต้องมีผู้ดูแลหลักอย่างน้อย 1 คน');
    patch.role = b.role;
  }
  if (b.password !== undefined) {
    if (String(b.password).length < 8) throw err_(400, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    patch.salt = Utilities.getUuid();
    patch.password_hash = hash_(String(b.password), patch.salt);
  }
  update_('admins', id, patch);
  if ((patch.role && patch.role !== oldRole) || (patch.password_hash && id !== me.id)) dropSessions_(id, null);
  return { ok: true };
}
function adminDelete_(b, me) {
  var id = idParam_(b.id), row = find_('admins', id);
  if (id === me.id) throw err_(400, 'ไม่สามารถลบบัญชีของตัวเองได้');
  if (!row) throw err_(404, 'ไม่พบผู้ดูแล');
  if (row.role === 'super' && superCount_() <= 1) throw err_(400, 'ต้องมีผู้ดูแลหลักอย่างน้อย 1 คน');
  deleteWhere_('admins', function (a) { return a.id === id; });
  dropSessions_(id, null);
  return { ok: true };
}
function changePassword_(b, me) {
  var row = find_('admins', me.id);
  if (hash_(String(b.current_password || ''), row.salt) !== row.password_hash) throw err_(400, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
  if (String(b.new_password || '').length < 8) throw err_(400, 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
  var salt = Utilities.getUuid();
  update_('admins', me.id, { salt: salt, password_hash: hash_(String(b.new_password), salt) });
  dropSessions_(me.id, b.token);
  return { ok: true };
}
