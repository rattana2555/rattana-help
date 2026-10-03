// RATTANA HELP — shared utilities (public site + admin)
(function () {
  'use strict';
  const CFG = window.RH_CONFIG || { dateEra: 'CE' };

  // ── API ──
  async function api(path, { method = 'GET', body } = {}) {
    const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    if (method !== 'GET') opts.headers['X-Requested-With'] = 'rattana-help';
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) { const e = new Error((data && data.error) || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  }

  // ── Formatting ──
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  function fmtDate(s) {
    if (!s) return '-';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return '-';
    const y = +m[1] + (CFG.dateEra === 'BE' ? 543 : 0);
    return `${m[3]}/${m[2]}/${y}`;
  }
  function fmtDateRange(a, b) {
    if (a && b && a !== b) return `${fmtDate(a)} – ${fmtDate(b)}`;
    return fmtDate(a || b);
  }
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  // Area text — Bangkok uses แขวง/เขต instead of ตำบล/อำเภอ
  function areaText(l, long = false) {
    if (!l) return '-';
    const bkk = l.province === 'กรุงเทพมหานคร';
    const parts = [];
    if (l.subdistrict) parts.push((long ? (bkk ? 'แขวง' : 'ตำบล') : (bkk ? 'แขวง' : 'ต.')) + l.subdistrict);
    if (l.district) parts.push((long ? (bkk ? 'เขต' : 'อำเภอ') : (bkk ? 'เขต' : 'อ.')) + l.district);
    if (l.province) parts.push(bkk ? l.province : (long ? 'จังหวัด' : 'จ.') + l.province);
    return parts.join(' ') || '-';
  }

  const STATUS = {
    preparing: { label: 'กำลังเตรียม', long: 'กำลังเตรียมความช่วยเหลือ', legend: 'จุดช่วยเหลือ', icon: '🤍' },
    in_transit: { label: 'กำลังนำส่ง', long: 'กำลังนำส่ง', legend: 'กำลังนำส่ง', icon: '🚚' },
    delivered: { label: 'ส่งมอบแล้ว', long: 'ส่งมอบแล้ว', legend: 'ส่งมอบแล้ว', icon: '✓' },
  };
  const STAGES = {
    collect: 'รวบรวมสิ่งของ', prepare: 'การจัดเตรียม', transit: 'ระหว่างเดินทาง', deliver: 'การส่งมอบ', after: 'หลังการช่วยเหลือ',
  };
  const STEPS = [
    ['support', 'รับการสนับสนุน'], ['collect', 'รวบรวมสิ่งของ'], ['prepare', 'จัดเตรียมสิ่งของ'],
    ['transit', 'นำส่งพื้นที่'], ['deliver', 'ส่งมอบให้ผู้ประสบภัย'],
  ];
  const statusChip = (s, long = false) => {
    const m = STATUS[s] || STATUS.preparing;
    return `<span class="chip chip-${esc(s)}"><span class="chip-ic" aria-hidden="true">${m.icon}</span>${esc(long ? m.long : m.label)}</span>`;
  };
  const locTitle = l => `จุดส่งต่อความช่วยเหลือ #${esc(l.code)}`;

  // ── Toast ──
  function toast(msg, type = 'info') {
    let wrap = document.getElementById('toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; wrap.setAttribute('aria-live', 'polite'); document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = `toast toast-${type}`; t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  // ── Icons (inline SVG, stroke = currentColor) ──
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
    truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    left: '<path d="m15 6-6 6 6 6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    navigation: '<path d="m3 11 18-8-8 18-2-8z"/>',
    gift: '<rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3 8 4s0 4 4 4zM12 8s1.5-5 4-4 0 4-4 4z"/>',
  };
  const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  // ── Searchable dropdown (company standard: every list > 5 options gets live search) ──
  const openSelects = new Set();
  class SearchSelect {
    constructor(el, o = {}) {
      this.el = el;
      this.o = Object.assign({ options: [], value: '', placeholder: '— เลือก —', allLabel: null, searchPlaceholder: 'ค้นหา...', onChange: null, onAdd: null, addLabel: 'เพิ่มใหม่', disabled: false }, o);
      this.value = this.o.value ?? '';
      this.options = [];
      el.classList.add('ss');
      el.innerHTML = `<button type="button" class="ss-trigger" aria-haspopup="listbox" aria-expanded="false"><span class="ss-label"></span>${icon('chevron', 'ss-chev')}</button>`;
      this.trigger = el.querySelector('.ss-trigger');
      this.labelEl = el.querySelector('.ss-label');
      this.panel = document.createElement('div');
      this.panel.className = 'ss-panel';
      this.panel.hidden = true;
      this.panel.innerHTML = `<div class="ss-search-wrap">${icon('search')}<input class="ss-search" type="text" autocomplete="off" placeholder="${esc(this.o.searchPlaceholder)}"></div><ul class="ss-list" role="listbox"></ul>${this.o.onAdd ? `<button type="button" class="ss-add">${icon('plus')}<span>${esc(this.o.addLabel)}</span></button>` : ''}`;
      document.body.appendChild(this.panel);
      this.search = this.panel.querySelector('.ss-search');
      this.list = this.panel.querySelector('.ss-list');
      this.trigger.addEventListener('click', () => this.panel.hidden ? this.open() : this.close());
      this.search.addEventListener('input', () => this.renderList());
      this.search.addEventListener('keydown', e => this.onKey(e));
      this.list.addEventListener('click', e => { const li = e.target.closest('li[data-v]'); if (li) this.pick(li.dataset.v); });
      if (this.o.onAdd) this.panel.querySelector('.ss-add').addEventListener('click', async () => {
        const q = this.search.value.trim();
        const added = await this.o.onAdd(q);
        if (added) { this.options.push(added); this.pick(String(added.value)); }
      });
      this.setOptions(this.o.options);
      this.setDisabled(this.o.disabled);
    }
    setOptions(opts, keep = true) {
      this.options = (opts || []).map(o => ({ value: String(o.value), label: o.label, sub: o.sub || '' }));
      if (!keep || !this.options.some(o => o.value === String(this.value))) this.value = '';
      this.renderLabel();
      if (!this.panel.hidden) this.renderList();
    }
    setValue(v, silent = true) { this.value = v == null ? '' : String(v); this.renderLabel(); if (!silent && this.o.onChange) this.o.onChange(this.value); }
    getValue() { return this.value; }
    setDisabled(d) { this.trigger.disabled = !!d; this.el.classList.toggle('is-disabled', !!d); }
    renderLabel() {
      const cur = this.options.find(o => o.value === String(this.value));
      this.labelEl.textContent = cur ? cur.label : (this.o.allLabel || this.o.placeholder);
      this.el.classList.toggle('has-value', !!cur);
    }
    all() { return this.o.allLabel ? [{ value: '', label: this.o.allLabel }, ...this.options] : this.options; }
    renderList() {
      const q = this.search.value.trim().toLowerCase();
      const items = this.all().filter(o => !q || (o.label + ' ' + o.sub).toLowerCase().includes(q));
      this.list.innerHTML = items.length
        ? items.map((o, i) => `<li role="option" data-v="${esc(o.value)}" class="${o.value === String(this.value) ? 'is-sel' : ''}${i === 0 ? ' is-active' : ''}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</li>`).join('')
        : `<li class="ss-empty">ไม่พบ “${esc(this.search.value)}”</li>`;
      const add = this.panel.querySelector('.ss-add span');
      if (add) add.textContent = q ? `${this.o.addLabel}: “${this.search.value.trim()}”` : this.o.addLabel;
    }
    place() {
      const r = this.trigger.getBoundingClientRect();
      const w = Math.max(r.width, 220), vw = window.innerWidth, vh = window.innerHeight;
      const below = vh - r.bottom, h = Math.min(320, this.panel.scrollHeight || 320);
      this.panel.style.width = w + 'px';
      this.panel.style.left = Math.min(Math.max(8, r.left), vw - w - 8) + 'px';
      if (below < h + 12 && r.top > below) { this.panel.style.top = ''; this.panel.style.bottom = (vh - r.top + 4) + 'px'; }
      else { this.panel.style.bottom = ''; this.panel.style.top = (r.bottom + 4) + 'px'; }
    }
    open() {
      openSelects.forEach(s => s !== this && s.close());
      this.panel.hidden = false; this.search.value = ''; this.renderList(); this.place();
      this.trigger.setAttribute('aria-expanded', 'true'); this.el.classList.add('is-open');
      openSelects.add(this);
      if (window.matchMedia('(hover: hover)').matches) this.search.focus();
    }
    close() {
      if (this.panel.hidden) return;
      this.panel.hidden = true; this.trigger.setAttribute('aria-expanded', 'false'); this.el.classList.remove('is-open');
      openSelects.delete(this);
    }
    pick(v) { this.close(); const changed = String(v) !== String(this.value); this.setValue(v); if (changed && this.o.onChange) this.o.onChange(this.value); }
    onKey(e) {
      const lis = [...this.list.querySelectorAll('li[data-v]')];
      let i = lis.findIndex(li => li.classList.contains('is-active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); if (!lis.length) return;
        lis[i]?.classList.remove('is-active');
        i = e.key === 'ArrowDown' ? Math.min(lis.length - 1, i + 1) : Math.max(0, i - 1);
        lis[i].classList.add('is-active'); lis[i].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') { e.preventDefault(); if (lis[i]) this.pick(lis[i].dataset.v); }
      else if (e.key === 'Escape') { this.close(); this.trigger.focus(); }
    }
    destroy() { this.close(); this.panel.remove(); }
  }
  document.addEventListener('click', e => {
    openSelects.forEach(s => { if (!s.el.contains(e.target) && !s.panel.contains(e.target)) s.close(); });
  });
  window.addEventListener('resize', () => openSelects.forEach(s => s.close()));
  document.addEventListener('scroll', e => openSelects.forEach(s => { if (!s.panel.contains(e.target)) s.place(); }), true);

  // ── Fullscreen photo viewer ──
  const Lightbox = {
    el: null, photos: [], i: 0,
    build() {
      const el = document.createElement('div');
      el.className = 'lb'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'ภาพการช่วยเหลือ');
      el.innerHTML = `
        <div class="lb-top"><span class="lb-count"></span><div class="lb-actions">
          <button type="button" class="lb-btn lb-fs" aria-label="เต็มจอ">${icon('expand')}</button>
          <button type="button" class="lb-btn lb-close" aria-label="ปิด">${icon('close')}</button></div></div>
        <div class="lb-stage">
          <button type="button" class="lb-nav lb-prev" aria-label="ภาพก่อนหน้า">${icon('left')}</button>
          <img class="lb-img" alt="">
          <button type="button" class="lb-nav lb-next" aria-label="ภาพถัดไป">${icon('right')}</button>
        </div>
        <div class="lb-info"></div>`;
      document.body.appendChild(el);
      this.el = el;
      el.querySelector('.lb-close').onclick = () => this.close();
      el.querySelector('.lb-prev').onclick = () => this.go(-1);
      el.querySelector('.lb-next').onclick = () => this.go(1);
      el.querySelector('.lb-fs').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else el.requestFullscreen?.().catch(() => {});
      };
      el.querySelector('.lb-stage').addEventListener('click', e => { if (e.target.classList.contains('lb-stage')) this.close(); });
      let x0 = null, y0 = null;
      el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
      el.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) this.go(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) this.close();
        x0 = null;
      });
      document.addEventListener('keydown', e => {
        if (this.el.hidden) return;
        if (e.key === 'Escape') this.close();
        else if (e.key === 'ArrowLeft') this.go(-1);
        else if (e.key === 'ArrowRight') this.go(1);
      });
    },
    open(photos, i = 0) {
      if (!photos || !photos.length) return;
      if (!this.el) this.build();
      this.photos = photos; this.i = i; this.lastFocus = document.activeElement;
      this.el.hidden = false; document.body.classList.add('no-scroll');
      this.render(); this.el.querySelector('.lb-close').focus();
    },
    close() {
      if (!this.el || this.el.hidden) return;
      if (document.fullscreenElement) document.exitFullscreen?.();
      this.el.hidden = true; document.body.classList.remove('no-scroll');
      this.lastFocus?.focus?.();
    },
    go(d) { if (this.photos.length < 2) return; this.i = (this.i + d + this.photos.length) % this.photos.length; this.render(); },
    render() {
      const p = this.photos[this.i];
      const img = this.el.querySelector('.lb-img');
      img.src = p.file_path; img.alt = p.caption || STAGES[p.stage] || 'ภาพการช่วยเหลือ';
      this.el.querySelector('.lb-count').textContent = `${this.i + 1} / ${this.photos.length}`;
      this.el.querySelectorAll('.lb-nav').forEach(b => b.hidden = this.photos.length < 2);
      const showLink = !location.hash.startsWith(`#/locations/${p.location_id}`) && !document.body.classList.contains('admin');
      this.el.querySelector('.lb-info').innerHTML = `
        <div class="lb-info-inner">
          <span class="chip chip-stage">${esc(STAGES[p.stage] || '')}</span>
          ${p.caption ? `<p class="lb-cap">${esc(p.caption)}</p>` : ''}
          <div class="lb-meta">
            <span>${icon('calendar')} ${fmtDate(p.taken_date)}</span>
            ${p.province ? `<span>${icon('pin')} ${esc(areaText(p))}</span>` : ''}
          </div>
          ${p.location_code && showLink ? `<a class="lb-link" href="#/locations/${p.location_id}">${locTitle({ code: p.location_code })} · ${esc(p.location_name || '')} ${icon('arrow')}</a>` : ''}
        </div>`;
      const link = this.el.querySelector('.lb-link');
      if (link) link.onclick = () => this.close();
      // preload neighbours
      [1, -1].forEach(d => { const n = this.photos[(this.i + d + this.photos.length) % this.photos.length]; if (n) { const im = new Image(); im.src = n.file_path; } });
    },
  };

  // ── Leaflet helpers ──
  function makeMap(el, opts = {}) {
    const map = L.map(el, Object.assign({ zoomControl: true, attributionControl: true, scrollWheelZoom: true }, opts));
    L.tileLayer(CFG.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: CFG.tileAttribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    map.attributionControl.setPrefix(false);
    return map;
  }
  // 3D pin: glossy head + glyph + ground shadow; drops in, bobs (in transit), sonar ring (delivered)
  function pinHtml(status, { selected = false, delay = 0, mini = false } = {}) {
    const m = STATUS[status] || STATUS.preparing;
    return `<div class="pin3d pin-${esc(status)}${selected ? ' is-sel' : ''}${mini ? ' mini' : ''}" style="--d:${delay}ms"><div class="body"><div class="head"></div><div class="glyph">${m.icon}</div></div><div class="base"></div></div>`;
  }
  function pinIcon(status, selected = false, delay = 0) {
    return L.divIcon({ className: 'pin-wrap', html: pinHtml(status, { selected, delay }), iconSize: [40, 54], iconAnchor: [20, 47], popupAnchor: [0, -44] });
  }
  function setPinSelected(marker, on) {
    const el = marker.getElement && marker.getElement();
    const p = el && el.querySelector('.pin3d');
    if (p) p.classList.toggle('is-sel', on);
    marker.setZIndexOffset(on ? 1000 : 0);
  }

  // ── Motion: scroll reveal, 3D tilt, animated bars ──
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let io = null;
  function observer() {
    if (io || !('IntersectionObserver' in window)) return io;
    io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add(e.target.matches('i') ? 'go' : 'in');
      io.unobserve(e.target); pending.delete(e.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: .08 });
    return io;
  }
  // Fallback sweep: reveal anything on screen even if IntersectionObserver never fires
  const pending = new Set();
  let sweepT = 0;
  function sweep() {
    sweepT = 0;
    const vh = window.innerHeight;
    pending.forEach(el => {
      if (!el.isConnected) { pending.delete(el); return; }
      const r = el.getBoundingClientRect();
      if (r.top < vh * .96 && r.bottom > 0) { el.classList.add(el.matches('i') ? 'go' : 'in'); pending.delete(el); io && io.unobserve(el); }
    });
  }
  const queueSweep = () => { if (!sweepT) sweepT = setTimeout(sweep, 150); };
  window.addEventListener('scroll', queueSweep, { passive: true });
  window.addEventListener('resize', queueSweep);
  const watch = el => { pending.add(el); io.observe(el); };
  const REVEAL = '.section-head, .stat, .card, .loc-card, .proj-card, .step, .note-band, .map-preview, .photo-tile, .round-list li, .hero-card, .hero-photo';
  const TILT = '.loc-card, .proj-card, .stat, .step';
  function enhance(root = document) {
    const obs = observer();
    const instant = reduceMotion() || !obs;
    // reveal with a small stagger among siblings
    root.querySelectorAll(REVEAL).forEach(el => {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      const sibs = [...el.parentElement.children].filter(c => c.matches(REVEAL));
      el.style.setProperty('--rd', `${Math.min(sibs.indexOf(el), 8) * 70}ms`);
      instant ? el.classList.add('in') : watch(el);
    });
    root.querySelectorAll('.bar > i, .progress > i, .seg > i').forEach(i => instant ? i.classList.add('go') : watch(i));
    if (!instant) setTimeout(sweep, 900);
    // 3D tilt only for precise pointers
    if (instant || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    root.querySelectorAll(`${TILT}, [data-tilt]`).forEach(el => {
      if (el.dataset.tiltOn) return;
      el.dataset.tiltOn = '1';
      el.classList.add(el.hasAttribute('data-tilt') ? 'tilt' : 'tilt-card');
      if (!el.querySelector(':scope > .shine')) el.insertAdjacentHTML('beforeend', '<span class="shine" aria-hidden="true"></span>');
      const max = Number(el.dataset.tilt) || 6;
      let raf = 0;
      el.addEventListener('pointermove', e => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
          el.classList.add('is-tilting');
          el.style.setProperty('--ry', `${(x - .5) * max * 2}deg`);
          el.style.setProperty('--rx', `${(.5 - y) * max * 2}deg`);
          el.style.setProperty('--mx', `${x * 100}%`);
          el.style.setProperty('--my', `${y * 100}%`);
        });
      });
      el.addEventListener('pointerleave', () => {
        cancelAnimationFrame(raf);
        el.classList.remove('is-tilting');
        el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
      });
    });
  }

  // Sliding pill under the active nav item (desktop segmented nav + mobile tab bar)
  function navIndicator(nav) {
    let ind = nav.querySelector('.nav-ind');
    if (!ind) { ind = document.createElement('span'); ind.className = 'nav-ind'; nav.prepend(ind); }
    const a = nav.querySelector('a.active');
    if (!a || a.classList.contains('nav-map') || !a.offsetWidth) { ind.style.opacity = '0'; return; }
    const pad = nav.classList.contains('bottomnav') ? 6 : 0;
    ind.style.opacity = '1';
    ind.style.width = `${a.offsetWidth - pad * 2}px`;
    ind.style.transform = `translateX(${a.offsetLeft + pad}px)`;
  }

  // ── LINE OA (external support channel — the app itself never takes orders) ──
  function lineUrl() {
    const u = String((CFG.lineOa && CFG.lineOa.url) || '').trim();
    return /^https:\/\/(lin\.ee|line\.me|page\.line\.me)\//i.test(u) ? u : '';
  }
  const LINE_ICON = '<svg class="ic line-ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.48 3 2 6.6 2 11.05c0 3.98 3.55 7.32 8.35 7.95.33.07.77.22.88.5.1.25.07.65.03.9l-.14.86c-.04.25-.2 1 .88.54 1.07-.45 5.8-3.42 7.92-5.85C21.38 14.33 22 12.76 22 11.05 22 6.6 17.52 3 12 3z"/><text x="12" y="13.4" text-anchor="middle" font-size="5.2" font-weight="800" font-family="Inter, Arial, sans-serif" fill="#06C755">LINE</text></svg>';
  function lineBtn({ label = 'ร่วมสนับสนุนผ่าน LINE', cls = '', showId = false } = {}) {
    const url = lineUrl();
    if (!url) return '';
    const id = CFG.lineOa && CFG.lineOa.id ? String(CFG.lineOa.id) : '';
    return `<a class="btn btn-line ${cls}" href="${esc(url)}" target="_blank" rel="noopener" data-line>${LINE_ICON}<span>${esc(label)}${showId && id ? `<small>${esc(id)}</small>` : ''}</span></a>`;
  }

  // ── Count-up numbers (respects reduced motion) ──
  function countUp(root = document) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.querySelectorAll('[data-count]').forEach(el => {
      const target = Number(el.dataset.count) || 0;
      if (reduce || target === 0) { el.textContent = fmtNum(target); return; }
      const t0 = performance.now(), dur = 900;
      const step = t => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmtNum(Math.round(target * e));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  window.RH = { api, esc, fmtNum, fmtDate, fmtDateRange, todayISO, areaText, STATUS, STAGES, STEPS, statusChip, locTitle, toast, icon, SearchSelect, Lightbox, makeMap, pinHtml, pinIcon, setPinSelected, countUp, enhance, navIndicator, reduceMotion, lineUrl, lineBtn, LINE_ICON, CFG };
})();
