// RATTANA HELP — Admin dashboard
(function () {
  'use strict';
  const { api, esc, fmtNum, fmtDate, areaText, STATUS, STAGES, STEPS, CATEGORIES, category, catChip, statusChip, icon, SearchSelect, Lightbox, makeMap, pinIcon, setPinSelected, toast, todayISO, CFG } = window.RH;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let main = $('#adm');
  let me = null;
  let cleanups = [];
  let renderId = 0;
  const onCleanup = fn => cleanups.push(fn);
  // Roles: 'super' = main admin team (everything) · 'field' = on-site team (photos, status, GPS, timeline)
  const isSuper = () => !!me && me.role === 'super';
  const ROLE_LABEL = { super: 'ผู้ดูแลหลัก', field: 'ทีมภาคสนาม' };
  const STATUS_KEYS = ['preparing', 'in_transit', 'delivered'];
  const COMMON_ITEMS = ['น้ำดื่ม (แพ็ค 12 ขวด)', 'ข้าวสาร 5 กก.', 'อาหารแห้ง', 'บะหมี่กึ่งสำเร็จรูป', 'ปลากระป๋อง', 'ถุงยังชีพ', 'ของใช้จำเป็น', 'ยาสามัญประจำบ้าน', 'ผ้าห่ม', 'นมกล่อง', 'ผ้าอนามัย', 'แพมเพิส'];
  const COMMON_UNITS = ['แพ็ค', 'ถุง', 'ชุด', 'ลัง', 'ขวด', 'กล่อง', 'ผืน', 'ชิ้น', 'กระสอบ'];

  // ─────────────── infra ───────────────
  const setLoading = on => { $('#loadingBar').style.width = on ? '85%' : '0'; };
  async function call(path, opts) {
    setLoading(true);
    try { return await api(path, opts); }
    catch (e) { if (e.status === 401 && me) { me = null; showLogin('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); } throw e; }
    finally { setLoading(false); }
  }
  const fail = e => toast(e.message || 'เกิดข้อผิดพลาด', 'error');

  // Modal (company standard)
  const overlay = $('#modal');
  let modalResolve = null, modalSubmit = null;
  function modal({ title, body, submit = 'บันทึก', danger = false, size = '', cancel = 'ยกเลิก', onOpen, onSubmit }) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modalForm').className = `modal ${size}`;
    $('#modalFoot').innerHTML = `${cancel ? `<button type="button" class="btn btn-outline" data-close>${esc(cancel)}</button>` : ''}${submit ? `<button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary btn-navy'}">${esc(submit)}</button>` : ''}`;
    overlay.classList.add('open');
    modalSubmit = onSubmit;
    onOpen && onOpen($('#modalBody'));
    setTimeout(() => $('#modalBody input:not([type=hidden]), #modalBody textarea, #modalBody button')?.focus(), 30);
    return new Promise(res => { modalResolve = res; });
  }
  function closeModal(v) { overlay.classList.remove('open'); modalResolve && modalResolve(v); modalResolve = null; modalSubmit = null; }
  $('#modalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#modalFoot button[type=submit]');
    if (!modalSubmit) return closeModal(true);
    btn && (btn.disabled = true);
    try { const r = await modalSubmit($('#modalForm')); if (r !== false) closeModal(r ?? true); }
    catch (err) { fail(err); }
    finally { btn && (btn.disabled = false); }
  });
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) closeModal(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(false); });
  const confirmBox = (msg, ok = 'ลบ') => modal({ title: 'ยืนยัน', body: `<p>${msg}</p>`, submit: ok, danger: true, size: 'sm' });

  // Sortable table (company standard: default latest date first, clickable headers ▲▼)
  function sortRows(rows, col, dir) {
    const m = dir === 'asc' ? 1 : -1;
    const val = col.sortVal || (r => r[col.key]);
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (col.type === 'num') return ((parseFloat(va) || 0) - (parseFloat(vb) || 0)) * m;
      if (col.type === 'date') return String(va || '').localeCompare(String(vb || '')) * m;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'th', { numeric: true }) * m;
    });
  }
  function table(el, { cols, rows, sort, empty = 'ไม่พบข้อมูล', onRender }) {
    const st = { ...sort };
    let data = rows;
    function draw() {
      const col = cols.find(c => c.key === st.key) || cols[0];
      const sorted = sortRows(data, col, st.dir);
      el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => {
        const s = c.sortable !== false;
        return `<th${s ? ` data-key="${c.key}" data-type="${c.type || 'str'}"` : ''}${c.align ? ` style="text-align:${c.align}"` : ''}>${c.label}${s ? `<span class="sort-ind">${st.key === c.key ? (st.dir === 'asc' ? '▲' : '▼') : ''}</span>` : ''}</th>`;
      }).join('')}</tr></thead><tbody>${sorted.length
        ? sorted.map(r => `<tr data-id="${r.id}">${cols.map(c => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}</tr>`).join('')
        : `<tr class="empty-row"><td colspan="${cols.length}">${empty}</td></tr>`}</tbody></table></div>`;
      $$('th[data-key]', el).forEach(th => th.onclick = () => {
        const k = th.dataset.key, t = th.dataset.type;
        if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
        else { st.key = k; st.dir = (t === 'date' || t === 'num') ? 'desc' : 'asc'; }
        draw();
      });
      onRender && onRender(el);
    }
    draw();
    return { set(rows) { data = rows; draw(); } };
  }

  const statusSelect = (id, s) => `<select class="status-select s-${s}" data-status-for="${id}" aria-label="สถานะ">${STATUS_KEYS.map(k => `<option value="${k}"${k === s ? ' selected' : ''}>${STATUS[k].icon} ${STATUS[k].label}</option>`).join('')}</select>`;
  function bindStatusSelects(root, after) {
    $$('[data-status-for]', root).forEach(sel => sel.onchange = async () => {
      try {
        await call(`/api/admin/locations/${sel.dataset.statusFor}/status`, { method: 'PATCH', body: { status: sel.value } });
        sel.className = `status-select s-${sel.value}`;
        toast(`อัปเดตสถานะเป็น “${STATUS[sel.value].label}” แล้ว`, 'success');
        after && after(Number(sel.dataset.statusFor), sel.value);
      } catch (e) { fail(e); }
    });
  }

  const thumb = src => src ? `<img class="thumb" src="${esc(src)}" alt="" loading="lazy">` : `<div class="thumb"></div>`;

  // Geography cache
  const geoCache = { provinces: null, districts: new Map(), subdistricts: new Map() };
  async function provinces(force) { if (!geoCache.provinces || force) geoCache.provinces = await call('/api/geo/provinces'); return geoCache.provinces; }
  async function districts(pid, force) { if (!pid) return []; if (!geoCache.districts.has(pid) || force) geoCache.districts.set(pid, await call(`/api/geo/districts?province_id=${pid}`)); return geoCache.districts.get(pid); }
  async function subdistricts(did, force) { if (!did) return []; if (!geoCache.subdistricts.has(did) || force) geoCache.subdistricts.set(did, await call(`/api/geo/subdistricts?district_id=${did}`)); return geoCache.subdistricts.get(did); }
  function resetGeoCache() { geoCache.provinces = null; geoCache.districts.clear(); geoCache.subdistricts.clear(); }

  async function promptName(title, label, value = '') {
    let out = null;
    const ok = await modal({
      title, size: 'sm',
      body: `<label class="field"><span>${esc(label)} <span class="req">*</span></span><input class="input" name="name" value="${esc(value)}" maxlength="100" required></label>`,
      onSubmit: f => { const v = f.name.value.trim(); if (!v) { toast(`กรุณาระบุ${label}`, 'warning'); return false; } out = v; return true; },
    });
    return ok ? out : null;
  }

  // ─────────────── auth ───────────────
  function showLogin(msg) {
    $('#appScreen').hidden = true; $('#loginScreen').hidden = false;
    const err = $('#loginError'); err.hidden = !msg; err.textContent = msg || '';
    $('#loginForm [name=username]').focus();
  }
  function showApp() {
    $('#loginScreen').hidden = true; $('#appScreen').hidden = false;
    $('#userName').textContent = `${me.display_name || me.username} · ${ROLE_LABEL[me.role] || ''}`;
    $$('.adm-tab').forEach(t => { t.hidden = !isSuper() && ['projects', 'areas'].includes(t.dataset.tab); });
    $('.adm-tab[data-tab="admins"]').textContent = isSuper() ? 'ผู้ดูแลระบบ' : 'บัญชีของฉัน';
    route();
  }
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';
    try {
      me = await call('/api/admin/login', { method: 'POST', body: { username: f.username.value, password: f.password.value } });
      f.password.value = '';
      showApp();
      toast(`ยินดีต้อนรับ ${me.display_name || me.username}`, 'success');
    } catch (err) { $('#loginError').hidden = false; $('#loginError').textContent = err.message; }
    finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
  });
  $('#btnUser').onclick = async () => {
    const ok = await modal({ title: 'ออกจากระบบ', size: 'sm', body: `<p>ออกจากระบบบัญชี <b>${esc(me.username)}</b> ?</p>`, submit: 'ออกจากระบบ', danger: true });
    if (!ok) return;
    await call('/api/admin/logout', { method: 'POST' }).catch(() => {});
    me = null; showLogin();
  };

  // Header actions
  try { if (localStorage.getItem('rh_admin_dark') === '1') document.body.classList.add('dark'); } catch { /* storage blocked */ }
  $('#btnDark').onclick = () => {
    const on = document.body.classList.toggle('dark');
    try { localStorage.setItem('rh_admin_dark', on ? '1' : '0'); } catch { /* storage blocked */ }
  };
  $('#btnRefresh').onclick = async () => {
    const b = $('#btnRefresh'); b.disabled = true; b.style.transform = 'rotate(360deg)';
    resetGeoCache();
    await api('/api/admin/reload', { method: 'POST' }).catch(() => {}); // Apps Script: re-read everything (Node server reads live anyway)
    await route();
    b.disabled = false; setTimeout(() => { b.style.transform = ''; }, 600);
    toast('อัปเดตเรียบร้อย ✓', 'success');
  };
  window.addEventListener('scroll', () => $('#backToTop').classList.toggle('show', window.scrollY > 300));
  $('#backToTop').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) location.hash = b.dataset.tab; });

  // ─────────────── router ───────────────
  async function route() {
    if (!me) return;
    const h = location.hash.replace(/^#/, '').split('?')[0] || 'overview';
    const parts = h.split('/');
    const tabName = parts[0];
    if (!isSuper() && (['projects', 'areas'].includes(tabName) || (tabName === 'locations' && parts[1] === 'new'))) { location.hash = 'overview'; return; }
    const id = ++renderId;
    cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } }); cleanups = [];
    document.body.classList.remove('editing');
    $$('.adm-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    const fresh = main.cloneNode(false); main.replaceWith(fresh); main = fresh;
    main.innerHTML = '<div class="loading" style="min-height:40vh"><div class="spinner"></div></div>';
    const pages = { overview: pageOverview, projects: parts[1] ? pageProjectWorkspace : pageProjects, locations: parts[1] ? pageLocationEditor : pageLocations, photos: pagePhotos, areas: pageAreas, admins: pageAdmins };
    try { await (pages[tabName] || pageOverview)(id, parts); }
    catch (e) { if (id === renderId && e.status !== 401) { main.innerHTML = `<div class="empty">${icon('close')}<h3>โหลดข้อมูลไม่สำเร็จ</h3><p>${esc(e.message)}</p></div>`; } }
  }
  window.addEventListener('hashchange', route);

  // ─────────────── OVERVIEW ───────────────
  async function pageOverview(id) {
    const [d, notice] = await Promise.all([call('/api/admin/dashboard'), isSuper() ? backendNotice() : '']);
    if (id !== renderId) return;
    const s = d.stats;
    const demo = d.recent.some(l => (l.description || '').includes('ข้อมูลตัวอย่าง'));
    main.innerHTML = `${notice}
      <div class="page-title"><div><h1>ภาพรวมโครงการ</h1><p>สวัสดี ${esc(me.display_name || me.username)} · ข้อมูลทั้งหมดรวมรายการที่ยังไม่เผยแพร่</p></div>
        ${isSuper() ? `<div class="inline-actions"><a class="btn btn-gold" href="#locations/new">${icon('plus')} เพิ่มจุดช่วยเหลือ</a><button class="btn btn-outline" id="qNewProj">${icon('folder')} เพิ่มโครงการ</button></div>` : `<a class="btn btn-gold" href="#locations">${icon('image')} อัปเดตหน้างาน</a>`}</div>
      ${!isSuper() ? `<div class="acard"><div class="acard-body" style="display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:22px">📸</span><div><b>บัญชีทีมภาคสนาม</b><p style="color:var(--muted);font-size:13.5px">เลือกจุดช่วยเหลือ แล้วอัปโหลดภาพ เปลี่ยนสถานะ ปักพิกัด GPS และอัปเดตไทม์ไลน์ได้ ข้อมูลหลักของจุด โครงการ และพื้นที่ แก้ไขได้โดยผู้ดูแลหลักเท่านั้น</p></div></div></div>` : ''}
      ${demo && isSuper() ? `<div class="acard" style="border-top-color:var(--navy)"><div class="acard-body" style="display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:22px">💡</span><div><b>ขณะนี้มีข้อมูลตัวอย่างในระบบ</b><p style="color:var(--muted);font-size:13.5px">ข้อมูลและภาพที่มีคำว่า “ข้อมูลตัวอย่าง” ใช้สำหรับทดลองระบบ ลบได้จากแท็บ “โครงการ” หรือรันคำสั่ง <code>npm run reset:empty</code> บนเซิร์ฟเวอร์เพื่อเริ่มต้นฐานข้อมูลใหม่โดยไม่มีข้อมูลตัวอย่าง</p></div></div></div>` : ''}
      <div class="astat-grid">
        <div class="astat"><div class="l">พื้นที่ที่ได้รับความช่วยเหลือ</div><div class="v">${fmtNum(s.areas)}</div><div class="s">${fmtNum(s.provinces)} จังหวัด</div></div>
        <div class="astat"><div class="l">จำนวนรอบการส่งมอบ</div><div class="v">${fmtNum(s.rounds_total)}</div><div class="s">ส่งมอบแล้ว ${fmtNum(s.delivered_locations)} จุด</div></div>
        <div class="astat"><div class="l">สิ่งของที่ส่งต่อ</div><div class="v">${fmtNum(s.items_delivered)}</div><div class="s">ชิ้น (เฉพาะที่ส่งมอบแล้ว)</div></div>
        <div class="astat"><div class="l">ผู้ได้รับความช่วยเหลือ</div><div class="v">${fmtNum(s.beneficiaries)}</div><div class="s">${fmtNum(s.households)} ครัวเรือน</div></div>
      </div>
      <div class="astat-grid">
        <div class="astat" style="border-top-color:#C5CCE3"><div class="l">🤍 กำลังเตรียม</div><div class="v">${s.status.preparing}</div><div class="s">จุด</div></div>
        <div class="astat"><div class="l">🚚 กำลังนำส่ง</div><div class="v">${s.status.in_transit}</div><div class="s">จุด</div></div>
        <div class="astat" style="border-top-color:var(--navy)"><div class="l">✓ ส่งมอบแล้ว</div><div class="v">${s.status.delivered}</div><div class="s">จุด</div></div>
        <div class="astat" style="border-top-color:var(--navy-3)"><div class="l">ภาพถ่ายทั้งหมด</div><div class="v">${fmtNum(s.photos)}</div><div class="s">ภาพ</div></div>
      </div>
      <section class="acard"><div class="acard-head"><h2>${icon('calendar')} แก้ไขล่าสุด</h2><a class="link-more" href="#locations">ดูทั้งหมด ${icon('arrow')}</a></div><div id="recentTbl"></div></section>`;
    $('#qNewProj')?.addEventListener('click', createProject);
    table($('#recentTbl'), {
      rows: d.recent, sort: { key: 'updated_at', dir: 'desc' },
      cols: [
        { key: 'code', label: 'รหัส', cls: 'code', render: r => `#${esc(r.code)}` },
        { key: 'name', label: 'ชื่อจุด', render: r => `<a href="#locations/edit/${r.id}"><b>${esc(r.name)}</b></a><span class="sub">${esc(areaText(r))}</span>` },
        { key: 'round_no', label: 'รอบ', render: r => `รอบที่ ${esc(r.round_no)}` },
        { key: 'delivery_date', label: 'วันที่ส่งมอบ', type: 'date', render: r => fmtDate(r.delivery_date) },
        { key: 'status', label: 'สถานะ', render: r => statusSelect(r.id, r.status) },
        { key: 'updated_at', label: 'แก้ไขล่าสุด', type: 'date', render: r => `${fmtDate(r.updated_at)} ${esc((r.updated_at || '').slice(11, 16).replace(':', '.'))}` },
      ],
      onRender: el => bindStatusSelects(el),
    });
  }

  // ─────────────── PROJECTS ───────────────
  // Apps Script deployed before v2.3 doesn't store project types yet → remind the admin to update it
  async function backendNotice() {
    try {
      const m = await api('/api/admin/meta');
      if (m && m.backend === 'apps-script' && (m.api_version || 1) < 3) return `<div class="acard" style="border-top-color:#D93B30"><div class="acard-body" style="display:flex;gap:12px;align-items:flex-start">
        <span style="font-size:22px">⚠️</span><div><b>โค้ด Apps Script ยังเป็นเวอร์ชันเก่า</b><p style="color:var(--muted);font-size:13.5px">ประเภทโครงการยังไม่ถูกบันทึก และระบบยังลองบันทึกซ้ำให้อัตโนมัติไม่ได้เมื่อ Google ขัดข้อง — วางโค้ด <code>apps-script/Code.gs</code> ล่าสุด แล้ว Deploy → Manage deployments → แก้ไข → เวอร์ชันใหม่ (ดู SETUP.md)</p></div></div></div>`;
    } catch { /* Node server: nothing to update */ }
    return '';
  }

  async function editProject(p) {
    const v = p || { status: 'preparing', is_published: 1, category: 'flood' };
    let status = v.status, cat = v.category || 'flood';
    return modal({
      title: p ? `แก้ไขโครงการ รอบที่ ${p.round_no}` : 'เพิ่มโครงการใหม่',
      body: `<div class="form-grid">
        <div class="field span-2"><span>ประเภทโครงการ</span><div class="cat-pick" id="pCat">${Object.entries(CATEGORIES).map(([k, c]) => `<button type="button" data-c="${k}" class="${k === cat ? 'on' : ''}"><span class="ic">${c.icon}</span>${esc(c.label)}</button>`).join('')}</div></div>
        <label class="field"><span>รอบที่ <span class="req">*</span></span><input class="input" name="round_no" value="${esc(v.round_no || '')}" placeholder="เช่น 004" maxlength="20" required></label>
        <div class="field"><span>สถานะ</span><div class="seg-ctl" id="pStatus">${STATUS_KEYS.map(k => `<button type="button" data-v="${k}" class="${k === status ? 'on' : ''}">${STATUS[k].label}</button>`).join('')}</div></div>
        <label class="field span-2"><span>ชื่อโครงการ <span class="req">*</span></span><input class="input" name="name" value="${esc(v.name || '')}" maxlength="200" placeholder="เช่น ส่งต่อน้ำใจ สู้ภัยแล้ง จังหวัด..." required></label>
        <label class="field span-2"><span>สรุปสั้น <span class="hint">(แสดงบนการ์ด)</span></span><input class="input" name="summary" value="${esc(v.summary || '')}" maxlength="500"></label>
        <label class="field span-2"><span>รายละเอียด</span><textarea class="input" name="description" maxlength="5000">${esc(v.description || '')}</textarea></label>
        <label class="field"><span>วันที่เริ่ม</span><input class="input" type="date" name="start_date" value="${esc(v.start_date || '')}"></label>
        <label class="field"><span>วันที่สิ้นสุด</span><input class="input" type="date" name="end_date" value="${esc(v.end_date || '')}"></label>
        <label class="field span-2"><span>ผู้ร่วมสนับสนุน <span class="hint">(ถ้ามี)</span></span><input class="input" name="supporters" value="${esc(v.supporters || '')}" maxlength="1000"></label>
        <label class="switch span-2"><input type="checkbox" name="is_published"${v.is_published ? ' checked' : ''}> เผยแพร่บนเว็บไซต์</label>
      </div>`,
      submit: p ? 'บันทึก' : 'สร้างและเปิดแผนที่',
      onOpen: b => {
        $('#pStatus', b).onclick = e => { const t = e.target.closest('[data-v]'); if (!t) return; status = t.dataset.v; $$('#pStatus button', b).forEach(x => x.classList.toggle('on', x === t)); };
        $('#pCat', b).onclick = e => { const t = e.target.closest('[data-c]'); if (!t) return; cat = t.dataset.c; $$('#pCat button', b).forEach(x => x.classList.toggle('on', x === t)); };
      },
      onSubmit: async f => {
        const body = { category: cat, round_no: f.round_no.value, name: f.name.value, summary: f.summary.value, description: f.description.value, status, start_date: f.start_date.value, end_date: f.end_date.value, supporters: f.supporters.value, is_published: f.is_published.checked };
        if (!body.round_no.trim() || !body.name.trim()) { toast('กรุณาระบุรอบที่และชื่อโครงการ', 'warning'); return false; }
        const r = p ? await call(`/api/admin/projects/${p.id}`, { method: 'PUT', body }) : await call('/api/admin/projects', { method: 'POST', body });
        toast('บันทึกโครงการแล้ว', 'success');
        return { id: p ? p.id : r.id, created: !p };
      },
    });
  }
  // New project → straight into its map
  async function createProject() {
    const r = await editProject(null);
    if (r && r.id) location.hash = `projects/${r.id}`;
  }

  async function pageProjects(id) {
    const [rows, notice] = await Promise.all([call('/api/admin/projects'), backendNotice()]);
    if (id !== renderId) return;
    let q = '', cat = '';
    main.innerHTML = `
      <div class="page-title"><div><h1>โครงการ</h1><p>${rows.length} โครงการ · กดที่โครงการเพื่อเพิ่ม/แก้จุดช่วยเหลือบนแผนที่</p></div><button class="btn btn-gold" id="newProj">${icon('plus')} เพิ่มโครงการ</button></div>
      ${notice}
      <section class="acard"><div class="toolbar" style="grid-template-columns:1fr">
        <div class="search-input">${icon('search')}<input class="input" id="q" placeholder="ค้นหารอบ / ชื่อโครงการ / จังหวัด"></div>
        <div class="chips-row" id="catChips"></div></div>
        <div class="acard-body"><div class="pj-grid" id="pjGrid"></div></div></section>`;
    const draw = () => {
      const present = [...new Set(rows.map(r => r.category || 'flood'))];
      $('#catChips').innerHTML = [['', 'ทุกประเภท']].concat(present.map(k => [k, `${category(k).icon} ${category(k).label}`]))
        .map(([k, t]) => `<button type="button" class="fchip${cat === k ? ' on' : ''}" data-c="${k}">${t}</button>`).join('');
      const list = rows.filter(r => (!cat || (r.category || 'flood') === cat) && (!q || `${r.round_no} ${r.name} ${r.provinces || ''}`.toLowerCase().includes(q)))
        .sort((a, b) => String(b.start_date || b.created_at || '').localeCompare(String(a.start_date || a.created_at || '')));
      $('#pjGrid').innerHTML = list.length ? list.map(r => `
        <article class="pj-card">
          <a class="pj-main" href="#projects/${r.id}">
            <span class="pj-ic">${category(r.category).icon}</span>
            <span class="pj-tx">
              <span class="pj-top"><b>รอบที่ ${esc(r.round_no)}</b>${statusChip(r.status)}${r.is_published ? '' : '<span class="chip chip-preparing">ซ่อน</span>'}</span>
              <span class="pj-name">${esc(r.name)}</span>
              <span class="pj-sub">${esc(category(r.category).label)} · ${esc(r.provinces || 'ยังไม่มีจุด')} · ${fmtDate(r.start_date)}</span>
              <span class="pj-stats"><span><b>${r.delivered_count}/${r.location_count}</b> จุดส่งมอบ</span><span><b>${fmtNum(r.beneficiaries)}</b> คน</span><span><b>${fmtNum(r.photo_count)}</b> ภาพ</span></span>
            </span>
          </a>
          <div class="pj-acts">
            <a class="btn btn-navy btn-sm" href="#projects/${r.id}">${icon('map')} เปิดแผนที่</a>
            <button class="btn btn-outline btn-sm" data-edit="${r.id}">แก้ไข</button>
            <button class="btn btn-ghost-dark btn-sm" data-del="${r.id}" aria-label="ลบ">${icon('close')}</button>
          </div>
        </article>`).join('') : `<div class="empty" style="grid-column:1/-1">${icon('folder')}<h3>ยังไม่มีโครงการ</h3><p>กด “เพิ่มโครงการ” เพื่อเริ่มต้น</p></div>`;
    };
    main.addEventListener('click', async e => {
      const c = e.target.closest('[data-c]'), ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
      if (c) { cat = c.dataset.c; draw(); }
      else if (ed) { if (await editProject(rows.find(r => r.id === +ed.dataset.edit))) route(); }
      else if (dl) {
        const p = rows.find(r => r.id === +dl.dataset.del);
        if (!await confirmBox(`ลบโครงการ <b>รอบที่ ${esc(p.round_no)} ${esc(p.name)}</b> ?<br><br>จุดช่วยเหลือ ${p.location_count} จุด และภาพทั้งหมด ${p.photo_count} ภาพในโครงการนี้จะถูกลบด้วย และไม่สามารถกู้คืนได้`)) return;
        try { await call(`/api/admin/projects/${p.id}`, { method: 'DELETE' }); toast('ลบโครงการแล้ว', 'success'); route(); } catch (err) { fail(err); }
      }
    });
    $('#q').oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    $('#newProj').onclick = createProject;
    draw();
  }

  // ─────────────── PROJECT MAP BUILDER ───────────────
  // Add points by tapping the map: the area (ตำบล/อำเภอ/จังหวัด) is filled in from the coordinates.
  const stripArea = s => String(s || '').replace(/^(จังหวัด|อำเภอ|เขต|ตำบล|แขวง)\s*/, '').trim();
  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=th&zoom=17&addressdetails=1`).then(x => x.json());
      const a = r.address || {};
      // The Thai level names land in different keys per area (city, city_district, municipality, quarter…):
      // find them by their prefix first, then fall back to the usual keys.
      const vals = Object.values(a).filter(v => typeof v === 'string');
      const byPrefix = re => vals.find(v => re.test(v));
      const bkk = vals.some(v => /กรุงเทพ/.test(v));
      const province = bkk ? 'กรุงเทพมหานคร' : stripArea(byPrefix(/^จังหวัด/) || a.province || a.state || '');
      const district = stripArea(byPrefix(bkk ? /^เขต/ : /^อำเภอ/) || (bkk ? a.suburb : a.county) || '');
      const sub = byPrefix(bkk ? /^แขวง/ : /^ตำบล/) || [a.city_district, a.subdistrict, a.municipality].find(v => v && !/^เทศบาล/.test(v) && stripArea(v) !== district);
      return { province, district, subdistrict: stripArea(sub || ''), name: r.name || a.amenity || a.building || a.neighbourhood || a.village || a.hamlet || '' };
    } catch { return null; }
  }
  async function searchPlace(q) {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&accept-language=th&q=${encodeURIComponent(q)}`).then(x => x.json());
    return r[0] ? [+r[0].lat, +r[0].lon] : null;
  }

  async function pageProjectWorkspace(id, parts) {
    const pid = Number(parts[1]);
    const [projects, allLocs, provs, notice] = await Promise.all([call('/api/admin/projects'), call('/api/admin/locations'), provinces(), backendNotice()]);
    if (id !== renderId) return;
    const p = projects.find(x => x.id === pid);
    if (!p) { main.innerHTML = `<div class="empty">${icon('folder')}<h3>ไม่พบโครงการ</h3><p><a class="link-more" href="#projects">กลับไปหน้าโครงการ</a></p></div>`; return; }
    let locs = allLocs.filter(l => l.project_id === pid);
    document.body.classList.add('ws-mode');
    onCleanup(() => document.body.classList.remove('ws-mode'));

    main.innerHTML = `${notice}
      <div class="ws">
        <aside class="ws-panel">
          <div class="ws-head">
            <a class="ws-back" href="#projects">${icon('back')} โครงการทั้งหมด</a>
            <div class="ws-chips">${catChip(p.category)}<span class="chip chip-round">รอบที่ ${esc(p.round_no)}</span>${statusChip(p.status)}</div>
            <h1>${esc(p.name)}</h1>
            <div class="ws-acts"><button type="button" class="btn btn-outline btn-sm" id="wsEdit">แก้ไขโครงการ</button><a class="btn btn-ghost-dark btn-sm" href="./#/projects/${pid}" target="_blank" rel="noopener">${icon('external')} หน้าเว็บ</a></div>
            <div class="ws-stats" id="wsStats"></div>
          </div>
          <div class="ws-body" id="wsBody"></div>
        </aside>
        <div class="ws-mapwrap">
          <div class="ws-map" id="wsMap"></div>
          <form class="ws-search" id="wsSearch" role="search"><span class="ic-wrap">${icon('search')}</span><input class="input" name="q" placeholder="ค้นหาสถานที่ เช่น วัด... อำเภอ..." autocomplete="off"></form>
          <div class="ws-hint" id="wsHint" hidden><b>แตะบนแผนที่ตรงจุดส่งมอบ</b><span>ลากแผนที่เพื่อเลื่อน ซูมเข้าเพื่อความแม่นยำ</span>
            <div class="ws-hint-acts"><button type="button" class="btn btn-outline btn-sm" id="wsGps">${icon('navigation')} ใช้ตำแหน่งปัจจุบัน</button><button type="button" class="btn btn-ghost-dark btn-sm" id="wsCancel">ยกเลิก</button></div></div>
          <button type="button" class="btn btn-gold ws-add" id="wsAdd">${icon('plus')} เพิ่มจุดบนแผนที่</button>
        </div>
      </div>`;

    const map = makeMap($('#wsMap'), { zoomControl: true });
    onCleanup(() => map.remove());
    const markers = new Map();
    let temp = null, adding = false, selected = null;
    const mapEl = $('#wsMap');

    const drawStats = () => {
      const del = locs.filter(l => l.status === 'delivered');
      $('#wsStats').innerHTML = `<span><b>${locs.length}</b> จุด</span><span><b>${del.length}</b> ส่งมอบแล้ว</span><span><b>${fmtNum(del.reduce((s, l) => s + (l.beneficiaries || 0), 0))}</b> คน</span><span><b>${fmtNum(locs.reduce((s, l) => s + (l.photo_count || 0), 0))}</b> ภาพ</span>`;
    };
    const placeMarkers = (fit) => {
      markers.forEach(m => m.remove()); markers.clear();
      locs.filter(l => l.lat != null).forEach((l, i) => {
        const m = L.marker([l.lat, l.lng], { icon: pinIcon(l.status, l.id === selected, i * 60), title: `#${l.code} ${l.name}`, riseOnHover: true })
          .on('click', () => { if (!adding) showPoint(l.id); }).addTo(map);
        markers.set(l.id, m);
      });
      if (fit) {
        const pts = locs.filter(l => l.lat != null).map(l => [l.lat, l.lng]);
        if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 });
        else if (pts.length === 1) map.setView(pts[0], 14);
        else map.setView(CFG.mapCenter, CFG.mapZoom);
      }
    };
    const select = lid => { selected = lid; markers.forEach((m, k) => setPinSelected(m, k === lid)); };
    const reloadLocs = async () => { locs = (await call('/api/admin/locations')).filter(l => l.project_id === pid); drawStats(); placeMarkers(false); };

    // ── list ──
    function showList() {
      select(null); stopAdding(); clearTemp();
      const sorted = [...locs].sort((a, b) => String(b.delivery_date || '').localeCompare(String(a.delivery_date || '')));
      $('#wsBody').innerHTML = sorted.length ? `<ul class="ws-list">${sorted.map(l => `
        <li><button type="button" class="ws-row" data-lid="${l.id}">
          <span class="th">${l.cover_thumb ? `<img src="${esc(l.cover_thumb)}" alt="" loading="lazy">` : `<span class="ph-none">${icon('image')}</span>`}</span>
          <span class="tx"><b>#${esc(l.code)} · ${esc(l.name)}</b><small>${esc(areaText(l))}</small><span class="ft">${statusChip(l.status)}<span>${fmtDate(l.delivery_date)}</span>${l.lat == null ? '<span class="warn">ไม่มีพิกัด</span>' : ''}</span></span>
        </button></li>`).join('')}</ul>`
        : `<div class="ws-empty">${icon('pin')}<h3>ยังไม่มีจุดช่วยเหลือ</h3><p>กด <b>“เพิ่มจุดบนแผนที่”</b> แล้วแตะบนแผนที่ตรงจุดส่งมอบ ระบบจะเติมตำบล อำเภอ จังหวัดให้อัตโนมัติ</p></div>`;
    }
    $('#wsBody').addEventListener('click', e => { const r = e.target.closest('[data-lid]'); if (r) showPoint(Number(r.dataset.lid)); });

    // ── add mode ──
    function startAdding() {
      select(null); clearTemp(); adding = true;
      $('#wsHint').hidden = false; $('#wsAdd').hidden = true; mapEl.classList.add('ws-picking');
      if (window.matchMedia('(max-width: 899px)').matches) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function stopAdding() { adding = false; $('#wsHint').hidden = true; $('#wsAdd').hidden = false; mapEl.classList.remove('ws-picking'); }
    function clearTemp() { if (temp) { temp.remove(); temp = null; } }
    $('#wsAdd').onclick = startAdding;
    $('#wsCancel').onclick = () => { stopAdding(); showList(); };
    $('#wsGps').onclick = () => {
      if (!navigator.geolocation) return toast('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง', 'warning');
      navigator.geolocation.getCurrentPosition(pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 16); dropPin(L.latLng(pos.coords.latitude, pos.coords.longitude)); },
        () => toast('อ่านตำแหน่งไม่ได้ — ตรวจสอบการอนุญาตตำแหน่ง', 'error'), { enableHighAccuracy: true, timeout: 10000 });
    };
    map.on('click', e => { if (adding) dropPin(e.latlng); });

    function dropPin(latlng) {
      stopAdding(); clearTemp();
      temp = L.marker(latlng, { icon: pinIcon('preparing', true), draggable: true, zIndexOffset: 2000 }).addTo(map);
      temp.on('dragend', () => fillArea(temp.getLatLng(), false));
      showAddForm(latlng);
    }

    // ── quick add form ──
    let areaReq = 0;
    async function showAddForm(latlng) {
      const next = await call('/api/admin/locations/next-code');
      $('#wsBody').innerHTML = `
        <form class="ws-form" id="wsForm" novalidate>
          <div class="ws-form-head"><h3>${icon('pin')} จุดใหม่ #<span id="fCode">${esc(next.code)}</span></h3><small id="fCoord"></small></div>
          <label class="field"><span>ชื่อจุด <span class="req">*</span></span><input class="input" name="name" maxlength="200" placeholder="เช่น ศาลาวัด... / โรงเรียน... / ชุมชน..." required></label>
          <div class="field"><span>พื้นที่ <span class="hint" id="fAreaHint">กำลังหาชื่อพื้นที่จากพิกัด…</span></span>
            <div class="ws-area"><div id="fProv"></div><input class="input" name="district" placeholder="อำเภอ / เขต"><input class="input" name="subdistrict" placeholder="ตำบล / แขวง"></div></div>
          <div class="ws-2">
            <label class="field"><span>วันที่ส่งมอบ</span><input class="input" type="date" name="delivery_date" value="${todayISO()}"></label>
            <label class="field"><span>ผู้ได้รับ (คน)</span><input class="input" type="number" min="0" inputmode="numeric" name="beneficiaries" value="0"></label>
          </div>
          <div class="field"><span>สถานะ</span><div class="seg-ctl" id="fStatus">${STATUS_KEYS.map(k => `<button type="button" data-v="${k}" class="${k === 'preparing' ? 'on' : ''}">${STATUS[k].icon} ${STATUS[k].label}</button>`).join('')}</div></div>
          <div class="field"><span>สิ่งของ <span class="hint">(เพิ่มทีหลังได้)</span></span><datalist id="wsItems">${COMMON_ITEMS.map(i => `<option value="${esc(i)}">`).join('')}</datalist><datalist id="wsUnits">${COMMON_UNITS.map(i => `<option value="${esc(i)}">`).join('')}</datalist>
            <div class="items-editor" id="fItems"></div><button type="button" class="btn btn-ghost-dark btn-sm" id="fAddItem" style="align-self:flex-start">${icon('plus')} เพิ่มรายการ</button></div>
          <div class="ws-form-acts"><button type="button" class="btn btn-outline" id="fCancel">ยกเลิก</button><button type="submit" class="btn btn-gold" id="fSave">${icon('check')} บันทึกจุด</button></div>
        </form>`;
      const f = $('#wsForm');
      let status = 'preparing';
      const items = [{ name: '', quantity: '', unit: '' }];
      const ssProv = new SearchSelect($('#fProv'), { placeholder: '— จังหวัด —', searchPlaceholder: 'ค้นหาจังหวัด...', options: provs.map(x => ({ value: x.id, label: x.name_th })) });
      onCleanup(() => ssProv.destroy());
      f._ssProv = ssProv;
      const drawItems = () => {
        $('#fItems').innerHTML = items.map((it, i) => `<div class="item-row" data-i="${i}">
          <input class="input" list="wsItems" data-k="name" value="${esc(it.name)}" placeholder="ชื่อสิ่งของ" aria-label="ชื่อสิ่งของ">
          <input class="input" type="number" min="0" step="any" inputmode="decimal" data-k="quantity" value="${it.quantity ?? ''}" placeholder="จำนวน" aria-label="จำนวน">
          <input class="input" list="wsUnits" data-k="unit" value="${esc(it.unit || '')}" placeholder="หน่วย" aria-label="หน่วย">
          <button type="button" class="btn btn-ghost-dark btn-icon" data-rm="${i}" aria-label="ลบรายการ">${icon('close')}</button></div>`).join('');
      };
      drawItems();
      $('#fItems').addEventListener('input', e => { const r = e.target.closest('[data-i]'); if (r) items[+r.dataset.i][e.target.dataset.k] = e.target.value; });
      $('#fItems').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(+b.dataset.rm, 1); if (!items.length) items.push({ name: '', quantity: '', unit: '' }); drawItems(); } });
      $('#fAddItem').onclick = () => { items.push({ name: '', quantity: '', unit: '' }); drawItems(); };
      $('#fStatus').onclick = e => { const t = e.target.closest('[data-v]'); if (!t) return; status = t.dataset.v; $$('#fStatus button').forEach(b => b.classList.toggle('on', b === t)); temp && temp.setIcon(pinIcon(status, true)); };
      $('#fCancel').onclick = () => showList();
      fillArea(latlng, true);
      f.onsubmit = async e => {
        e.preventDefault();
        const ll = temp ? temp.getLatLng() : latlng;
        if (!f.name.value.trim()) { f.name.focus(); return toast('กรุณาใส่ชื่อจุด', 'warning'); }
        const body = {
          project_id: pid, code: $('#fCode').textContent, name: f.name.value, delivery_date: f.delivery_date.value, status,
          beneficiaries: f.beneficiaries.value, lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6,
          province_id: Number(ssProv.getValue()) || null, area_names: { district: f.district.value, subdistrict: f.subdistrict.value },
          items: items.filter(i => String(i.name || '').trim()),
        };
        const btn = $('#fSave'); btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
        try {
          const r = await call('/api/admin/locations', { method: 'POST', body });
          clearTemp(); resetGeoCache();
          await reloadLocs();
          toast('บันทึกจุดแล้ว — เพิ่มรูปได้เลย', 'success');
          showPoint(r.id);
        } catch (err) { fail(err); btn.disabled = false; btn.innerHTML = `${icon('check')} บันทึกจุด`; }
      };
    }
    async function fillArea(latlng, setName) {
      const f = $('#wsForm'); if (!f) return;
      $('#fCoord').textContent = `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`;
      const hint = $('#fAreaHint'); hint.textContent = 'กำลังหาชื่อพื้นที่จากพิกัด…';
      const my = ++areaReq;
      const g = await reverseGeocode(latlng.lat, latlng.lng);
      if (my !== areaReq || !$('#wsForm')) return;
      if (!g) { hint.textContent = 'หาชื่อพื้นที่ไม่ได้ — กรอกเอง'; return; }
      const pv = provs.find(x => x.name_th === g.province);
      f._ssProv.setValue(pv ? pv.id : '');
      f.district.value = g.district || ''; f.subdistrict.value = g.subdistrict || '';
      if (setName && g.name && !f.name.value) f.name.value = g.name;
      hint.textContent = pv ? 'เติมจากพิกัดแล้ว ตรวจสอบ/แก้ไขได้' : 'ไม่พบจังหวัดจากพิกัด — เลือกเอง';
    }

    // ── point detail: status, photos, move pin ──
    async function showPoint(lid) {
      stopAdding(); clearTemp(); select(lid);
      const l = locs.find(x => x.id === lid);
      if (l && l.lat != null) map.panTo([l.lat, l.lng]);
      $('#wsBody').innerHTML = '<div class="loading" style="min-height:160px"><div class="spinner"></div></div>';
      const d = await call(`/api/admin/locations/${lid}`);
      if (selected !== lid) return;
      $('#wsBody').innerHTML = `
        <div class="ws-point">
          <button type="button" class="ws-back" id="ptBack">${icon('back')} รายการจุด</button>
          <h3>#${esc(d.code)} · ${esc(d.name)}</h3>
          <p class="ws-area-tx">${icon('pin')} ${esc(areaText(d))}</p>
          <div class="seg-ctl" id="ptStatus">${STATUS_KEYS.map(k => `<button type="button" data-v="${k}" class="${k === d.status ? 'on' : ''}">${STATUS[k].icon} ${STATUS[k].label}</button>`).join('')}</div>
          <ul class="kv" style="margin-top:8px">
            <li><span class="k">วันที่ส่งมอบ</span><span class="v">${fmtDate(d.delivery_date)}</span></li>
            <li><span class="k">ผู้ได้รับ</span><span class="v">${fmtNum(d.beneficiaries)} คน</span></li>
            <li><span class="k">สิ่งของ</span><span class="v">${d.items.map(i => `${esc(i.name)} ${fmtNum(i.quantity)} ${esc(i.unit || '')}`).join('<br>') || '-'}</span></li>
          </ul>
          <div class="ws-pt-acts">
            <a class="btn btn-outline btn-sm" href="#locations/edit/${d.id}">${icon('heart')} แก้ไขข้อมูลเต็ม</a>
            <button type="button" class="btn btn-outline btn-sm" id="ptMove">${icon('pin')} ย้ายหมุด</button>
          </div>
          <h4 class="ws-sub">ภาพถ่าย (${d.photos.length})</h4>
          <div id="ptUp"></div>
          <div class="ph-grid ws-ph" id="ptGrid" style="margin-top:12px"></div>
        </div>`;
      $('#ptBack').onclick = showList;
      $('#ptStatus').onclick = async e => {
        const t = e.target.closest('[data-v]'); if (!t || t.classList.contains('on')) return;
        try {
          await call(`/api/admin/locations/${lid}/status`, { method: 'PATCH', body: { status: t.dataset.v } });
          $$('#ptStatus button').forEach(b => b.classList.toggle('on', b === t));
          toast(`อัปเดตสถานะเป็น “${STATUS[t.dataset.v].label}” แล้ว`, 'success');
          await reloadLocs(); select(lid);
        } catch (err) { fail(err); }
      };
      $('#ptMove').onclick = () => {
        const m = markers.get(lid);
        if (!m) return toast('จุดนี้ยังไม่มีพิกัด — ใช้ “แก้ไขข้อมูลเต็ม”', 'warning');
        m.dragging.enable(); toast('ลากหมุดไปตำแหน่งใหม่ได้เลย', 'info');
        m.once('dragend', async () => {
          m.dragging.disable();
          const ll = m.getLatLng();
          try { await call(`/api/admin/locations/${lid}/field`, { method: 'PATCH', body: { lat: Math.round(ll.lat * 1e6) / 1e6, lng: Math.round(ll.lng * 1e6) / 1e6 } }); toast('ย้ายหมุดแล้ว', 'success'); await reloadLocs(); select(lid); }
          catch (err) { fail(err); }
        });
      };
      uploader($('#ptUp'), { locationId: () => lid, defaultDate: () => d.delivery_date || todayISO(), onDone: async () => { await reloadLocs(); showPoint(lid); } });
      photoGrid($('#ptGrid'), d.photos, { coverId: d.cover_photo_id, onChange: async () => { await reloadLocs(); showPoint(lid); } });
    }

    // ── search a place to jump the map ──
    $('#wsSearch').onsubmit = async e => {
      e.preventDefault();
      const q = e.target.q.value.trim(); if (!q) return;
      setLoading(true);
      try { const ll = await searchPlace(q); ll ? map.setView(ll, 15) : toast('ไม่พบสถานที่', 'warning'); }
      catch { toast('ค้นหาไม่สำเร็จ', 'error'); } finally { setLoading(false); }
    };
    $('#wsEdit').onclick = async () => { if (await editProject(p)) route(); };

    drawStats(); placeMarkers(true); showList();
    setTimeout(() => map.invalidateSize(), 50);
    if (!locs.length) setTimeout(startAdding, 400);
  }

  // ─────────────── LOCATIONS (list) ───────────────
  async function pageLocations(id) {
    const [rows, projects] = await Promise.all([call('/api/admin/locations'), call('/api/admin/projects')]);
    if (id !== renderId) return;
    const q0 = new URLSearchParams(location.hash.split('?')[1] || '');
    const f = { q: '', project: q0.get('project') || '', province: '', status: '' };
    main.innerHTML = `
      <div class="page-title"><div><h1>จุดช่วยเหลือ</h1><p id="locCount"></p></div>${isSuper() ? `<a class="btn btn-gold" href="#locations/new">${icon('plus')} เพิ่มจุดช่วยเหลือ</a>` : ''}</div>
      <section class="acard">
        <div class="toolbar">
          <div class="search-input">${icon('search')}<input class="input" id="q" placeholder="ค้นหารหัส / ชื่อจุด / ตำบล / อำเภอ"></div>
          <div id="fProj"></div><div id="fProv"></div><div id="fStatus"></div>
        </div>
        <div id="tbl"></div>
      </section>`;
    const provs = [...new Map(rows.filter(r => r.province_id).map(r => [r.province_id, r.province])).entries()];
    const ss = [
      new SearchSelect($('#fProj'), { allLabel: 'ทุกโครงการ', value: f.project, options: projects.map(p => ({ value: p.id, label: `รอบที่ ${p.round_no} · ${p.name}` })), onChange: v => { f.project = v; apply(); } }),
      new SearchSelect($('#fProv'), { allLabel: 'ทุกจังหวัด', options: provs.map(([v, l]) => ({ value: v, label: l })), onChange: v => { f.province = v; apply(); } }),
      new SearchSelect($('#fStatus'), { allLabel: 'ทุกสถานะ', options: STATUS_KEYS.map(k => ({ value: k, label: `${STATUS[k].icon} ${STATUS[k].label}` })), onChange: v => { f.status = v; apply(); } }),
    ];
    onCleanup(() => ss.forEach(s => s.destroy()));
    const filtered = () => rows.filter(r => (!f.project || String(r.project_id) === f.project) && (!f.province || String(r.province_id) === f.province) && (!f.status || r.status === f.status)
      && (!f.q || `${r.code} ${r.name} ${r.subdistrict || ''} ${r.district || ''} ${r.province || ''}`.toLowerCase().includes(f.q)));
    const t = table($('#tbl'), {
      rows: filtered(), sort: { key: 'delivery_date', dir: 'desc' }, empty: 'ไม่พบจุดช่วยเหลือ',
      cols: [
        { key: 'cover_thumb', label: '', sortable: false, render: r => thumb(r.cover_thumb) },
        { key: 'code', label: 'รหัส', cls: 'code', render: r => `#${esc(r.code)}` },
        { key: 'name', label: 'ชื่อจุด / พื้นที่', render: r => `<a href="#locations/edit/${r.id}"><b>${esc(r.name)}</b></a><span class="sub">${esc(areaText(r))}</span>` },
        { key: 'round_no', label: 'รอบ', render: r => `รอบที่ ${esc(r.round_no)}` },
        { key: 'delivery_date', label: 'วันที่ส่งมอบ', type: 'date', render: r => fmtDate(r.delivery_date) },
        { key: 'status', label: 'สถานะ', render: r => statusSelect(r.id, r.status) },
        { key: 'beneficiaries', label: 'ผู้ได้รับ', type: 'num', cls: 'num', render: r => fmtNum(r.beneficiaries) },
        { key: 'photo_count', label: 'ภาพ', type: 'num', cls: 'num' },
        { key: 'actions', label: '', sortable: false, cls: 'actions', render: r => `
          <a class="btn btn-outline btn-sm" href="#locations/edit/${r.id}">${isSuper() ? 'แก้ไข' : 'อัปเดตหน้างาน'}</a>
          <a class="btn btn-ghost-dark btn-sm" href="./#/locations/${r.id}" target="_blank" rel="noopener" title="ดูหน้าเว็บ">${icon('external')}</a>
          ${isSuper() ? `<button class="btn btn-ghost-dark btn-sm" data-del="${r.id}" aria-label="ลบ">${icon('close')}</button>` : ''}` },
      ],
      onRender: el => {
        bindStatusSelects(el, (lid, s) => { const r = rows.find(x => x.id === lid); if (r) r.status = s; });
        $$('[data-del]', el).forEach(b => b.onclick = async () => {
          const r = rows.find(x => x.id === +b.dataset.del);
          if (!await confirmBox(`ลบจุดช่วยเหลือ <b>#${esc(r.code)} ${esc(r.name)}</b> ?<br><br>รายการสิ่งของ ไทม์ไลน์ และภาพ ${r.photo_count} ภาพจะถูกลบด้วย`)) return;
          try { await call(`/api/admin/locations/${r.id}`, { method: 'DELETE' }); toast('ลบจุดช่วยเหลือแล้ว', 'success'); route(); } catch (e) { fail(e); }
        });
      },
    });
    const apply = () => { const r = filtered(); t.set(r); $('#locCount').textContent = `แสดง ${r.length} จาก ${rows.length} จุด`; };
    $('#q').oninput = e => { f.q = e.target.value.trim().toLowerCase(); apply(); };
    apply();
  }

  // ─────────────── LOCATION EDITOR ───────────────
  async function pageLocationEditor(id, parts) {
    const isNew = parts[1] === 'new';
    const lid = isNew ? null : Number(parts[2]);
    const field = !isSuper(); // on-site team: status, GPS, timeline, photos only
    const [projects, provs, loc, next] = await Promise.all([
      call('/api/admin/projects'), provinces(),
      lid ? call(`/api/admin/locations/${lid}`) : null,
      isNew ? call('/api/admin/locations/next-code') : null,
    ]);
    if (id !== renderId) return;
    if (!projects.length && !field) {
      main.innerHTML = `<div class="empty">${icon('folder')}<h3>ต้องสร้างโครงการก่อน</h3><p>จุดช่วยเหลือแต่ละจุดต้องอยู่ภายใต้โครงการ / รอบการช่วยเหลือ</p><p style="margin-top:14px"><button class="btn btn-gold" id="mkProj">${icon('plus')} เพิ่มโครงการ</button></p></div>`;
      $('#mkProj').onclick = async () => { if (await editProject(null)) route(); };
      return;
    }
    const q0 = new URLSearchParams(location.hash.split('?')[1] || '');
    const L0 = loc || { code: next.code, status: 'preparing', project_id: Number(q0.get('project')) || projects[0].id, items: [], updates: [], photos: [], beneficiaries: 0, households: 0 };
    const st = { ...L0, items: L0.items.map(i => ({ ...i })), updates: Object.fromEntries((L0.updates || []).map(u => [u.step, { ...u }])) };
    let marker = null;
    document.body.classList.add('editing');

    main.innerHTML = `
      <div class="page-title">
        <div><a class="link-more" href="#locations" style="font-size:13.5px;color:var(--muted)">${icon('back')} จุดช่วยเหลือทั้งหมด</a>
        <h1 style="margin-top:4px">${isNew ? 'เพิ่มจุดช่วยเหลือใหม่' : field ? `อัปเดตหน้างาน #${esc(L0.code)}` : `แก้ไขจุดส่งต่อความช่วยเหลือ #${esc(L0.code)}`}</h1></div>
        ${!isNew ? `<a class="btn btn-outline btn-sm" href="./#/locations/${lid}" target="_blank" rel="noopener">${icon('external')} ดูหน้าเว็บ</a>` : ''}
      </div>
      <form id="locForm" novalidate style="display:flex;flex-direction:column;gap:16px">
${field ? `
        <section class="acard"><div class="acard-head"><h2>${icon('heart')} ข้อมูลจุด</h2><span class="acard-sub">แก้ไขข้อมูลส่วนนี้ได้โดยผู้ดูแลหลัก</span></div><div class="acard-body">
          <ul class="kv">
            <li><span class="k">รอบการช่วยเหลือ</span><span class="v">รอบที่ ${esc(L0.round_no || '')}</span></li>
            <li><span class="k">ชื่อจุด</span><span class="v">${esc(L0.name || '')}</span></li>
            <li><span class="k">พื้นที่</span><span class="v">${esc(areaText(L0))}</span></li>
            <li><span class="k">วันที่ส่งมอบ</span><span class="v">${fmtDate(L0.delivery_date)}</span></li>
            <li><span class="k">ผู้ได้รับความช่วยเหลือ</span><span class="v">${fmtNum(L0.beneficiaries)} คน</span></li>
            <li><span class="k">สิ่งของ</span><span class="v">${L0.items.map(i => `${esc(i.name)} ${fmtNum(i.quantity)} ${esc(i.unit || '')}`).join('<br>') || '-'}</span></li>
          </ul>
          <div class="field" style="margin-top:16px"><span>สถานะ</span><div class="seg-ctl" id="segStatus">${STATUS_KEYS.map(k => `<button type="button" data-v="${k}" class="${k === st.status ? 'on' : ''}">${STATUS[k].icon} ${STATUS[k].label}</button>`).join('')}</div></div>
        </div></section>

        <section class="acard"><div class="acard-head"><h2>${icon('pin')} พิกัดจุดส่งมอบ</h2><span class="acard-sub">ยืนอยู่ที่จุดส่งมอบแล้วกด “ใช้ตำแหน่งปัจจุบัน” หรือแตะ/ลากหมุดบนแผนที่</span></div><div class="acard-body"><div class="form-grid">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="coord-row">
              <label class="field"><span>Latitude</span><input class="input" name="lat" inputmode="decimal" value="${L0.lat ?? ''}"></label>
              <label class="field"><span>Longitude</span><input class="input" name="lng" inputmode="decimal" value="${L0.lng ?? ''}"></label>
            </div>
            <button type="button" class="btn btn-gold" id="btnGps">${icon('navigation')} ใช้ตำแหน่งปัจจุบัน</button>
          </div>
          <div class="picker-map crosshair" id="pickMap"></div>
        </div></div></section>
` : `
        <section class="acard"><div class="acard-head"><h2>${icon('heart')} ข้อมูลหลัก</h2></div><div class="acard-body"><div class="form-grid cols-3">
          <div class="field span-2"><span>โครงการ / รอบการช่วยเหลือ <span class="req">*</span></span><div id="ssProject"></div></div>
          <label class="field"><span>รหัสจุด (Location ID) <span class="req">*</span></span><input class="input" name="code" value="${esc(L0.code)}" maxlength="20" required></label>
          <label class="field span-2"><span>ชื่อจุด <span class="req">*</span></span><input class="input" name="name" value="${esc(L0.name || '')}" maxlength="200" placeholder="เช่น ศาลาวัด... / โรงเรียน... / ชุมชน..." required></label>
          <label class="field"><span>วันที่ส่งมอบ</span><input class="input" type="date" name="delivery_date" value="${esc(L0.delivery_date || '')}"></label>
          <div class="field span-3"><span>สถานะ</span><div class="seg-ctl" id="segStatus">${STATUS_KEYS.map(k => `<button type="button" data-v="${k}" class="${k === st.status ? 'on' : ''}">${STATUS[k].icon} ${STATUS[k].label}</button>`).join('')}</div></div>
          <label class="field"><span>จำนวนผู้ได้รับความช่วยเหลือ (คน)</span><input class="input" type="number" min="0" inputmode="numeric" name="beneficiaries" value="${L0.beneficiaries || 0}"></label>
          <label class="field"><span>จำนวนครัวเรือน <span class="hint">(ถ้ามี)</span></span><input class="input" type="number" min="0" inputmode="numeric" name="households" value="${L0.households || 0}"></label>
          <label class="field"><span>ผู้ร่วมสนับสนุน <span class="hint">(ถ้ามี)</span></span><input class="input" name="supporters" value="${esc(L0.supporters || '')}" maxlength="1000"></label>
          <label class="field span-3"><span>รายละเอียด</span><textarea class="input" name="description" maxlength="5000" placeholder="อธิบายสถานการณ์ในพื้นที่และการส่งมอบ">${esc(L0.description || '')}</textarea></label>
        </div></div></section>

        <section class="acard"><div class="acard-head"><h2>${icon('pin')} พื้นที่และพิกัดบนแผนที่</h2><span class="acard-sub">แตะบนแผนที่หรือลากหมุดเพื่อกำหนดตำแหน่ง</span></div><div class="acard-body"><div class="form-grid">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field"><span>จังหวัด</span><div id="ssProv"></div></div>
            <div class="field"><span>อำเภอ / เขต</span><div id="ssDist"></div></div>
            <div class="field"><span>ตำบล / แขวง</span><div id="ssSub"></div></div>
            <label class="field"><span>หมู่บ้าน / สถานที่ <span class="hint">(ถ้ามี)</span></span><input class="input" name="village" value="${esc(L0.village || '')}" maxlength="200"></label>
            <div class="coord-row">
              <label class="field"><span>Latitude</span><input class="input" name="lat" inputmode="decimal" value="${L0.lat ?? ''}" placeholder="14.4312"></label>
              <label class="field"><span>Longitude</span><input class="input" name="lng" inputmode="decimal" value="${L0.lng ?? ''}" placeholder="100.1268"></label>
            </div>
            <p class="area-hint" id="areaHint">${icon('pin')} ปักหมุดบนแผนที่ แล้วจังหวัด / อำเภอ / ตำบลจะเติมให้อัตโนมัติ</p>
            <div class="inline-actions">
              <button type="button" class="btn btn-outline btn-sm" id="btnGeocode">${icon('search')} ค้นหาพิกัดจากพื้นที่</button>
              <button type="button" class="btn btn-outline btn-sm" id="btnGps">${icon('navigation')} ใช้ตำแหน่งปัจจุบัน</button>
            </div>
          </div>
          <div class="picker-map crosshair" id="pickMap"></div>
        </div></div></section>

        <section class="acard"><div class="acard-head"><h2>${icon('box')} รายการสิ่งของที่ส่งมอบ</h2><button type="button" class="btn btn-outline btn-sm" id="addItem">${icon('plus')} เพิ่มรายการ</button></div>
          <div class="acard-body"><datalist id="itemNames">${COMMON_ITEMS.map(i => `<option value="${esc(i)}">`).join('')}</datalist><datalist id="itemUnits">${COMMON_UNITS.map(i => `<option value="${esc(i)}">`).join('')}</datalist>
          <div class="items-editor" id="items"></div><div class="items-total" style="margin-top:10px"><span>รวมจำนวนสิ่งของ</span><b id="itemsTotal">0</b></div></div></section>
`}

        <section class="acard"><div class="acard-head"><h2>${icon('truck')} ขั้นตอนการช่วยเหลือ (Timeline)</h2><span class="acard-sub">ใส่วันที่และหมายเหตุเมื่อแต่ละขั้นตอนเสร็จ</span></div>
          <div class="acard-body"><div class="tl-editor" id="tl"></div></div></section>

        <section class="acard" id="photoSec"><div class="acard-head"><h2>${icon('image')} ภาพถ่ายการช่วยเหลือ</h2><span class="acard-sub" id="phCount"></span></div>
          <div class="acard-body" id="photoBody"></div></section>

        <div class="editor-bar">
          <a class="btn btn-outline" href="#locations">ยกเลิก</a>
          <div class="right">${!isNew && !field ? `<button type="button" class="btn btn-ghost-dark" id="btnDelLoc">${icon('close')} ลบ</button>` : ''}<button type="submit" class="btn btn-gold" id="btnSave">${icon('check')} ${isNew ? 'บันทึกและเพิ่มภาพ' : field ? 'บันทึกการอัปเดต' : 'บันทึก'}</button></div>
        </div>
      </form>`;
    const form = $('#locForm');

    // Project, area cascade and items are main-admin only
    let areaUI = null; // area pickers (main admin only), used by the pin auto-fill below
    if (!field) {
    const ssProject = new SearchSelect($('#ssProject'), { value: st.project_id, placeholder: '— เลือกโครงการ —', options: projects.map(p => ({ value: p.id, label: `รอบที่ ${p.round_no} · ${p.name}` })), onChange: v => { st.project_id = Number(v); } });
    // Status
    $('#segStatus').onclick = e => { const t = e.target.closest('[data-v]'); if (!t) return; st.status = t.dataset.v; $$('#segStatus button').forEach(b => b.classList.toggle('on', b === t)); marker && marker.setIcon(pinIcon(st.status, true)); };

    // Area cascade with inline "add new"
    const addGeo = (kind, parentKey, parentId, label) => async q => {
      if (parentKey && !parentId) { toast('กรุณาเลือกรายการก่อนหน้าก่อน', 'warning'); return null; }
      const name = q || await promptName(`เพิ่ม${label}`, `ชื่อ${label}`);
      if (!name) return null;
      try {
        const r = await call(`/api/admin/${kind}`, { method: 'POST', body: { name_th: name, ...(parentKey ? { [parentKey]: parentId } : {}) } });
        toast(`เพิ่ม${label} “${name}” แล้ว`, 'success');
        if (kind === 'provinces') geoCache.provinces = null;
        if (kind === 'districts') geoCache.districts.delete(parentId);
        if (kind === 'subdistricts') geoCache.subdistricts.delete(parentId);
        return { value: r.id, label: name };
      } catch (e) { fail(e); return null; }
    };
    const ssProv = new SearchSelect($('#ssProv'), {
      value: st.province_id, placeholder: '— เลือกจังหวัด —', searchPlaceholder: 'ค้นหาจังหวัด...',
      options: provs.map(p => ({ value: p.id, label: p.name_th, sub: p.region })),
      onAdd: addGeo('provinces', null, null, 'จังหวัด'), addLabel: 'เพิ่มจังหวัดใหม่',
      onChange: async v => { st.province_id = Number(v) || null; st.district_id = st.subdistrict_id = null; await loadDist(); },
    });
    const ssDist = new SearchSelect($('#ssDist'), {
      placeholder: '— เลือกอำเภอ —', searchPlaceholder: 'ค้นหาอำเภอ...', addLabel: 'เพิ่มอำเภอใหม่',
      onAdd: q => addGeo('districts', 'province_id', st.province_id, 'อำเภอ')(q),
      onChange: async v => { st.district_id = Number(v) || null; st.subdistrict_id = null; await loadSub(); },
    });
    const ssSub = new SearchSelect($('#ssSub'), {
      placeholder: '— เลือกตำบล —', searchPlaceholder: 'ค้นหาตำบล...', addLabel: 'เพิ่มตำบลใหม่',
      onAdd: q => addGeo('subdistricts', 'district_id', st.district_id, 'ตำบล')(q),
      onChange: v => { st.subdistrict_id = Number(v) || null; },
    });
    onCleanup(() => [ssProject, ssProv, ssDist, ssSub].forEach(s => s.destroy()));
    async function loadDist() {
      const list = await districts(st.province_id);
      ssDist.setOptions(list.map(d => ({ value: d.id, label: d.name_th })), false); ssDist.setValue(st.district_id); ssDist.setDisabled(!st.province_id);
      await loadSub();
    }
    async function loadSub() {
      const list = await subdistricts(st.district_id);
      ssSub.setOptions(list.map(d => ({ value: d.id, label: d.name_th })), false); ssSub.setValue(st.subdistrict_id); ssSub.setDisabled(!st.district_id);
    }
    await loadDist();
    areaUI = { ssProv, loadDist };
    }

    // Map picker
    const pm = makeMap($('#pickMap'), { scrollWheelZoom: true });
    onCleanup(() => pm.remove());
    // auto = the user placed the pin (tap, drag, GPS, typed coordinates): fill จังหวัด/อำเภอ/ตำบล from it
    const setPoint = (lat, lng, pan, auto) => {
      lat = Math.round(lat * 1e6) / 1e6; lng = Math.round(lng * 1e6) / 1e6;
      form.lat.value = lat; form.lng.value = lng;
      if (!marker) {
        marker = L.marker([lat, lng], { icon: pinIcon(st.status, true), draggable: true }).addTo(pm);
        marker.on('dragend', () => { const p = marker.getLatLng(); setPoint(p.lat, p.lng, false, true); });
      } else marker.setLatLng([lat, lng]);
      if (pan) pm.setView([lat, lng], Math.max(pm.getZoom() || 0, 13));
      if (auto) autoArea(lat, lng);
    };
    pm.on('click', e => setPoint(e.latlng.lat, e.latlng.lng, false, true));
    if (L0.lat != null && L0.lng != null) setPoint(L0.lat, L0.lng, true); else pm.setView(CFG.mapCenter, CFG.mapZoom);
    const onCoord = () => { const la = parseFloat(form.lat.value), ln = parseFloat(form.lng.value); if (isFinite(la) && isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) setPoint(la, ln, true, true); };
    form.lat.onchange = onCoord; form.lng.onchange = onCoord;

    // Reverse-geocode the pin and select the matching จังหวัด/อำเภอ/ตำบล (adding a missing อำเภอ/ตำบล to the list)
    let areaReq = 0;
    const areaHint = (msg, cls = '') => { const h = $('#areaHint'); if (h) { h.className = `area-hint ${cls}`; h.innerHTML = `${icon('pin')} ${esc(msg)}`; } };
    const normName = v => stripArea(v).replace(/\s+/g, '');
    async function ensureGeo(kind, list, name, parentKey, parentId) {
      const hit = list.find(x => normName(x.name_th) === normName(name));
      if (hit) return hit.id;
      const r = await call(`/api/admin/${kind}`, { method: 'POST', body: { name_th: stripArea(name), [parentKey]: parentId } });
      geoCache[kind].delete(parentId);
      return r.id;
    }
    async function autoArea(lat, lng) {
      if (!areaUI) return;
      const my = ++areaReq;
      areaHint('กำลังหาจังหวัด / อำเภอ / ตำบลจากหมุด…', 'busy');
      const g = await reverseGeocode(lat, lng);
      if (my !== areaReq) return;
      if (!g || !g.province) return areaHint('หาชื่อพื้นที่จากหมุดไม่ได้ — เลือกเองด้านบน', 'warn');
      const pv = provs.find(p => normName(p.name_th) === normName(g.province));
      if (!pv) return areaHint(`ไม่พบจังหวัด “${g.province}” ในระบบ — เลือกเองด้านบน`, 'warn');
      try {
        const dId = g.district ? await ensureGeo('districts', await districts(pv.id), g.district, 'province_id', pv.id) : null;
        const sId = dId && g.subdistrict ? await ensureGeo('subdistricts', await subdistricts(dId), g.subdistrict, 'district_id', dId) : null;
        if (my !== areaReq) return;
        st.province_id = pv.id; st.district_id = dId; st.subdistrict_id = sId;
        areaUI.ssProv.setValue(pv.id);
        await areaUI.loadDist();
        const txt = [g.subdistrict && `ต.${g.subdistrict}`, g.district && `อ.${g.district}`, `จ.${pv.name_th}`].filter(Boolean).join(' ');
        areaHint(`เติมจากหมุดแล้ว: ${txt} — แก้ไขได้ถ้าไม่ตรง`, 'ok');
      } catch (e) { if (my === areaReq) areaHint('เติมพื้นที่อัตโนมัติไม่สำเร็จ — เลือกเองด้านบน', 'warn'); }
    }

    $('#btnGps').onclick = () => {
      if (!navigator.geolocation) return toast('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง', 'warning');
      navigator.geolocation.getCurrentPosition(p => setPoint(p.coords.latitude, p.coords.longitude, true, true), () => toast('ไม่สามารถอ่านตำแหน่งได้ — ตรวจสอบการอนุญาตตำแหน่ง', 'error'), { enableHighAccuracy: true, timeout: 10000 });
    };
    if (!field) $('#btnGeocode').onclick = async () => {
      const prov = provs.find(p => p.id === st.province_id)?.name_th;
      const dist = (await districts(st.province_id)).find(d => d.id === st.district_id)?.name_th;
      const sub = (await subdistricts(st.district_id)).find(d => d.id === st.subdistrict_id)?.name_th;
      if (!prov) return toast('กรุณาเลือกจังหวัดก่อน', 'warning');
      const tries = [[sub && `ตำบล${sub}`, dist && `อำเภอ${dist}`, `จังหวัด${prov}`], [dist && `อำเภอ${dist}`, `จังหวัด${prov}`], [`จังหวัด${prov}`]].map(a => a.filter(Boolean).join(' '));
      setLoading(true);
      try {
        for (const q of tries) {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=th&accept-language=th&q=${encodeURIComponent(q)}`).then(r => r.json());
          if (r[0]) { setPoint(+r[0].lat, +r[0].lon, true); toast(`พบพิกัด: ${q} — ปรับหมุดให้ตรงจุดส่งมอบจริง`, 'info'); return; }
        }
        toast('ไม่พบพิกัดจากชื่อพื้นที่ กรุณาแตะบนแผนที่', 'warning');
      } catch { toast('ค้นหาพิกัดไม่สำเร็จ', 'error'); } finally { setLoading(false); }
    };

    // Items
    if (!field) {
    const itemsEl = $('#items');
    const renderItems = () => {
      if (!st.items.length) st.items.push({ name: '', quantity: '', unit: '' });
      itemsEl.innerHTML = st.items.map((it, i) => `<div class="item-row" data-i="${i}">
        <input class="input" list="itemNames" data-k="name" value="${esc(it.name)}" placeholder="ชื่อสิ่งของ" aria-label="ชื่อสิ่งของ">
        <input class="input" type="number" min="0" step="any" inputmode="decimal" data-k="quantity" value="${it.quantity ?? ''}" placeholder="จำนวน" aria-label="จำนวน">
        <input class="input" list="itemUnits" data-k="unit" value="${esc(it.unit || '')}" placeholder="หน่วย" aria-label="หน่วย">
        <button type="button" class="btn btn-ghost-dark btn-icon" data-rm="${i}" aria-label="ลบรายการ">${icon('close')}</button></div>`).join('');
      updTotal();
    };
    const updTotal = () => { $('#itemsTotal').textContent = fmtNum(st.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0)); };
    itemsEl.addEventListener('input', e => { const row = e.target.closest('[data-i]'); if (!row) return; st.items[+row.dataset.i][e.target.dataset.k] = e.target.value; updTotal(); });
    itemsEl.addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; st.items.splice(+b.dataset.rm, 1); renderItems(); });
    $('#addItem').onclick = () => { st.items.push({ name: '', quantity: '', unit: '' }); renderItems(); $$('#items .item-row:last-child input')[0].focus(); };
    renderItems();
    }

    // Timeline
    const tlSS = [];
    onCleanup(() => tlSS.forEach(s => s.destroy()));
    function renderTimeline() {
      tlSS.splice(0).forEach(s => s.destroy());
      $('#tl').innerHTML = STEPS.map(([k, label], i) => {
        const u = st.updates[k] || {};
        return `<div class="tl-row${u.update_date || u.note ? ' filled' : ''}" data-step="${k}"><span class="n">${i + 1}</span><div>
          <h4>${label}</h4>
          <div class="tl-fields">
            <input class="input" type="date" data-k="update_date" value="${esc(u.update_date || '')}" aria-label="วันที่ ${label}">
            <input class="input" data-k="note" value="${esc(u.note || '')}" maxlength="1000" placeholder="หมายเหตุ (ถ้ามี)" aria-label="หมายเหตุ ${label}">
            <div data-photo="${k}"></div>
          </div></div></div>`;
      }).join('');
      $$('#tl [data-photo]').forEach(el => {
        const k = el.dataset.photo;
        tlSS.push(new SearchSelect(el, {
          allLabel: 'ภาพ: อัตโนมัติตามขั้นตอน', value: st.updates[k]?.photo_id || '', searchPlaceholder: 'ค้นหาภาพ...',
          options: (st.photos || []).map(p => ({ value: p.id, label: `${STAGES[p.stage]} · ${p.caption || 'ไม่มีคำอธิบาย'}`, sub: fmtDate(p.taken_date) })),
          onChange: v => { (st.updates[k] ||= { step: k }).photo_id = Number(v) || null; },
        }));
      });
    }
    $('#tl').addEventListener('input', e => {
      const row = e.target.closest('[data-step]'); const k = e.target.dataset.k; if (!row || !k) return;
      const u = (st.updates[row.dataset.step] ||= { step: row.dataset.step });
      u[k] = e.target.value;
      row.classList.toggle('filled', !!(u.update_date || u.note));
    });
    renderTimeline();

    // Photos
    st.photos = L0.photos || [];
    const photoBody = $('#photoBody');
    function renderPhotos() {
      $('#phCount').textContent = lid ? `${st.photos.length} ภาพ` : '';
      if (!lid) { photoBody.innerHTML = `<p style="color:var(--muted)">บันทึกข้อมูลจุดช่วยเหลือก่อน แล้วจึงอัปโหลดภาพได้</p>`; return; }
      photoBody.innerHTML = `<div id="uploader"></div><div class="ph-grid" id="phGrid" style="margin-top:16px"></div>`;
      uploader($('#uploader'), { locationId: () => lid, defaultDate: () => (form.delivery_date && form.delivery_date.value) || L0.delivery_date || todayISO(), onDone: reloadPhotos });
      photoGrid($('#phGrid'), st.photos, { coverId: st.cover_photo_id, locationId: lid, onChange: reloadPhotos });
    }
    async function reloadPhotos() {
      const d = await call(`/api/admin/locations/${lid}`);
      st.photos = d.photos; st.cover_photo_id = d.cover_photo_id;
      renderPhotos(); renderTimeline();
    }
    renderPhotos();

    // Delete
    $('#btnDelLoc')?.addEventListener('click', async () => {
      if (!await confirmBox(`ลบจุดช่วยเหลือ <b>#${esc(L0.code)} ${esc(L0.name)}</b> พร้อมภาพทั้งหมด ?`)) return;
      try { await call(`/api/admin/locations/${lid}`, { method: 'DELETE' }); toast('ลบจุดช่วยเหลือแล้ว', 'success'); location.hash = 'locations'; } catch (e) { fail(e); }
    });

    // Save
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (field) {
        const btn = $('#btnSave'); btn.disabled = true;
        try {
          await call(`/api/admin/locations/${lid}/field`, { method: 'PATCH', body: { status: st.status, lat: form.lat.value, lng: form.lng.value, updates: Object.values(st.updates) } });
          toast('บันทึกการอัปเดตแล้ว ✓', 'success');
        } catch (err) { fail(err); }
        finally { btn.disabled = false; }
        return;
      }
      const body = {
        project_id: st.project_id, code: form.code.value, name: form.name.value, delivery_date: form.delivery_date.value, status: st.status,
        beneficiaries: form.beneficiaries.value, households: form.households.value, supporters: form.supporters.value, description: form.description.value,
        province_id: st.province_id, district_id: st.district_id, subdistrict_id: st.subdistrict_id, village: form.village.value,
        lat: form.lat.value, lng: form.lng.value,
        items: st.items.filter(i => String(i.name || '').trim()).map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
        updates: Object.values(st.updates),
      };
      if (!body.project_id) return toast('กรุณาเลือกโครงการ', 'warning');
      if (!body.code.trim() || !body.name.trim()) return toast('กรุณาระบุรหัสจุดและชื่อจุด', 'warning');
      if (body.lat === '' || body.lng === '') toast('ยังไม่ได้กำหนดพิกัด — จุดนี้จะไม่แสดงบนแผนที่', 'warning');
      const btn = $('#btnSave'); btn.disabled = true;
      try {
        const r = lid ? await call(`/api/admin/locations/${lid}`, { method: 'PUT', body }) : await call('/api/admin/locations', { method: 'POST', body });
        toast('บันทึกเรียบร้อย ✓', 'success');
        if (!lid) location.hash = `locations/edit/${r.id}`;
      } catch (err) { fail(err); }
      finally { btn.disabled = false; }
    });
  }

  // ─────────────── photo upload + grid (shared by editor and Photos tab) ───────────────
  async function resizeImage(file, max, quality) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('อ่านไฟล์ภาพไม่ได้')); i.src = URL.createObjectURL(file); });
    }
    const w = src.width, h = src.height, k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
    return { dataUrl: c.toDataURL('image/jpeg', quality), width: c.width, height: c.height };
  }

  function uploader(el, { locationId, defaultDate, onDone }) {
    el.innerHTML = `
      <div class="upload-opts">
        <label class="field"><span>คำอธิบายภาพ <span class="hint">(ใช้กับทุกภาพในชุดนี้)</span></span><input class="input" id="upCap" maxlength="500" placeholder="เช่น ส่งมอบให้ตัวแทนชุมชน"></label>
        <label class="field"><span>ขั้นตอน</span><select class="input" id="upStage">${Object.entries(STAGES).map(([k, t]) => `<option value="${k}"${k === 'deliver' ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>วันที่ถ่าย</span><input class="input" type="date" id="upDate" value="${esc(defaultDate())}"></label>
      </div>
      <label class="dropzone" id="drop">${icon('image')}<b>แตะเพื่อเลือกภาพ</b> หรือลากไฟล์มาวาง<br><small>JPG / PNG / WEBP · เลือกได้หลายภาพ · ระบบย่อขนาดภาพให้อัตโนมัติ</small>
        <input type="file" id="upFile" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple hidden></label>
      <div class="upload-progress" id="upProg"></div>`;
    const drop = $('#drop', el), input = $('#upFile', el);
    input.onchange = () => { handle([...input.files]); input.value = ''; };
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handle([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))));
    async function handle(files) {
      const lid = locationId();
      if (!lid) return toast('กรุณาเลือกจุดช่วยเหลือก่อนอัปโหลด', 'warning');
      if (!files.length) return;
      const prog = $('#upProg', el);
      const meta = { stage: $('#upStage', el).value, taken_date: $('#upDate', el).value, caption: $('#upCap', el).value };
      // Up to 3 uploads at a time: most of the wait is Google's per-request overhead, not the file itself
      const gas = window.RH.backend === 'apps-script';
      // older Apps Script code can't order parallel answers: upload one at a time there
      const lanes = gas ? (((await call('/api/admin/meta').catch(() => ({}))).api_version || 1) >= 3 ? 3 : 1) : 3;
      let ok = 0, done = 0, next = 0;
      const show = () => { prog.innerHTML = `<div class="row"><span>กำลังอัปโหลด ${Math.min(done + 1, files.length)}/${files.length} ภาพ…</span><span>${Math.round(done / files.length * 100)}%</span></div><div class="progress"><i class="go" style="--w:${Math.max(4, done / files.length * 100)}%"></i></div>`; };
      show();
      const worker = async () => {
        while (next < files.length) {
          const file = files[next++];
          try {
            const full = await resizeImage(file, gas ? 1600 : 1920, 0.82);
            const th = gas ? null : await resizeImage(file, 640, 0.8);
            await call('/api/admin/photos', { method: 'POST', body: { location_id: lid, ...meta, image: full.dataUrl, ...(th ? { thumb: th.dataUrl } : {}), width: full.width, height: full.height } });
            ok++;
          } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
          done++; show();
        }
      };
      await Promise.all(Array.from({ length: Math.min(lanes, files.length) }, worker));
      prog.innerHTML = '';
      if (ok) toast(`อัปโหลดสำเร็จ ${ok} ภาพ`, 'success');
      onDone && onDone();
    }
  }

  function photoGrid(el, photos, { coverId, showLocation = false, onChange }) {
    if (!photos.length) { el.innerHTML = `<p style="color:var(--muted);grid-column:1/-1">ยังไม่มีภาพ</p>`; return; }
    el.innerHTML = photos.map((p, i) => `<div class="ph-item" data-id="${p.id}">
      <div class="img"><img src="${esc(p.thumb_path)}" alt="${esc(p.caption || '')}" loading="lazy" data-view="${i}"><span class="tag">${STAGES[p.stage]}</span>${(coverId ?? p.cover_photo_id) === p.id ? '<span class="cover">ภาพปก</span>' : ''}</div>
      <div class="bd"><span class="cap">${esc(p.caption || 'ไม่มีคำอธิบาย')}</span><span class="meta">${fmtDate(p.taken_date)}${showLocation ? ` · #${esc(p.location_code)} ${esc(p.location_name)}` : ''}${p.uploader_name ? ` · โดย ${esc(p.uploader_name)}` : ''}</span></div>
      <div class="acts">
        ${isSuper() || p.uploaded_by === me.id ? `<button type="button" class="btn btn-outline" data-edit="${p.id}">แก้ไข</button>` : ''}
        <button type="button" class="btn btn-outline" data-cover="${p.id}" data-loc="${p.location_id}" title="ตั้งเป็นภาพปก">★</button>
        ${isSuper() || p.uploaded_by === me.id ? `<button type="button" class="btn btn-ghost-dark" data-del="${p.id}" aria-label="ลบภาพ">${icon('close')}</button>` : ''}
      </div></div>`).join('');
    el.onclick = async e => {
      const v = e.target.closest('[data-view]'); if (v) return Lightbox.open(photos, +v.dataset.view);
      const ed = e.target.closest('[data-edit]'), cv = e.target.closest('[data-cover]'), dl = e.target.closest('[data-del]');
      try {
        if (ed) {
          const p = photos.find(x => x.id === +ed.dataset.edit);
          const ok = await modal({
            title: 'แก้ไขข้อมูลภาพ', body: `<div class="form-grid">
              <img src="${esc(p.thumb_path)}" alt="" class="span-2" style="border-radius:10px;max-height:220px;object-fit:cover;width:100%">
              <label class="field"><span>ขั้นตอน</span><select class="input" name="stage">${Object.entries(STAGES).map(([k, t]) => `<option value="${k}"${k === p.stage ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
              <label class="field"><span>วันที่ถ่าย</span><input class="input" type="date" name="taken_date" value="${esc(p.taken_date || '')}"></label>
              <label class="field span-2"><span>คำอธิบาย</span><input class="input" name="caption" value="${esc(p.caption || '')}" maxlength="500"></label></div>`,
            onSubmit: async f => { await call(`/api/admin/photos/${p.id}`, { method: 'PUT', body: { stage: f.stage.value, taken_date: f.taken_date.value, caption: f.caption.value } }); return true; },
          });
          if (ok) { toast('บันทึกข้อมูลภาพแล้ว', 'success'); onChange && onChange(); }
        } else if (cv) {
          await call(`/api/admin/locations/${cv.dataset.loc}/cover`, { method: 'PUT', body: { photo_id: +cv.dataset.cover } });
          toast('ตั้งเป็นภาพปกแล้ว', 'success'); onChange && onChange();
        } else if (dl) {
          if (!await confirmBox('ลบภาพนี้ถาวร ?')) return;
          await call(`/api/admin/photos/${dl.dataset.del}`, { method: 'DELETE' });
          toast('ลบภาพแล้ว', 'success'); onChange && onChange();
        }
      } catch (err) { fail(err); }
    };
  }

  // ─────────────── PHOTOS (library) ───────────────
  async function pagePhotos(id) {
    const [locs, projects] = await Promise.all([call('/api/admin/locations'), call('/api/admin/projects')]);
    if (id !== renderId) return;
    const f = { project_id: '', location_id: '', stage: '' };
    main.innerHTML = `
      <div class="page-title"><div><h1>ภาพถ่าย</h1><p id="phTotal"></p></div></div>
      <section class="acard"><div class="acard-head"><h2>${icon('plus')} อัปโหลดภาพ</h2></div><div class="acard-body">
        <div class="field" style="margin-bottom:12px"><span>จุดช่วยเหลือ <span class="req">*</span></span><div id="upLoc"></div></div>
        <div id="uploader"></div></div></section>
      <section class="acard"><div class="toolbar"><div id="fProj"></div><div id="fLoc"></div><div id="fStage"></div><div></div></div>
        <div class="acard-body"><div class="ph-grid" id="grid"></div><div class="load-more"><button class="btn btn-outline" id="more" hidden>โหลดเพิ่ม</button></div></div></section>`;
    const locOpts = locs.map(l => ({ value: l.id, label: `#${l.code} · ${l.name}`, sub: `รอบที่ ${l.round_no} · ${areaText(l)}` }));
    let upLoc = '';
    const ss = [
      new SearchSelect($('#upLoc'), { placeholder: '— เลือกจุดช่วยเหลือ —', searchPlaceholder: 'ค้นหารหัส / ชื่อจุด...', options: locOpts, onChange: v => { upLoc = v; } }),
      new SearchSelect($('#fProj'), { allLabel: 'ทุกโครงการ', options: projects.map(p => ({ value: p.id, label: `รอบที่ ${p.round_no} · ${p.name}` })), onChange: v => { f.project_id = v; load(true); } }),
      new SearchSelect($('#fLoc'), { allLabel: 'ทุกจุดช่วยเหลือ', options: locOpts, onChange: v => { f.location_id = v; load(true); } }),
      new SearchSelect($('#fStage'), { allLabel: 'ทุกขั้นตอน', options: Object.entries(STAGES).map(([k, t]) => ({ value: k, label: t })), onChange: v => { f.stage = v; load(true); } }),
    ];
    onCleanup(() => ss.forEach(s => s.destroy()));
    const loc = () => locs.find(l => String(l.id) === upLoc);
    uploader($('#uploader'), { locationId: () => Number(upLoc) || null, defaultDate: () => loc()?.delivery_date || todayISO(), onDone: () => load(true) });

    let photos = [], total = 0;
    async function load(reset) {
      const q = new URLSearchParams({ limit: 48, offset: reset ? 0 : photos.length });
      Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
      const r = await call(`/api/admin/photos?${q}`);
      if (id !== renderId) return;
      photos = reset ? r.photos : photos.concat(r.photos); total = r.total;
      const covers = new Map(locs.map(l => [l.id, l.cover_photo_id]));
      photos.forEach(p => { p.cover_photo_id = covers.get(p.location_id); });
      photoGrid($('#grid'), photos, { showLocation: true, onChange: async () => { const fresh = await call('/api/admin/locations'); fresh.forEach(n => { const o = locs.find(x => x.id === n.id); if (o) o.cover_photo_id = n.cover_photo_id; }); load(true); } });
      $('#phTotal').textContent = `${fmtNum(total)} ภาพ`;
      $('#more').hidden = photos.length >= total;
    }
    $('#more').onclick = () => load(false);
    await load(true);
  }

  // ─────────────── AREAS ───────────────
  async function pageAreas(id) {
    const provs = await provinces(true);
    if (id !== renderId) return;
    const sel = { province: null, district: null };
    main.innerHTML = `
      <div class="page-title"><div><h1>จังหวัด / พื้นที่</h1><p>จัดการรายชื่อจังหวัด อำเภอ และตำบลที่ใช้กับจุดช่วยเหลือ (เพิ่มได้จากหน้าแก้ไขจุดช่วยเหลือด้วย)</p></div></div>
      <div class="areas-grid">
        <section class="acard"><div class="acard-head"><h3>${icon('pin')} จังหวัด <span class="acard-sub">${provs.length}</span></h3><button class="btn btn-outline btn-sm" data-add="provinces">${icon('plus')} เพิ่ม</button></div>
          <div class="toolbar" style="grid-template-columns:1fr"><div class="search-input">${icon('search')}<input class="input" id="qProv" placeholder="ค้นหาจังหวัด"></div></div><ul class="area-list" id="lProv"></ul></section>
        <section class="acard"><div class="acard-head"><h3>อำเภอ / เขต <span class="acard-sub" id="hDist"></span></h3><button class="btn btn-outline btn-sm" data-add="districts">${icon('plus')} เพิ่ม</button></div><ul class="area-list" id="lDist"></ul></section>
        <section class="acard"><div class="acard-head"><h3>ตำบล / แขวง <span class="acard-sub" id="hSub"></span></h3><button class="btn btn-outline btn-sm" data-add="subdistricts">${icon('plus')} เพิ่ม</button></div><ul class="area-list" id="lSub"></ul></section>
      </div>`;
    const row = (kind, r, selected) => `<li class="${selected ? 'sel' : ''}"><button type="button" class="name" data-pick="${kind}" data-id="${r.id}">${esc(r.name_th)}</button>
      <button type="button" class="mini" data-rename="${kind}" data-id="${r.id}" data-name="${esc(r.name_th)}" aria-label="แก้ชื่อ">✎</button>
      <button type="button" class="mini" data-remove="${kind}" data-id="${r.id}" data-name="${esc(r.name_th)}" aria-label="ลบ">${icon('close')}</button></li>`;
    let q = '';
    const drawProv = () => {
      const list = provs.filter(p => !q || p.name_th.includes(q));
      const regions = [...new Set(list.map(p => p.region || 'อื่น ๆ'))];
      $('#lProv').innerHTML = regions.map(rg => `<li class="region">${esc(rg)}</li>${list.filter(p => (p.region || 'อื่น ๆ') === rg).map(p => row('provinces', p, sel.province === p.id)).join('')}`).join('') || '<li class="region">ไม่พบ</li>';
    };
    const drawDist = async force => {
      const pv = provs.find(p => p.id === sel.province);
      $('#hDist').textContent = pv ? `· ${pv.name_th}` : '';
      if (!sel.province) { $('#lDist').innerHTML = '<li class="region">เลือกจังหวัดทางซ้าย</li>'; return; }
      const list = await districts(sel.province, force);
      $('#lDist').innerHTML = list.map(d => row('districts', d, sel.district === d.id)).join('') || '<li class="region">ยังไม่มีอำเภอ — กด “เพิ่ม”</li>';
    };
    const drawSub = async force => {
      const ds = sel.province ? (await districts(sel.province)).find(d => d.id === sel.district) : null;
      $('#hSub').textContent = ds ? `· ${ds.name_th}` : '';
      if (!sel.district) { $('#lSub').innerHTML = '<li class="region">เลือกอำเภอ</li>'; return; }
      const list = await subdistricts(sel.district, force);
      $('#lSub').innerHTML = list.map(s => row('subdistricts', s, false)).join('') || '<li class="region">ยังไม่มีตำบล — กด “เพิ่ม”</li>';
    };
    $('#qProv').oninput = e => { q = e.target.value.trim(); drawProv(); };
    main.addEventListener('click', async e => {
      const pick = e.target.closest('[data-pick]'), add = e.target.closest('[data-add]'), ren = e.target.closest('[data-rename]'), rem = e.target.closest('[data-remove]');
      const label = { provinces: 'จังหวัด', districts: 'อำเภอ', subdistricts: 'ตำบล' };
      try {
        if (pick) {
          if (pick.dataset.pick === 'provinces') { sel.province = +pick.dataset.id; sel.district = null; drawProv(); await drawDist(); await drawSub(); }
          else if (pick.dataset.pick === 'districts') { sel.district = +pick.dataset.id; await drawDist(); await drawSub(); }
        } else if (add) {
          const kind = add.dataset.add;
          const parent = kind === 'districts' ? { province_id: sel.province } : kind === 'subdistricts' ? { district_id: sel.district } : {};
          if (Object.values(parent).some(v => !v)) return toast(kind === 'districts' ? 'กรุณาเลือกจังหวัดก่อน' : 'กรุณาเลือกอำเภอก่อน', 'warning');
          const name = await promptName(`เพิ่ม${label[kind]}`, `ชื่อ${label[kind]}`);
          if (!name) return;
          const r = await call(`/api/admin/${kind}`, { method: 'POST', body: { name_th: name, ...parent } });
          toast(`เพิ่ม${label[kind]}แล้ว`, 'success');
          if (kind === 'provinces') { provs.push({ id: r.id, name_th: name, region: null }); provs.sort((a, b) => a.name_th.localeCompare(b.name_th, 'th')); geoCache.provinces = null; drawProv(); }
          if (kind === 'districts') await drawDist(true);
          if (kind === 'subdistricts') await drawSub(true);
        } else if (ren) {
          const kind = ren.dataset.rename;
          const name = await promptName(`แก้ไขชื่อ${label[kind]}`, `ชื่อ${label[kind]}`, ren.dataset.name);
          if (!name) return;
          await call(`/api/admin/${kind}/${ren.dataset.id}`, { method: 'PUT', body: { name_th: name } });
          toast('บันทึกแล้ว', 'success');
          if (kind === 'provinces') { provs.find(p => p.id === +ren.dataset.id).name_th = name; geoCache.provinces = null; drawProv(); await drawDist(); }
          if (kind === 'districts') await drawDist(true);
          if (kind === 'subdistricts') await drawSub(true);
        } else if (rem) {
          const kind = rem.dataset.remove;
          if (!await confirmBox(`ลบ${label[kind]} <b>${esc(rem.dataset.name)}</b> ?${kind !== 'subdistricts' ? '<br>พื้นที่ย่อยทั้งหมดภายใต้รายการนี้จะถูกลบด้วย' : ''}`)) return;
          await call(`/api/admin/${kind}/${rem.dataset.id}`, { method: 'DELETE' });
          toast('ลบแล้ว', 'success');
          if (kind === 'provinces') { provs.splice(provs.findIndex(p => p.id === +rem.dataset.id), 1); if (sel.province === +rem.dataset.id) sel.province = sel.district = null; geoCache.provinces = null; drawProv(); await drawDist(); await drawSub(); }
          if (kind === 'districts') { if (sel.district === +rem.dataset.id) sel.district = null; await drawDist(true); await drawSub(); }
          if (kind === 'subdistricts') await drawSub(true);
        }
      } catch (err) { fail(err); }
    });
    drawProv(); await drawDist(); await drawSub();
  }

  // ─────────────── ADMINS / MY ACCOUNT ───────────────
  const passwordCard = () => `
      <section class="acard"><div class="acard-head"><h2>${icon('users')} เปลี่ยนรหัสผ่านของฉัน</h2></div><div class="acard-body">
        <form id="pwForm" class="form-grid cols-3" autocomplete="off">
          <label class="field"><span>รหัสผ่านปัจจุบัน</span><input class="input" type="password" name="current_password" autocomplete="current-password" required></label>
          <label class="field"><span>รหัสผ่านใหม่ <span class="hint">(อย่างน้อย 8 ตัว)</span></span><input class="input" type="password" name="new_password" autocomplete="new-password" minlength="8" required></label>
          <label class="field"><span>ยืนยันรหัสผ่านใหม่</span><input class="input" type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>
          <div class="span-3"><button class="btn btn-navy" type="submit">เปลี่ยนรหัสผ่าน</button></div>
        </form></div></section>`;
  function bindPasswordForm() {
    $('#pwForm').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      if (f.new_password.value !== f.confirm.value) return toast('รหัสผ่านใหม่ไม่ตรงกัน', 'warning');
      try {
        await call('/api/admin/me/password', { method: 'PUT', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
        f.reset(); toast('เปลี่ยนรหัสผ่านแล้ว · อุปกรณ์อื่นถูกออกจากระบบ', 'success');
      } catch (err) { fail(err); }
    };
  }
  const roleSelect = (name, value) => `<select class="input" name="${name}">${Object.entries(ROLE_LABEL).map(([k, t]) => `<option value="${k}"${k === value ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const ROLE_HINT = `<p class="hint" style="font-size:12.5px;color:var(--muted);margin-top:6px"><b>ทีมภาคสนาม</b>: อัปโหลดภาพ เปลี่ยนสถานะ ปักพิกัด อัปเดตไทม์ไลน์ · <b>ผู้ดูแลหลัก</b>: ทำได้ทุกอย่าง รวมถึงลบข้อมูลและจัดการบัญชี</p>`;

  async function pageAdmins(id) {
    if (!isSuper()) {
      main.innerHTML = `
        <div class="page-title"><div><h1>บัญชีของฉัน</h1><p>${esc(me.display_name || me.username)} · ${ROLE_LABEL[me.role]}</p></div></div>
        ${passwordCard()}`;
      bindPasswordForm();
      return;
    }
    const rows = await call('/api/admin/admins');
    if (id !== renderId) return;
    main.innerHTML = `
      <div class="page-title"><div><h1>ผู้ดูแลระบบ</h1><p>บัญชีสำหรับทีมรัตนไพบูลย์ · ผู้ดูแลหลัก ${rows.filter(r => r.role === 'super').length} คน · ทีมภาคสนาม ${rows.filter(r => r.role === 'field').length} คน</p></div><button class="btn btn-gold" id="addAdmin">${icon('plus')} เพิ่มบัญชีทีม</button></div>
      <section class="acard"><div id="tbl"></div></section>
      ${passwordCard()}`;
    table($('#tbl'), {
      rows, sort: { key: 'last_login_at', dir: 'desc' },
      cols: [
        { key: 'username', label: 'ชื่อผู้ใช้', render: r => `<b>${esc(r.username)}</b>${r.id === me.id ? ' <span class="chip chip-stage">คุณ</span>' : ''}` },
        { key: 'display_name', label: 'ชื่อที่แสดง' },
        { key: 'role', label: 'สิทธิ์', render: r => `<span class="chip ${r.role === 'super' ? 'chip-delivered' : 'chip-preparing'}">${ROLE_LABEL[r.role] || r.role}</span>` },
        { key: 'created_at', label: 'สร้างเมื่อ', type: 'date', render: r => fmtDate(r.created_at) },
        { key: 'last_login_at', label: 'เข้าสู่ระบบล่าสุด', type: 'date', render: r => r.last_login_at ? `${fmtDate(r.last_login_at)} ${esc(r.last_login_at.slice(11, 16).replace(':', '.'))}` : '-' },
        { key: 'actions', label: '', sortable: false, cls: 'actions', render: r => r.id === me.id ? '' : `
          <button class="btn btn-outline btn-sm" data-edit="${r.id}">แก้ไข / รีเซ็ตรหัส</button>
          <button class="btn btn-ghost-dark btn-sm" data-del="${r.id}" aria-label="ลบ">${icon('close')}</button>` },
      ],
      onRender: el => {
        $$('[data-del]', el).forEach(b => b.onclick = async () => {
          const r = rows.find(x => x.id === +b.dataset.del);
          if (!await confirmBox(`ลบบัญชี <b>${esc(r.username)}</b> ?<br>ภาพที่บัญชีนี้อัปโหลดไว้จะยังอยู่`)) return;
          try { await call(`/api/admin/admins/${r.id}`, { method: 'DELETE' }); toast('ลบบัญชีแล้ว', 'success'); route(); } catch (e) { fail(e); }
        });
        $$('[data-edit]', el).forEach(b => b.onclick = async () => {
          const r = rows.find(x => x.id === +b.dataset.edit);
          const ok = await modal({
            title: `แก้ไขบัญชี ${r.username}`, size: 'sm',
            body: `<div class="form-grid" style="grid-template-columns:1fr">
              <label class="field"><span>ชื่อที่แสดง</span><input class="input" name="display_name" value="${esc(r.display_name || '')}"></label>
              <label class="field"><span>สิทธิ์</span>${roleSelect('role', r.role)}</label>${ROLE_HINT}
              <label class="field"><span>ตั้งรหัสผ่านใหม่ <span class="hint">(เว้นว่างถ้าไม่เปลี่ยน · อย่างน้อย 8 ตัว)</span></span><input class="input" type="password" name="password" autocomplete="new-password"></label></div>`,
            onSubmit: async f => {
              const body = { display_name: f.display_name.value, role: f.role.value };
              if (f.password.value) body.password = f.password.value;
              await call(`/api/admin/admins/${r.id}`, { method: 'PUT', body });
              return true;
            },
          });
          if (ok) { toast('บันทึกบัญชีแล้ว', 'success'); route(); }
        });
      },
    });
    $('#addAdmin').onclick = async () => {
      const ok = await modal({
        title: 'เพิ่มบัญชีทีม', size: 'sm',
        body: `<div class="form-grid" style="grid-template-columns:1fr">
          <label class="field"><span>ชื่อผู้ใช้ <span class="hint">(a-z 0-9 . _ -)</span></span><input class="input" name="username" autocomplete="off" required></label>
          <label class="field"><span>ชื่อที่แสดง</span><input class="input" name="display_name" placeholder="เช่น สมชาย (ทีม W2)"></label>
          <label class="field"><span>สิทธิ์</span>${roleSelect('role', 'field')}</label>${ROLE_HINT}
          <label class="field"><span>รหัสผ่านเริ่มต้น <span class="hint">(อย่างน้อย 8 ตัว)</span></span><input class="input" type="password" name="password" autocomplete="new-password" required></label></div>`,
        onSubmit: async f => { await call('/api/admin/admins', { method: 'POST', body: { username: f.username.value, display_name: f.display_name.value, role: f.role.value, password: f.password.value } }); return true; },
      });
      if (ok) { toast('เพิ่มบัญชีแล้ว', 'success'); route(); }
    };
    bindPasswordForm();
  }

  // ─────────────── boot ───────────────
  (async () => {
    try { me = await api('/api/admin/me'); showApp(); }
    catch { showLogin(); }
  })();
})();
