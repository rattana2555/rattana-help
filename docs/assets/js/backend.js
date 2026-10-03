// RATTANA HELP — Google Apps Script backend adapter
// When RH_CONFIG.apiUrl is set (GitHub Pages hosting), every RH.api('/api/…') call the site makes is answered here:
// reads are computed in the browser from one dataset (Google Sheets), writes go to Apps Script, which checks
// the login and role. With apiUrl empty the site talks to the Node server (server.js) as before.
(function () {
  'use strict';
  const CFG = window.RH_CONFIG || {};
  if (!CFG.apiUrl) return;
  const RH = window.RH;

  class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const TOKEN_KEY = 'rh_token', PUB_KEY = 'rh_public_v1';
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  };
  const token = () => store.get(TOKEN_KEY) || '';

  // ── transport (text/plain POST = no CORS preflight, which Apps Script can't answer) ──
  async function unwrap(res) {
    let j;
    try { j = await res.json(); } catch { throw new HttpErr(502, 'เชื่อมต่อระบบข้อมูลไม่สำเร็จ'); }
    if (!j.ok) { if (j.status === 401) store.set(TOKEN_KEY, null); throw new HttpErr(j.status || 500, j.error || 'เกิดข้อผิดพลาด'); }
    return j.data;
  }
  // Reads retry: Apps Script now and then answers with a temporary HTML error page instead of JSON
  async function gasGet(action, tries = 3) {
    for (let i = 1; ; i++) {
      try { return await fetch(`${CFG.apiUrl}?action=${encodeURIComponent(action)}`).then(unwrap); }
      catch (e) { if (i >= tries || (e.status && e.status < 500)) throw e; await new Promise(r => setTimeout(r, 700 * i)); }
    }
  }
  const gasPost = (action, payload = {}) => fetch(CFG.apiUrl, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, action, token: token() }),
  }).then(unwrap);

  // ── public dataset: never make a visitor wait for Apps Script (1–10 s) ──
  // 1. returning visitor → last data from localStorage, instantly
  // 2. first visit → data/snapshot.json published with the site (GitHub Action, every 10 min), ~0.2 s
  // 3. always → live data from Apps Script in the background; if it differs, 'rh:data-updated' fires
  let pub = null, pubKey = '', pubAt = 0, pubLoading = null, adm = null;
  const CACHE_MAX = 7 * 86400_000;
  function setPub(raw, live) {
    const { generated_at, ...rest } = raw || {};
    const key = JSON.stringify(rest);
    if (live) { pubAt = Date.now(); store.set(PUB_KEY, JSON.stringify({ t: pubAt, d: rest })); }
    if (key === pubKey) return false;
    const had = !!pub;
    pub = build(JSON.parse(key), false);
    pubKey = key;
    if (had) window.dispatchEvent(new CustomEvent('rh:data-updated'));
    return true;
  }
  function refreshPublic() {
    if (!pubLoading) pubLoading = gasGet('data').then(d => { setPub(d, true); return pub; }).finally(() => { pubLoading = null; });
    return pubLoading;
  }
  async function publicData() {
    if (pub) { if (Date.now() - pubAt > 60_000) refreshPublic().catch(() => {}); return pub; }
    try {
      const c = JSON.parse(store.get(PUB_KEY) || 'null');
      if (c && Date.now() - c.t < CACHE_MAX) { setPub(c.d, false); refreshPublic().catch(() => {}); return pub; }
    } catch { /* ignore */ }
    const live = refreshPublic();
    const snap = fetch('data/snapshot.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('no snapshot'))))
      .then(d => { if (!pub) setPub(d, false); return pub; });
    return Promise.any([snap, live]).catch(() => live); // whichever arrives first; live error surfaces if both fail
  }

  async function adminData() {
    if (adm) return adm;
    if (!token()) throw new HttpErr(401, 'กรุณาเข้าสู่ระบบ');
    adm = build(await gasPost('adminData'), true);
    return adm;
  }
  async function write(action, payload) {
    const r = await gasPost(action, payload);
    adm = build(r.data, true);
    pub = null; pubKey = ''; store.set(PUB_KEY, null);
    return r.result;
  }

  // ── joins (mirror of the SQL in server.js) ──
  const photoUrl = (p, w) => p.file_id ? `https://lh3.googleusercontent.com/d/${encodeURIComponent(p.file_id)}=w${w}` : null;
  const byKey = (list, k = 'id') => new Map(list.map(x => [x[k], x]));
  const desc = (a, b) => (a == null ? '' : String(a)) < (b == null ? '' : String(b)) ? 1 : (a == null ? '' : String(a)) > (b == null ? '' : String(b)) ? -1 : 0;
  const STAGE_ORDER = { collect: 1, prepare: 2, transit: 3, deliver: 4, after: 5 };

  function build(d, isAdmin) {
    const db = {
      isAdmin, me: d.me || null, api_version: d.api_version || 1,
      projects: d.projects || [], locations: d.locations || [], items: d.items || [], photos: d.photos || [], updates: d.updates || [],
      provinces: d.provinces || [], districts: d.districts || [], subdistricts: d.subdistricts || [], admins: d.admins || [],
    };
    db.projects.forEach(p => { if (!p.category) p.category = 'flood'; });
    const P = byKey(db.projects), PV = byKey(db.provinces), D = byKey(db.districts), S = byKey(db.subdistricts);
    const people = new Map((d.people || []).map(x => [x.id, x.name]));
    const L = byKey(db.locations);
    db.photos.forEach(p => {
      const l = L.get(p.location_id) || {}, pr = P.get(l.project_id) || {};
      Object.assign(p, {
        file_path: p.file_path || photoUrl(p, 1920), thumb_path: p.thumb_path || photoUrl(p, 640),
        location_code: l.code, location_name: l.name, project_id: l.project_id, round_no: pr.round_no, project_name: pr.name, project_category: pr.category || 'flood',
        province: PV.get(l.province_id)?.name_th || null, district: D.get(l.district_id)?.name_th || null, subdistrict: S.get(l.subdistrict_id)?.name_th || null,
        province_id: l.province_id, district_id: l.district_id, subdistrict_id: l.subdistrict_id, _delivery: l.delivery_date,
        uploader_name: isAdmin ? (people.get(p.uploaded_by) || null) : undefined,
      });
      if (!isAdmin) delete p.uploader_name;
    });
    const photosBy = new Map(), itemsBy = new Map();
    db.photos.forEach(p => { (photosBy.get(p.location_id) || photosBy.set(p.location_id, []).get(p.location_id)).push(p); });
    db.items.forEach(i => { (itemsBy.get(i.location_id) || itemsBy.set(i.location_id, []).get(i.location_id)).push(i); });
    db.locations.forEach(l => {
      const pr = P.get(l.project_id) || {};
      const ph = photosBy.get(l.id) || [];
      const fallback = [...ph].sort((a, b) => ((b.stage === 'deliver') - (a.stage === 'deliver')) || ((a.sort_order || 0) - (b.sort_order || 0)) || (a.id - b.id))[0];
      const cover = ph.find(p => p.id === l.cover_photo_id) || fallback;
      Object.assign(l, {
        round_no: pr.round_no, project_name: pr.name, project_status: pr.status, project_category: pr.category || 'flood',
        province: PV.get(l.province_id)?.name_th || null, district: D.get(l.district_id)?.name_th || null, subdistrict: S.get(l.subdistrict_id)?.name_th || null,
        cover_thumb: cover ? cover.thumb_path : null, cover_url: cover ? cover.file_path : null,
        photo_count: ph.length, items_total: (itemsBy.get(l.id) || []).reduce((s, i) => s + (i.quantity || 0), 0),
      });
    });
    db.P = P; db.L = L; db.photosBy = photosBy; db.itemsBy = itemsBy;
    return db;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const sortLocs = list => [...list].sort((a, b) => desc(a.delivery_date, b.delivery_date) || desc(a.code, b.code));

  function stats(db) {
    const del = db.locations.filter(l => l.status === 'delivered');
    const delIds = new Set(del.map(l => l.id));
    return {
      delivered_locations: del.length,
      areas: new Set(del.map(l => l.subdistrict_id ?? -l.id)).size,
      provinces: new Set(del.map(l => l.province_id).filter(x => x != null)).size,
      rounds_delivered: new Set(del.map(l => l.project_id)).size,
      beneficiaries: del.reduce((s, l) => s + (l.beneficiaries || 0), 0),
      households: del.reduce((s, l) => s + (l.households || 0), 0),
      items_delivered: db.items.filter(i => delIds.has(i.location_id)).reduce((s, i) => s + (i.quantity || 0), 0),
      rounds_total: db.projects.length, photos: db.photos.length,
      updated_at: db.locations.reduce((m, l) => (l.updated_at && l.updated_at > m ? l.updated_at : m), '') || null,
      status: {
        preparing: db.locations.filter(l => l.status === 'preparing').length,
        in_transit: db.locations.filter(l => l.status === 'in_transit').length,
        delivered: del.length, total: db.locations.length,
      },
    };
  }

  function projectAggregates(db) {
    return [...db.projects].sort((a, b) => desc(a.start_date || a.created_at, b.start_date || b.created_at) || (b.id - a.id)).map(p => {
      const locs = db.locations.filter(l => l.project_id === p.id), del = locs.filter(l => l.status === 'delivered');
      const ids = new Set(locs.map(l => l.id));
      const ph = db.photos.filter(x => ids.has(x.location_id));
      const covers = new Set(locs.map(l => l.cover_photo_id));
      const cover = [...ph].sort((a, b) => (covers.has(b.id) - covers.has(a.id)) || ((b.stage === 'deliver') - (a.stage === 'deliver')) || (a.id - b.id))[0];
      const dates = locs.map(l => l.delivery_date).filter(Boolean).sort();
      return {
        ...p,
        location_count: locs.length, delivered_count: del.length,
        beneficiaries: del.reduce((s, l) => s + (l.beneficiaries || 0), 0),
        beneficiaries_planned: locs.reduce((s, l) => s + (l.beneficiaries || 0), 0),
        items_total: db.items.filter(i => ids.has(i.location_id)).reduce((s, i) => s + (i.quantity || 0), 0),
        photo_count: ph.length,
        provinces: [...new Set(locs.map(l => l.province).filter(Boolean))].join(', ') || null,
        first_date: dates[0] || null, last_date: dates.at(-1) || null,
        cover_thumb: cover ? cover.thumb_path : null,
      };
    });
  }

  const photoSort = (a, b) => (STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]) || ((a.sort_order || 0) - (b.sort_order || 0)) || (a.id - b.id);
  function locationDetail(db, id) {
    const l = db.L.get(id);
    if (!l) throw new HttpErr(404, 'ไม่พบจุดช่วยเหลือ');
    const out = clone(l);
    out.items = (db.itemsBy.get(id) || []).slice().sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id)).map(i => ({ id: i.id, name: i.name, quantity: i.quantity, unit: i.unit }));
    out.photos = clone((db.photosBy.get(id) || []).slice().sort(photoSort));
    out.updates = db.updates.filter(u => u.location_id === id).map(u => ({ step: u.step, update_date: u.update_date, note: u.note, photo_id: u.photo_id }));
    out.siblings = sortLocs(db.locations.filter(s => s.project_id === l.project_id && s.id !== id))
      .map(s => ({ id: s.id, code: s.code, name: s.name, status: s.status, delivery_date: s.delivery_date, province: s.province, district: s.district, subdistrict: s.subdistrict, cover_thumb: s.cover_thumb }));
    return out;
  }

  function photoQuery(db, q) {
    const n = k => Number(q.get(k)) || 0;
    const from = q.get('date_from'), to = q.get('date_to'), stage = q.get('stage'), cat = q.get('category');
    const list = db.photos.filter(p =>
      (!n('province_id') || p.province_id === n('province_id')) && (!n('district_id') || p.district_id === n('district_id')) &&
      (!n('subdistrict_id') || p.subdistrict_id === n('subdistrict_id')) && (!n('project_id') || p.project_id === n('project_id')) &&
      (!n('location_id') || p.location_id === n('location_id')) && (!stage || p.stage === stage) && (!cat || p.project_category === cat) &&
      (!from || (p.taken_date || p._delivery || '') >= from) && (!to || (p.taken_date || p._delivery || '') <= to))
      .sort((a, b) => desc(a.taken_date || a._delivery, b.taken_date || b._delivery) || (b.location_id - a.location_id) || ((a.sort_order || 0) - (b.sort_order || 0)) || (a.id - b.id));
    const limit = Math.min(Math.max(n('limit') || 30, 1), 200), offset = Math.max(n('offset'), 0);
    return { total: list.length, limit, offset, photos: clone(list.slice(offset, offset + limit)) };
  }

  function impact(db) {
    const del = db.locations.filter(l => l.status === 'delivered');
    const byProv = new Map();
    del.forEach(l => {
      if (l.province_id == null) return;
      const r = byProv.get(l.province_id) || { province: l.province, locations: 0, beneficiaries: 0, items: 0 };
      r.locations++; r.beneficiaries += l.beneficiaries || 0; r.items += l.items_total || 0;
      byProv.set(l.province_id, r);
    });
    const delIds = new Set(del.map(l => l.id)), byItem = new Map();
    db.items.filter(i => delIds.has(i.location_id)).forEach(i => {
      const k = `${i.name}\u0000${i.unit || ''}`;
      const r = byItem.get(k) || { name: i.name, unit: i.unit, quantity: 0, _locs: new Set() };
      r.quantity += i.quantity || 0; r._locs.add(i.location_id); byItem.set(k, r);
    });
    const byCat = new Map();
    db.projects.forEach(p => {
      const r = byCat.get(p.category) || { category: p.category, projects: 0, delivered: 0, beneficiaries: 0 };
      r.projects++;
      db.locations.filter(l => l.project_id === p.id && l.status === 'delivered').forEach(l => { r.delivered++; r.beneficiaries += l.beneficiaries || 0; });
      byCat.set(p.category, r);
    });
    return {
      stats: stats(db),
      byCategory: [...byCat.values()].sort((a, b) => b.beneficiaries - a.beneficiaries || b.projects - a.projects),
      byProvince: [...byProv.values()].sort((a, b) => b.beneficiaries - a.beneficiaries),
      byItem: [...byItem.values()].map(r => ({ name: r.name, unit: r.unit, quantity: r.quantity, locations: r._locs.size })).sort((a, b) => b.quantity - a.quantity).slice(0, 12),
      projects: projectAggregates(db),
      recent: clone(sortLocs(db.locations).slice(0, 6)),
    };
  }

  function filters(db) {
    const withPhotos = new Set(db.photos.map(p => p.location_id));
    const locs = db.locations.filter(l => withPhotos.has(l.id));
    const uniq = (arr, key) => [...new Map(arr.filter(x => x[key] != null).map(x => [x[key], x])).values()];
    return {
      provinces: uniq(locs, 'province_id').map(l => ({ id: l.province_id, name: l.province })).sort((a, b) => a.name.localeCompare(b.name, 'th')),
      districts: uniq(locs, 'district_id').map(l => ({ id: l.district_id, name: l.district, province_id: l.province_id })).sort((a, b) => a.name.localeCompare(b.name, 'th')),
      categories: [...new Set(locs.map(l => l.project_category).filter(Boolean))],
      projects: uniq(locs, 'project_id').map(l => ({ id: l.project_id, round_no: l.round_no, name: l.project_name })).sort((a, b) => desc(a.round_no, b.round_no)),
    };
  }

  const geo = db => ({
    provinces: () => [...db.provinces].sort((a, b) => a.name_th.localeCompare(b.name_th, 'th')).map(p => ({ id: p.id, name_th: p.name_th, region: p.region })),
    districts: pid => db.districts.filter(d => d.province_id === pid).sort((a, b) => a.name_th.localeCompare(b.name_th, 'th')),
    subdistricts: did => db.subdistricts.filter(s => s.district_id === did).sort((a, b) => a.name_th.localeCompare(b.name_th, 'th')),
  });

  // ── router: same paths and responses as server.js ──
  const ROUTES = [];
  const on = (method, pattern, fn) => ROUTES.push({ method, re: new RegExp(`^${pattern}$`), fn });

  // public
  on('GET', '/api/stats', async () => stats(await publicData()));
  on('GET', '/api/impact', async () => impact(await publicData()));
  on('GET', '/api/projects', async () => projectAggregates(await publicData()));
  on('GET', '/api/projects/(\\d+)', async ([id]) => {
    const db = await publicData();
    const p = projectAggregates(db).find(x => x.id === +id);
    if (!p) throw new HttpErr(404, 'ไม่พบโครงการ');
    p.locations = clone(sortLocs(db.locations.filter(l => l.project_id === p.id)));
    p.photos = clone(db.photos.filter(x => x.project_id === p.id).sort((a, b) => desc(a.taken_date || a._delivery, b.taken_date || b._delivery) || (a.id - b.id)).slice(0, 24));
    return p;
  });
  on('GET', '/api/locations', async () => clone(sortLocs((await publicData()).locations)));
  on('GET', '/api/locations/(\\d+)', async ([id]) => locationDetail(await publicData(), +id));
  on('GET', '/api/photos', async (_, q) => photoQuery(await publicData(), q));
  on('GET', '/api/filters', async () => filters(await publicData()));
  on('GET', '/api/geo/provinces', async () => geo(adm || await publicData()).provinces());
  on('GET', '/api/geo/districts', async (_, q) => geo(adm || await publicData()).districts(Number(q.get('province_id'))));
  on('GET', '/api/geo/subdistricts', async (_, q) => geo(adm || await publicData()).subdistricts(Number(q.get('district_id'))));

  // auth
  on('POST', '/api/admin/login', async (_, __, b) => {
    const r = await gasPost('login', { username: b.username, password: b.password });
    store.set(TOKEN_KEY, r.token);
    adm = build(r.data, true);
    return r.me;
  });
  on('POST', '/api/admin/logout', async () => { await gasPost('logout').catch(() => {}); store.set(TOKEN_KEY, null); adm = null; return { ok: true }; });
  on('GET', '/api/admin/me', async () => (await adminData()).me);

  // admin reads
  on('GET', '/api/admin/dashboard', async () => {
    const db = await adminData();
    return { stats: stats(db), recent: clone([...db.locations].sort((a, b) => desc(a.updated_at, b.updated_at)).slice(0, 8)) };
  });
  on('GET', '/api/admin/projects', async () => projectAggregates(await adminData()));
  on('GET', '/api/admin/locations', async () => clone(sortLocs((await adminData()).locations)));
  on('GET', '/api/admin/locations/next-code', async () => {
    const max = (await adminData()).locations.reduce((m, l) => (/^\d+$/.test(l.code) ? Math.max(m, Number(l.code)) : m), 0);
    return { code: String(max + 1).padStart(3, '0') };
  });
  on('GET', '/api/admin/locations/(\\d+)', async ([id]) => locationDetail(await adminData(), +id));
  on('GET', '/api/admin/photos', async (_, q) => photoQuery(await adminData(), q));
  on('GET', '/api/admin/admins', async () => clone((await adminData()).admins));
  on('GET', '/api/admin/meta', async () => ({ backend: 'apps-script', api_version: (await adminData()).api_version }));

  // admin writes (Apps Script checks login + role for every one)
  on('POST', '/api/admin/projects', async (_, __, b) => write('saveProject', { project: b }));
  on('PUT', '/api/admin/projects/(\\d+)', async ([id], __, b) => write('saveProject', { id: +id, project: b }));
  on('DELETE', '/api/admin/projects/(\\d+)', async ([id]) => write('deleteProject', { id: +id }));
  on('POST', '/api/admin/locations', async (_, __, b) => write('saveLocation', { location: b }));
  on('PUT', '/api/admin/locations/(\\d+)', async ([id], __, b) => write('saveLocation', { id: +id, location: b }));
  on('DELETE', '/api/admin/locations/(\\d+)', async ([id]) => write('deleteLocation', { id: +id }));
  on('PATCH', '/api/admin/locations/(\\d+)/status', async ([id], __, b) => write('setStatus', { id: +id, status: b.status }));
  on('PATCH', '/api/admin/locations/(\\d+)/field', async ([id], __, b) => write('fieldUpdate', { ...b, id: +id }));
  on('PUT', '/api/admin/locations/(\\d+)/cover', async ([id], __, b) => write('setCover', { id: +id, photo_id: b.photo_id }));
  on('POST', '/api/admin/photos', async (_, __, b) => { const { thumb, ...photo } = b; return write('uploadPhoto', { photo }); }); // Drive resizes on the fly; no thumb file needed
  on('PUT', '/api/admin/photos/(\\d+)', async ([id], __, b) => write('updatePhoto', { ...b, id: +id }));
  on('DELETE', '/api/admin/photos/(\\d+)', async ([id]) => write('deletePhoto', { id: +id }));
  on('POST', '/api/admin/(provinces|districts|subdistricts)', async ([kind], __, b) => write('geoAdd', { ...b, kind }));
  on('PUT', '/api/admin/(provinces|districts|subdistricts)/(\\d+)', async ([kind, id], __, b) => write('geoRename', { ...b, kind, id: +id }));
  on('DELETE', '/api/admin/(provinces|districts|subdistricts)/(\\d+)', async ([kind, id]) => write('geoDelete', { kind, id: +id }));
  on('POST', '/api/admin/admins', async (_, __, b) => write('adminCreate', b));
  on('PUT', '/api/admin/admins/(\\d+)', async ([id], __, b) => write('adminUpdate', { ...b, id: +id }));
  on('DELETE', '/api/admin/admins/(\\d+)', async ([id]) => write('adminDelete', { id: +id }));
  on('PUT', '/api/admin/me/password', async (_, __, b) => gasPost('changePassword', b));

  RH.api = async function (path, { method = 'GET', body } = {}) {
    const [p, qs = ''] = String(path).split('?');
    for (const r of ROUTES) {
      const m = r.re.exec(p);
      if (m && r.method === method) return r.fn(m.slice(1), new URLSearchParams(qs), body || {});
    }
    throw new HttpErr(404, 'Not found');
  };
  RH.backend = 'apps-script';
  // Start loading data as soon as possible (public pages only)
  if (!/admin(\.html)?$/.test(location.pathname)) publicData().catch(() => {});
})();
