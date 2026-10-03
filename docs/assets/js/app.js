// RATTANA HELP — public site (hash-routed SPA)
(function () {
  'use strict';
  const { ShareCard } = window.RH;
  const { api, esc, fmtNum, pieces, unitName, fmtDate, fmtDateRange, areaText, STATUS, STAGES, STEPS, CATEGORIES, category, catChip, statusChip, locTitle, icon, SearchSelect, Lightbox, makeMap, pinHtml, pinIcon, setPinSelected, countUp, enhance, navIndicator, reduceMotion, lineUrl, lineBtn, LINE_ICON, CFG } = window.RH;
  let view = document.getElementById('view');
  let cleanups = [];
  let renderId = 0;
  const onCleanup = fn => cleanups.push(fn);

  // Small in-memory cache so moving between pages feels instant
  const cache = new Map();
  async function get(url, ttl = 60_000) {
    const hit = cache.get(url);
    if (hit && Date.now() - hit.t < ttl) return hit.d;
    const d = await api(url);
    cache.set(url, { t: Date.now(), d });
    return d;
  }

  const img = (src, alt = '', cls = '') => src
    ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async"${cls ? ` class="${cls}"` : ''}>`
    : `<div class="ph-empty">${icon('image')}</div>`;
  const emptyState = (title, text, ic = 'image') => `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
  /** "80 แพ็ค · 960 ชิ้น" — pieces shown when one unit holds several */
  const qtyText = (q, unit, name) => {
    const p = pieces(q, unit, name), u = unitName(unit);
    return p !== (Number(q) || 0) ? `${fmtNum(q)} ${esc(u)} · ${fmtNum(p)} ชิ้น` : `${fmtNum(q)} ${esc(u)}`;
  };
  const unitLabel = l => l.status === 'delivered' ? 'วันที่ส่งมอบ' : 'กำหนดส่งมอบ';

  // ─────────────── shared blocks ───────────────
  // LINE OA call-to-action (support / ordering happens there, not in this app)
  const supportCard = (title = 'อยากร่วมส่งต่อความช่วยเหลือ?') => lineUrl() ? `
    <div class="card card-pad line-card">
      <div class="line-card-ic">${LINE_ICON}</div>
      <h3>${esc(title)}</h3>
      <p>ร่วมสั่งซื้อสินค้าเพื่อส่งต่อให้ผู้ประสบภัย ผ่าน LINE Official Account ของรัตนไพบูลย์</p>
      ${lineBtn({ label: 'แอดไลน์ ร่วมสนับสนุน', cls: 'btn-block', showId: true })}
    </div>` : '';
  function statGrid(s) {
    const card = (ic, v, unit, label, sub) => `
      <div class="stat">
        <div class="stat-ic">${icon(ic)}</div>
        <div class="stat-v"><span data-count="${Number(v) || 0}">0</span><small>${unit}</small></div>
        <div class="stat-l">${label}</div>
        <div class="stat-s">${sub}</div>
      </div>`;
    return `<div class="stat-grid">
      ${card('pin', s.areas, 'พื้นที่', 'พื้นที่ที่ได้รับความช่วยเหลือ', `ใน ${fmtNum(s.provinces)} จังหวัด`)}
      ${card('truck', s.rounds_total, 'รอบ', 'จำนวนรอบการส่งมอบ', `ส่งมอบแล้ว ${fmtNum(s.delivered_locations)} จุด`)}
      ${card('box', s.items_delivered, 'ชิ้น', 'จำนวนสิ่งของที่ส่งต่อ', 'นับเฉพาะที่ส่งมอบแล้ว')}
      ${card('users', s.beneficiaries, 'คน', 'จำนวนผู้ได้รับความช่วยเหลือ', s.households ? `${fmtNum(s.households)} ครัวเรือน` : 'ข้อมูลจากจุดส่งมอบ')}
    </div>`;
  }

  function locCard(l) {
    return `<a class="loc-card" href="#/locations/${l.id}">
      <div class="ph">${img(l.cover_thumb, l.name)}${statusChip(l.status)}<span class="cat-badge" title="${esc(category(l.project_category).label)}">${category(l.project_category).icon}</span></div>
      <div class="bd">
        <span class="loc-code">${locTitle(l)}</span>
        <span class="loc-name">${esc(l.name)}</span>
        <div class="meta-row">
          <span>${icon('pin')}${esc(areaText(l))}</span>
          <span>${icon('calendar')}${fmtDate(l.delivery_date)}</span>
          ${l.beneficiaries ? `<span>${icon('users')}${fmtNum(l.beneficiaries)} คน</span>` : ''}
        </div>
      </div></a>`;
  }

  function projCard(p) {
    const pct = p.location_count ? Math.round(p.delivered_count / p.location_count * 100) : 0;
    return `<a class="proj-card" href="#/projects/${p.id}">
      <div class="ph">${img(p.cover_thumb, p.name)}</div>
      <div class="bd">
        <div class="flex-between" style="display:flex;justify-content:space-between;gap:8px;align-items:center">
          <span class="proj-round">รอบที่ ${esc(p.round_no)}</span>${statusChip(p.status, true)}
        </div>
        <div>${catChip(p.category)}</div>
        <span class="proj-name">${esc(p.name)}</span>
        <div class="meta-row">
          ${p.provinces ? `<span>${icon('pin')}พื้นที่จังหวัด${esc(p.provinces)}</span>` : ''}
          <span>${icon('calendar')}${fmtDateRange(p.first_date || p.start_date, p.last_date || p.end_date)}</span>
        </div>
        <div class="proj-foot">
          <div style="flex:1;min-width:140px">
            <div class="progress-label"><span>ส่งมอบแล้ว ${p.delivered_count}/${p.location_count} จุด</span><span>${fmtNum(p.beneficiaries)} คน</span></div>
            <div class="progress"><i style="--w:${pct}%"></i></div>
          </div>
        </div>
      </div></a>`;
  }

  function fitTo(map, latlngs, maxZoom = 12) {
    if (!latlngs.length) { map.setView(CFG.mapCenter, CFG.mapZoom); return; }
    if (latlngs.length === 1) { map.setView(latlngs[0], maxZoom); return; }
    map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom });
  }

  // ─────────────── HOME ───────────────
  async function pageHome(id) {
    const [stats, locs, projects] = await Promise.all([get('/api/stats'), get('/api/locations'), get('/api/projects')]);
    if (id !== renderId) return;
    const sorted = [...locs].sort((a, b) => String(b.delivery_date).localeCompare(String(a.delivery_date)));
    const supportBtn = CFG.supportUrl
      ? `<a class="btn btn-gold" href="${esc(CFG.supportUrl)}" target="_blank" rel="noopener">${esc(CFG.supportLabel)} ${icon('external')}</a>` : '';

    view.innerHTML = `
      <section class="hero">
        <div class="hero-media" id="heroMedia"><picture>
          <source srcset="assets/img/hero.webp" type="image/webp">
          <img src="assets/img/hero.jpg" alt="ทีมรัตนไพบูลย์ขนสิ่งของ “ส่งต่อความห่วงใย” ให้ผู้ประสบภัยน้ำท่วม" fetchpriority="high" decoding="async">
        </picture></div>
        <div class="hero-shade"></div>
        <div class="container hero-inner">
          <div class="hero-card glass">
            <div class="hero-badges-m" aria-hidden="true">
              <div class="hero-badge m1"><span class="bi">✓</span><span><b>${fmtNum(stats.delivered_locations)} จุด</b><small>ส่งมอบแล้ว</small></span></div>
              <div class="hero-badge m2"><span class="bi">${icon('users')}</span><span><b>${fmtNum(stats.beneficiaries)} คน</b><small>ได้รับความช่วยเหลือ</small></span></div>
            </div>
            <span class="hero-tag">${icon('heart')} ${esc(CFG.heroTag || 'โครงการช่วยเหลือ · รัตนไพบูลย์')}</span>
            <h1><span class="gold">${esc(CFG.heroTitle || 'คนละไม้ คนละมือ')}</span><span class="rest">${(CFG.heroSubtitle || ['ส่งต่อกำลังใจและความห่วงใย', 'ให้ผู้ประสบภัยน้ำท่วม']).map(esc).join('<br>')}</span></h1>
            <p class="hero-lead">ร่วมสั่งซื้อสินค้า เพื่อส่งต่อให้ผู้ประสบภัย</p>
            <p class="hero-sub">รัตนไพบูลย์ขอร่วมเป็นส่วนหนึ่งในการส่งต่อความช่วยเหลือ พร้อมกับผู้สนับสนุนและผู้ร่วมโครงการ</p>
            <div class="hero-actions">
              ${lineBtn({ label: 'ร่วมสนับสนุนผ่าน LINE', cls: 'hero-line' })}
              <a class="btn btn-gold" href="#/impact">${icon('heart')} ดูการช่วยเหลือของเรา</a>
              <a class="btn btn-glass" href="#/map">${icon('map')} ดูแผนที่การช่วยเหลือ</a>
            </div>
          </div>
          <div class="hero-photo" data-tilt="7">
            <div class="frame"><picture><source srcset="assets/img/hero.webp" type="image/webp"><img src="assets/img/hero.jpg" alt="" decoding="async"></picture></div>
            <div class="hero-badge b1 glass"><span class="bi">✓</span><span><b>${fmtNum(stats.delivered_locations)} จุด</b><small>ส่งมอบแล้ว</small></span></div>
            <div class="hero-badge b2 glass"><span class="bi">${icon('users')}</span><span><b>${fmtNum(stats.beneficiaries)} คน</b><small>ได้รับความช่วยเหลือ</small></span></div>
          </div>
        </div>
      </section>
      <div class="container stats-float">${statGrid(stats)}</div>

      <section class="section">
        <div class="container">
          <div class="section-head">
            <div><span class="eyebrow">Relief Map</span><h2 class="section-title">ความช่วยเหลือถูกส่งไปที่ไหนบ้าง</h2>
            <p class="section-desc">ทุกจุดบนแผนที่คือสถานที่ส่งมอบจริง แตะที่จุดเพื่อดูวันที่ สิ่งของ และภาพการส่งมอบ</p></div>
          </div>
          <div class="map-preview">
            <div class="map" id="homeMap" aria-label="แผนที่การช่วยเหลือ"></div>
            <a class="btn btn-navy btn-sm map-cta" href="#/map">${icon('map')} เปิดแผนที่เต็ม</a>
          </div>
          <div class="legend" style="margin-top:12px">
            ${['preparing', 'in_transit', 'delivered'].map(s => `<span>${pinHtml(s, { mini: true })}${STATUS[s].legend}</span>`).join('')}
          </div>
        </div>
      </section>

      <section class="section" style="padding-top:0">
        <div class="container">
          <div class="section-head">
            <div><span class="eyebrow">Latest updates</span><h2 class="section-title">ความเคลื่อนไหวล่าสุด</h2></div>
            <a class="link-more" href="#/map">ดูทั้งหมด ${icon('arrow')}</a>
          </div>
          ${sorted.length ? `<div class="grid-cards">${sorted.slice(0, 6).map(locCard).join('')}</div>` : emptyState('ยังไม่มีข้อมูลจุดช่วยเหลือ', 'ข้อมูลจะแสดงที่นี่เมื่อทีมงานบันทึกการส่งมอบ', 'pin')}
        </div>
      </section>

      <section class="section" style="padding-top:0">
        <div class="container">
          <div class="section-head">
            <div><span class="eyebrow">Relief rounds</span><h2 class="section-title">รอบการช่วยเหลือ</h2></div>
            <a class="link-more" href="#/projects">ดูโครงการทั้งหมด ${icon('arrow')}</a>
          </div>
          ${projects.length ? `<div class="proj-list">${projects.slice(0, 4).map(projCard).join('')}</div>` : emptyState('ยังไม่มีโครงการ', 'ข้อมูลจะแสดงที่นี่เมื่อเริ่มโครงการ', 'folder')}
        </div>
      </section>

      <section class="section" style="padding-top:0">
        <div class="container">
          <div class="section-head"><div><span class="eyebrow">How it works</span><h2 class="section-title">เส้นทางของความช่วยเหลือ</h2>
          <p class="section-desc">ทุกการสนับสนุนถูกติดตามตั้งแต่ต้นทางจนถึงมือผู้ประสบภัย</p></div></div>
          <div class="steps">
            ${STEPS.map(([, t], i) => `<div class="step"><span class="step-n">${i + 1}</span><div><h4>${t}</h4><p>${[
              'ผู้สนับสนุนร่วมสั่งซื้อสินค้าผ่านช่องทางของรัตนไพบูลย์',
              'รวบรวมสินค้าที่คลังสินค้าของรัตนไพบูลย์',
              'คัดแยก บรรจุเป็นชุด และตรวจนับจำนวน',
              'ทีมงานนำส่งถึงพื้นที่ที่ได้รับผลกระทบ',
              'ส่งมอบถึงมือผู้ประสบภัย พร้อมบันทึกภาพจริง',
            ][i]}</p></div></div>`).join('')}
          </div>
          <div class="note-band" style="margin-top:20px">
            <div>
              <h3>แอปนี้ใช้ติดตามผลการช่วยเหลือเท่านั้น</h3>
              <p>การร่วมสั่งซื้อสินค้าหรือการสนับสนุนทำผ่าน${lineUrl() ? ' LINE Official Account ของ' : 'ช่องทางของ'}รัตนไพบูลย์โดยตรง RATTANA HELP เป็นศูนย์กลางแสดงข้อมูลว่าความช่วยเหลือถูกส่งไปที่ไหน เมื่อไหร่ และถึงมือใครบ้าง</p>
            </div>
            <div class="note-actions">${lineBtn({ label: 'แอดไลน์ ร่วมสนับสนุน', showId: true })}${supportBtn}</div>
          </div>
        </div>
      </section>`;
    countUp(view);

    // Hero parallax (photo drifts slower than the page). CSS scroll-driven animation handles it where supported;
    // otherwise move the photo layer once per frame (still a compositor-only transform, so phones stay smooth).
    const media = document.getElementById('heroMedia');
    if (!reduceMotion() && !(window.CSS && CSS.supports('animation-timeline: scroll()'))) {
      media.style.willChange = 'transform';
      let raf = 0, last = -1;
      const onScroll = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; const y = Math.round(Math.min(window.scrollY, 900) * 0.32); if (y === last) return; last = y; media.style.transform = `translate3d(0, ${y}px, 0)`; }); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => window.removeEventListener('scroll', onScroll));
    }

    const mapEl = document.getElementById('homeMap');
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const map = makeMap(mapEl, { scrollWheelZoom: false, dragging: !touch, tap: false, zoomControl: !touch });
    onCleanup(() => map.remove());
    const geo = locs.filter(l => l.lat != null && l.lng != null);
    fitTo(map, geo.map(l => [l.lat, l.lng]), 11);
    // Drop the 3D pins in when the map scrolls into view
    let dropped = false;
    const drop = () => {
      if (dropped) return; dropped = true;
      geo.forEach((l, i) => L.marker([l.lat, l.lng], { icon: pinIcon(l.status, false, i * 110), title: `#${l.code} ${l.name}`, riseOnHover: true })
        .on('click', () => { location.hash = `#/map?loc=${l.id}`; }).addTo(map));
    };
    if ('IntersectionObserver' in window) {
      const o = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { drop(); o.disconnect(); } }, { threshold: .35 });
      o.observe(mapEl); onCleanup(() => o.disconnect());
    } else drop();
    const check = () => { const r = mapEl.getBoundingClientRect(); if (r.top < window.innerHeight * .8 && r.bottom > 0) drop(); };
    window.addEventListener('scroll', check, { passive: true });
    onCleanup(() => window.removeEventListener('scroll', check));
    setTimeout(check, 1000);
  }

  // ─────────────── RELIEF MAP ───────────────
  async function pageMap(id, params) {
    document.body.classList.add('is-map');
    onCleanup(() => document.body.classList.remove('is-map'));
    const locs = await get('/api/locations');
    if (id !== renderId) return;

    const st = { on: { preparing: true, in_transit: true, delivered: true }, province: params.get('province') || '', project: params.get('project') || '', selected: null, mode: 'list' };
    const desktop = () => window.matchMedia('(min-width: 900px)').matches;

    view.innerHTML = `
      <div class="mapview">
        <div class="map" id="reliefMap" aria-label="แผนที่การช่วยเหลือ"></div>
        <div class="map-legend" id="legend" role="group" aria-label="กรองตามสถานะ"></div>
        <aside class="sheet" id="sheet" aria-label="รายการจุดช่วยเหลือ">
          <button type="button" class="sheet-handle" id="sheetHandle">
            <span class="sheet-sum"><span><b>แผนที่การช่วยเหลือ</b><small id="sumText"></small></span><span class="toggle" id="sheetToggle">${icon('list')} รายการ</span></span>
          </button>
          <div class="sheet-body" id="sheetBody"></div>
        </aside>
      </div>`;
    const sheet = document.getElementById('sheet');
    const body = document.getElementById('sheetBody');
    const map = makeMap(document.getElementById('reliefMap'), { zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    onCleanup(() => map.remove());
    const layer = L.layerGroup().addTo(map);
    const markers = new Map();
    locs.forEach((l, i) => {
      if (l.lat == null || l.lng == null) return;
      const m = L.marker([l.lat, l.lng], { icon: pinIcon(l.status, false, 200 + i * 90), title: `#${l.code} ${l.name}`, keyboard: true, riseOnHover: true });
      m.on('click', () => select(l.id, true));
      markers.set(l.id, m);
    });

    const visible = () => locs.filter(l => st.on[l.status]
      && (!st.category || l.project_category === st.category)
      && (!st.province || String(l.province_id) === st.province)
      && (!st.project || String(l.project_id) === st.project))
      .sort((a, b) => String(b.delivery_date).localeCompare(String(a.delivery_date)));

    // Status legend = filter
    const legend = document.getElementById('legend');
    const renderLegend = () => {
      legend.innerHTML = ['preparing', 'in_transit', 'delivered'].map(s => {
        const n = locs.filter(l => l.status === s).length;
        return `<button type="button" class="lchip${st.on[s] ? '' : ' off'}" data-s="${s}" aria-pressed="${st.on[s]}">${pinHtml(s, { mini: true })}${STATUS[s].legend}<span class="n">${n}</span></button>`;
      }).join('');
    };
    legend.addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      st.on[b.dataset.s] = !st.on[b.dataset.s];
      if (!Object.values(st.on).some(Boolean)) st.on[b.dataset.s] = true; // keep at least one
      renderLegend(); refresh(true);
    });

    const provinces = [...new Map(locs.filter(l => l.province_id).map(l => [l.province_id, l.province])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'th'));
    const projects = [...new Map(locs.map(l => [l.project_id, `รอบที่ ${l.round_no} · ${l.project_name}`])).entries()].sort((a, b) => b[1].localeCompare(a[1], 'th'));
    const cats = [...new Set(locs.map(l => l.project_category))].filter(Boolean);
    let ssProv, ssProj, ssCat;

    function renderList() {
      st.mode = 'list';
      sheet.classList.remove('is-detail');
      document.getElementById('sheetToggle').innerHTML = `${icon('list')} รายการ`;
      ssProv?.destroy(); ssProj?.destroy(); ssCat?.destroy();
      body.innerHTML = `
        <div class="map-filters">
          <div id="fCat"></div><div id="fProv"></div><div id="fProj" class="full"></div>
        </div>
        <ul class="loc-list" id="locList"></ul>`;
      ssProv = new SearchSelect(document.getElementById('fProv'), {
        allLabel: 'ทุกจังหวัด', value: st.province, searchPlaceholder: 'ค้นหาจังหวัด...',
        options: provinces.map(([v, label]) => ({ value: v, label })),
        onChange: v => { st.province = v; refresh(true); },
      });
      ssProj = new SearchSelect(document.getElementById('fProj'), {
        allLabel: 'ทุกโครงการ / รอบ', value: st.project, searchPlaceholder: 'ค้นหารอบ...',
        options: projects.map(([v, label]) => ({ value: v, label })),
        onChange: v => { st.project = v; refresh(true); },
      });
      ssCat = new SearchSelect(document.getElementById('fCat'), {
        allLabel: 'ทุกประเภท', value: st.category || '',
        options: cats.map(k => ({ value: k, label: `${category(k).icon} ${category(k).label}` })),
        onChange: v => { st.category = v; refresh(true); },
      });
      renderRows();
    }
    onCleanup(() => { ssProv?.destroy(); ssProj?.destroy(); ssCat?.destroy(); });

    function renderRows() {
      const ul = document.getElementById('locList');
      if (!ul) return;
      const rows = visible();
      ul.innerHTML = rows.length ? rows.map(l => `
        <li><button type="button" class="loc-row${st.selected === l.id ? ' is-sel' : ''}" data-id="${l.id}">
          <span class="th">${img(l.cover_thumb, '')}</span>
          <span class="tx">
            <span class="nm">#${esc(l.code)} · ${esc(l.name)}</span>
            <span class="ar">${esc(areaText(l))}</span>
            <span class="ft">${statusChip(l.status)}<span>${fmtDate(l.delivery_date)}</span></span>
          </span></button></li>`).join('')
        : `<li>${emptyState('ไม่พบจุดช่วยเหลือ', 'ลองเปลี่ยนตัวกรองสถานะหรือพื้นที่', 'pin')}</li>`;
    }
    body.addEventListener('click', e => {
      const row = e.target.closest('.loc-row');
      if (row) select(Number(row.dataset.id), true);
    });

    function refresh(fit) {
      const rows = visible();
      layer.clearLayers();
      rows.forEach(l => markers.get(l.id)?.addTo(layer));
      document.getElementById('sumText').textContent = `${rows.length} จุดช่วยเหลือ · ส่งมอบแล้ว ${rows.filter(l => l.status === 'delivered').length} จุด`;
      if (st.mode === 'list') renderRows();
      if (fit) fitTo(map, rows.filter(l => l.lat != null).map(l => [l.lat, l.lng]), 11);
      if (st.selected) setSelectedMarker(st.selected);
    }

    function setSelectedMarker(idSel) {
      markers.forEach((m, lid) => setPinSelected(m, lid === idSel));
    }

    async function select(lid, fromUser) {
      st.selected = lid;
      setSelectedMarker(lid);
      history.replaceState(null, '', `#/map?loc=${lid}`);
      st.mode = 'detail';
      sheet.classList.add('is-open', 'is-detail');
      document.getElementById('sheetToggle').innerHTML = `${icon('close')} ปิด`;
      ssProv?.destroy(); ssProj?.destroy(); ssCat?.destroy(); ssProv = ssProj = ssCat = null;
      body.innerHTML = `<div class="loading" style="min-height:200px"><div class="spinner"></div></div>`;
      body.scrollTop = 0;
      const l = locs.find(x => x.id === lid);
      if (l && l.lat != null) {
        const zoom = Math.max(map.getZoom() || 0, 11);
        if (desktop()) {
          if (fromUser) map.flyTo([l.lat, l.lng], zoom, { duration: .6 });
          else map.setView([l.lat, l.lng], zoom);
        } else {
          // Mobile: centre the pin in the strip of map left visible above the bottom sheet
          // Detail sheet = 62% of .mapview, floating above the tab bar (see .sheet / .sheet.is-detail)
          map.setView([l.lat, l.lng], zoom, { animate: false });
          const ph = sheet.parentElement.clientHeight;
          const tabbar = parseFloat(getComputedStyle(sheet).bottom) || 0;
          const visibleH = ph - ph * 0.62 - tabbar;
          const target = map.latLngToContainerPoint([l.lat, l.lng]);
          map.panBy([0, target.y - Math.max(95, (visibleH + 60) / 2)], { animate: false });
        }
        setSelectedMarker(lid); // marker elements only exist once the map has a view
      }
      let d;
      try { d = await get(`/api/locations/${lid}`, 30_000); } catch (e) { body.innerHTML = emptyState('โหลดข้อมูลไม่สำเร็จ', e.message, 'pin'); return; }
      if (st.selected !== lid || id !== renderId) return;
      body.innerHTML = `<div class="dcard">${detailCard(d)}</div>`;
      body.querySelector('.dcard-back').onclick = () => { st.selected = null; setSelectedMarker(null); history.replaceState(null, '', '#/map'); renderList(); refresh(false); };
      const photos = orderForDelivery(d.photos);
      body.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => Lightbox.open(photos, Number(b.dataset.ph)));
      const btn = body.querySelector('.js-photos');
      if (btn) btn.onclick = () => Lightbox.open(photos, 0);
      body.querySelector('.js-share').onclick = () => ShareCard.open(ShareCard.fromLocation(d));
    }

    document.getElementById('sheetHandle').addEventListener('click', () => {
      if (desktop()) return;
      if (st.mode === 'detail') { st.selected = null; setSelectedMarker(null); history.replaceState(null, '', '#/map'); sheet.classList.remove('is-open'); renderList(); refresh(false); return; }
      sheet.classList.toggle('is-open');
    });

    renderLegend();
    renderList();
    const initial = Number(params.get('loc'));
    refresh(!initial);
    if (initial && locs.some(l => l.id === initial)) select(initial, false);
    else if (initial) refresh(true);
  }

  // Delivery photos first, then everything else in process order
  function orderForDelivery(photos) {
    const rank = { deliver: 0, after: 1, transit: 2, prepare: 3, collect: 4 };
    return [...photos].sort((a, b) => (rank[a.stage] - rank[b.stage]) || (a.sort_order - b.sort_order) || (a.id - b.id));
  }

  function areaLines(l) {
    const bkk = l.province === 'กรุงเทพมหานคร';
    return [
      l.village ? esc(l.village) : '',
      l.subdistrict ? `${bkk ? 'แขวง' : 'ตำบล'}${esc(l.subdistrict)}` : '',
      l.district ? `${bkk ? 'เขต' : 'อำเภอ'}${esc(l.district)}` : '',
      l.province ? `${bkk ? '' : 'จังหวัด'}${esc(l.province)}` : '',
    ].filter(Boolean).join('<br>') || '-';
  }

  function detailCard(d) {
    const photos = orderForDelivery(d.photos);
    const shown = photos.slice(0, 3);
    const extra = photos.length - shown.length;
    return `
      <button type="button" class="dcard-back">${icon('back')} กลับไปที่รายการ</button>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${statusChip(d.status, true)}${catChip(d.project_category)}<span style="flex:1"></span>${ShareCard.button('on-light js-share')}</div>
      <h2 class="dcard-title" style="margin-top:8px">${locTitle(d)}</h2>
      <p class="dcard-name">${esc(d.name)} · รอบที่ ${esc(d.round_no)}</p>
      ${shown.length ? `<div class="dcard-photos n${shown.length}">${shown.map((p, i) => `
        <button type="button" data-ph="${i}" aria-label="ดูภาพ ${i + 1}">${img(p.thumb_path, p.caption || '')}${i === shown.length - 1 && extra > 0 ? `<span class="more">+${extra}</span>` : ''}</button>`).join('')}</div>` : ''}
      <ul class="facts">
        <li><span class="em">📍</span><div><div class="k">พื้นที่</div><div class="v">${areaLines(d)}</div></div></li>
        <li><span class="em">📅</span><div><div class="k">${unitLabel(d)}</div><div class="v">${fmtDate(d.delivery_date)}</div></div></li>
        <li><span class="em">📦</span><div><div class="k">สิ่งของที่ส่งมอบ</div>
          ${d.items.length ? `<ul class="item-list">${d.items.map(i => `<li><span>${esc(i.name)}</span><b>${qtyText(i.quantity, i.unit, i.name)}</b></li>`).join('')}</ul>` : '<div class="v">-</div>'}</div></li>
        <li><span class="em">👥</span><div><div class="k">จำนวนผู้ได้รับความช่วยเหลือ${d.status === 'delivered' ? '' : ' (เป้าหมาย)'}</div><div class="v big">${fmtNum(d.beneficiaries)} คน</div></div></li>
        <li><span class="em">${d.status === 'delivered' ? '✅' : STATUS[d.status].icon}</span><div><div class="k">สถานะ</div><div class="v">${statusChip(d.status, true)}</div></div></li>
      </ul>
      ${lineUrl() ? `<a class="dcard-line" href="${esc(lineUrl())}" target="_blank" rel="noopener">${LINE_ICON}<span>อยากร่วมส่งต่อความช่วยเหลือ? <b>แอดไลน์ ${esc(CFG.lineOa.id || '')}</b></span></a>` : ''}
      <div class="dcard-actions">
        <button type="button" class="btn btn-gold js-photos"${photos.length ? '' : ' disabled style="opacity:.5"'}>${icon('image')} ${photos.length ? 'ดูภาพการส่งมอบ' : 'ยังไม่มีภาพ'}</button>
        <a class="btn btn-outline" href="#/locations/${d.id}">ดูรายละเอียดเพิ่มเติม ${icon('arrow')}</a>
      </div>`;
  }

  // ─────────────── LOCATION DETAIL ───────────────
  async function pageLocation(id, params, lid) {
    const d = await get(`/api/locations/${lid}`, 30_000);
    if (id !== renderId) return;
    const photos = d.photos;
    const upd = Object.fromEntries(d.updates.map(u => [u.step, u]));
    const firstPending = STEPS.findIndex(([k]) => !upd[k]);
    const byId = Object.fromEntries(photos.map((p, i) => [p.id, i]));
    document.title = `#${d.code} ${d.name} · RATTANA HELP`;

    const timeline = STEPS.map(([k, label], i) => {
      const u = upd[k];
      const stepPhotos = u?.photo_id && byId[u.photo_id] !== undefined ? [byId[u.photo_id]]
        : photos.map((p, pi) => p.stage === k ? pi : -1).filter(x => x >= 0).slice(0, 3);
      const cls = u ? 'done' : (i === firstPending && d.status !== 'delivered' ? 'current' : '');
      return `<li class="tl-step ${cls}">
        <span class="tl-dot">${u ? '✓' : i + 1}</span>
        <div>
          <div class="tl-head"><h4>${i + 1}. ${label}</h4>${u?.update_date ? `<span class="tl-date">${fmtDate(u.update_date)}</span>` : ''}${cls === 'current' ? '<span class="tl-state">ขั้นตอนถัดไป</span>' : ''}</div>
          ${u?.note ? `<p class="tl-note">${esc(u.note)}</p>` : (!u ? '<p class="tl-note">ยังไม่ถึงขั้นตอนนี้</p>' : '')}
          ${u && stepPhotos.length ? `<div class="tl-photos">${stepPhotos.map(pi => `<button type="button" data-ph="${pi}" aria-label="ดูภาพ">${img(photos[pi].thumb_path, photos[pi].caption)}</button>`).join('')}</div>` : ''}
        </div></li>`;
    }).join('');

    const stagesPresent = Object.keys(STAGES).filter(s => photos.some(p => p.stage === s));

    view.innerHTML = `
      <section class="dhero">
        <img src="${esc(d.cover_url || 'assets/img/hero.webp')}" alt="${esc(d.name)}">
        ${photos.length ? `<button type="button" class="dhero-photos-btn js-all">${icon('image')} ภาพทั้งหมด ${photos.length}</button>` : ''}
        <div class="container">
          <nav class="crumbs" aria-label="breadcrumb"><a href="#/projects">โครงการ</a><span class="sep">›</span><a href="#/projects/${d.project_id}">รอบที่ ${esc(d.round_no)}</a><span class="sep">›</span><span>#${esc(d.code)}</span></nav>
          <h1>${locTitle(d)}</h1>
          <p class="sub">${esc(d.name)}</p>
          <div class="row">${statusChip(d.status, true)}<span class="chip chip-round">รอบที่ ${esc(d.round_no)}</span>${catChip(d.project_category)}</div>
          <div class="row">${ShareCard.button('js-share')}</div>
        </div>
      </section>

      <div class="container">
        <div class="detail-grid">
          <div class="detail-main">
            ${d.description ? `<div class="card card-pad"><h3 class="card-title">${icon('heart')} รายละเอียด</h3><p class="prose">${esc(d.description)}</p></div>` : ''}

            <div class="card card-pad">
              <h3 class="card-title">${icon('box')} สิ่งของที่ส่งมอบ</h3>
              ${d.items.length ? `<table class="items-table"><tbody>${d.items.map(i => `<tr><td><span class="dot"></span>${esc(i.name)}</td><td class="q">${fmtNum(i.quantity)}<small>${esc(unitName(i.unit))}${pieces(i.quantity, i.unit, i.name) !== (i.quantity || 0) ? ` · ${fmtNum(pieces(i.quantity, i.unit, i.name))} ชิ้น` : ''}</small></td></tr>`).join('')}</tbody></table>` : '<p class="txt-muted">ยังไม่มีรายการสิ่งของ</p>'}
            </div>

            <div class="card card-pad">
              <h3 class="card-title">${icon('truck')} ขั้นตอนการช่วยเหลือ</h3>
              <ol class="timeline">${timeline}</ol>
            </div>

            <div class="card card-pad" id="photos">
              <h3 class="card-title">${icon('image')} ภาพการช่วยเหลือ</h3>
              ${photos.length ? `
                <div class="chips-row stage-tabs" id="stageTabs">
                  <button type="button" class="fchip on" data-stage="">ทั้งหมด <span class="n">${photos.length}</span></button>
                  ${stagesPresent.map(s => `<button type="button" class="fchip" data-stage="${s}">${STAGES[s]} <span class="n">${photos.filter(p => p.stage === s).length}</span></button>`).join('')}
                </div>
                <div class="photo-grid" id="locPhotos"></div>` : emptyState('ยังไม่มีภาพ', 'ทีมงานจะอัปโหลดภาพเมื่อดำเนินการในแต่ละขั้นตอน')}
            </div>
          </div>

          <aside class="detail-aside">
            <div class="card card-pad">
              <div class="k txt-muted" style="font-size:13px;font-weight:600;color:var(--muted)">จำนวนผู้ได้รับความช่วยเหลือ${d.status === 'delivered' ? '' : ' (เป้าหมาย)'}</div>
              <div class="big-num"><b>${fmtNum(d.beneficiaries)}</b><span>คน</span></div>
              ${d.households ? `<div style="color:var(--muted);font-size:14px">${fmtNum(d.households)} ครัวเรือน</div>` : ''}
              <ul class="kv" style="margin-top:10px">
                <li><span class="k">ชื่อโครงการ</span><span class="v"><a href="#/projects/${d.project_id}">${esc(d.project_name)}</a></span></li>
                <li><span class="k">รอบการช่วยเหลือ</span><span class="v">รอบที่ ${esc(d.round_no)}</span></li>
                <li><span class="k">${unitLabel(d)}</span><span class="v">${fmtDate(d.delivery_date)}</span></li>
                <li><span class="k">พื้นที่</span><span class="v">${areaLines(d)}</span></li>
                <li><span class="k">สิ่งของรวม</span><span class="v">${fmtNum(d.items_total)} ชิ้น</span></li>
                ${d.supporters ? `<li><span class="k">ผู้ร่วมสนับสนุน</span><span class="v">${esc(d.supporters)}</span></li>` : ''}
              </ul>
            </div>
            ${d.lat != null ? `<div class="card card-pad">
              <h3 class="card-title">${icon('pin')} ตำแหน่งบนแผนที่</h3>
              <div class="mini-map" id="miniMap"></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
                <a class="btn btn-outline btn-sm" href="#/map?loc=${d.id}">${icon('map')} ดูบนแผนที่</a>
                <a class="btn btn-outline btn-sm" href="https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lng}" target="_blank" rel="noopener">${icon('navigation')} Google Maps</a>
              </div></div>` : ''}
            ${supportCard()}
          </aside>
        </div>

        ${d.siblings.length ? `<section style="padding-bottom:48px">
          <div class="section-head"><div><span class="eyebrow">รอบที่ ${esc(d.round_no)}</span><h2 class="section-title">จุดอื่นในรอบนี้</h2></div>
          <a class="link-more" href="#/projects/${d.project_id}">ดูโครงการ ${icon('arrow')}</a></div>
          <div class="grid-cards">${d.siblings.slice(0, 6).map(s => locCard({ ...s, beneficiaries: 0 })).join('')}</div>
        </section>` : ''}
      </div>`;

    const grid = document.getElementById('locPhotos');
    const renderGrid = stage => {
      if (!grid) return;
      grid.innerHTML = photos.map((p, i) => (!stage || p.stage === stage) ? `
        <button type="button" class="photo-tile" data-ph="${i}">
          ${img(p.thumb_path, p.caption || STAGES[p.stage])}<span class="tag">${STAGES[p.stage]}</span>
          <span class="cap"><b>${esc(p.caption || STAGES[p.stage])}</b><span>${fmtDate(p.taken_date)}</span></span>
        </button>` : '').join('');
    };
    renderGrid('');
    document.getElementById('stageTabs')?.addEventListener('click', e => {
      const b = e.target.closest('[data-stage]'); if (!b) return;
      document.querySelectorAll('#stageTabs .fchip').forEach(x => x.classList.toggle('on', x === b));
      renderGrid(b.dataset.stage);
    });
    view.addEventListener('click', e => {
      const t = e.target.closest('[data-ph]');
      if (t && view.contains(t)) Lightbox.open(photos, Number(t.dataset.ph));
    });
    view.querySelector('.js-all')?.addEventListener('click', () => Lightbox.open(orderForDelivery(photos), 0));
    view.querySelector('.js-share').addEventListener('click', () => ShareCard.open(ShareCard.fromLocation(d)));

    if (d.lat != null) {
      const touch = window.matchMedia('(pointer: coarse)').matches;
      const mm = makeMap(document.getElementById('miniMap'), { scrollWheelZoom: false, dragging: !touch, tap: false });
      L.marker([d.lat, d.lng], { icon: pinIcon(d.status, true) }).addTo(mm);
      mm.setView([d.lat, d.lng], 12);
      onCleanup(() => mm.remove());
    }
  }

  // ─────────────── PROJECTS ───────────────
  async function pageProjects(id, params) {
    const projects = await get('/api/projects');
    if (id !== renderId) return;
    let filter = params.get('status') || '', cat = params.get('category') || '';
    view.innerHTML = `
      <section class="page-head"><div class="container">
        <span class="eyebrow">Relief Projects</span>
        <h1>โครงการช่วยเหลือ</h1>
        <p>โครงการและรอบการช่วยเหลือทั้งหมดของรัตนไพบูลย์ กดเพื่อดูรายละเอียด จุดส่งมอบ และภาพถ่ายของแต่ละรอบ</p>
      </div></section>
      <div class="container" style="padding:20px 16px 48px">
        <div class="chips-row" id="catFilter" style="margin-bottom:8px"></div>
        <div class="chips-row" id="projFilter" style="margin-bottom:16px"></div>
        <div class="proj-list" id="projList"></div>
      </div>`;
    const render = () => {
      const counts = { '': projects.length };
      projects.forEach(p => counts[p.status] = (counts[p.status] || 0) + 1);
      document.getElementById('projFilter').innerHTML = [['', 'ทั้งหมด'], ['preparing', 'กำลังเตรียม'], ['in_transit', 'กำลังนำส่ง'], ['delivered', 'ส่งมอบแล้ว']]
        .map(([k, t]) => `<button type="button" class="fchip${filter === k ? ' on' : ''}" data-f="${k}">${t} <span class="n">${counts[k] || 0}</span></button>`).join('');
      const present = [...new Set(projects.map(p => p.category))];
      document.getElementById('catFilter').innerHTML = present.length > 1 ? [['', 'ทุกประเภท', '']].concat(present.map(k => [k, category(k).label, category(k).icon]))
        .map(([k, t, ic]) => `<button type="button" class="fchip${cat === k ? ' on' : ''}" data-c="${k}">${ic ? `${ic} ` : ''}${t} <span class="n">${k ? projects.filter(p => p.category === k).length : projects.length}</span></button>`).join('') : '';
      const rows = projects.filter(p => (!filter || p.status === filter) && (!cat || p.category === cat));
      document.getElementById('projList').innerHTML = rows.length ? rows.map(projCard).join('') : emptyState('ไม่พบโครงการ', 'ยังไม่มีโครงการในสถานะนี้', 'folder');
    };
    document.getElementById('projFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      filter = b.dataset.f; render();
    });
    document.getElementById('catFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      cat = b.dataset.c; render();
    });
    render();
  }

  async function pageProject(id, params, pid) {
    const p = await get(`/api/projects/${pid}`);
    if (id !== renderId) return;
    document.title = `รอบที่ ${p.round_no} ${p.name} · RATTANA HELP`;
    const pct = p.location_count ? Math.round(p.delivered_count / p.location_count * 100) : 0;
    view.innerHTML = `
      <section class="page-head"><div class="container">
        <nav class="crumbs"><a href="#/projects">โครงการ</a><span class="sep">›</span><span>รอบที่ ${esc(p.round_no)}</span></nav>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px"><span class="chip chip-round">รอบที่ ${esc(p.round_no)}</span>${statusChip(p.status, true)}${catChip(p.category)}</div>
        <h1>${esc(p.name)}</h1>
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ''}
        <div class="meta-row" style="color:rgba(255,255,255,.75);margin-top:10px">
          <span>${icon('calendar')}${fmtDateRange(p.start_date || p.first_date, p.end_date || p.last_date)}</span>
          ${p.provinces ? `<span>${icon('pin')}พื้นที่จังหวัด${esc(p.provinces)}</span>` : ''}
        </div>
        <div style="margin-top:16px">${ShareCard.button('js-share')}</div>
      </div></section>
      <div class="container" style="padding-top:20px;padding-bottom:48px">
        <div class="stat-grid">
          <div class="stat"><div class="stat-v">${fmtNum(p.location_count)}<small>จุด</small></div><div class="stat-l">จุดช่วยเหลือ</div><div class="stat-s">ส่งมอบแล้ว ${p.delivered_count} จุด</div></div>
          <div class="stat"><div class="stat-v">${pct}<small>%</small></div><div class="stat-l">ความคืบหน้า</div><div class="progress" style="margin-top:8px"><i style="--w:${pct}%"></i></div></div>
          <div class="stat"><div class="stat-v">${fmtNum(p.items_total)}<small>ชิ้น</small></div><div class="stat-l">สิ่งของในรอบนี้</div><div class="stat-s">รวมทุกจุด</div></div>
          <div class="stat"><div class="stat-v">${fmtNum(p.beneficiaries)}<small>คน</small></div><div class="stat-l">ผู้ได้รับความช่วยเหลือ</div><div class="stat-s">เป้าหมาย ${fmtNum(p.beneficiaries_planned)} คน</div></div>
        </div>

        <div class="detail-grid" style="padding-bottom:0">
          <div class="detail-main">
            ${p.description ? `<div class="card card-pad"><h3 class="card-title">${icon('heart')} รายละเอียดโครงการ</h3><p class="prose">${esc(p.description)}</p></div>` : ''}
            <div class="card card-pad"><h3 class="card-title">${icon('map')} จุดช่วยเหลือในรอบนี้</h3><div class="mini-map" id="projMap" style="height:300px"></div></div>
          </div>
          <aside class="detail-aside">
            <div class="card card-pad">
              <ul class="kv">
                <li><span class="k">ชื่อโครงการ</span><span class="v">${esc(p.name)}</span></li>
                <li><span class="k">รอบการช่วยเหลือ</span><span class="v">รอบที่ ${esc(p.round_no)}</span></li>
                <li><span class="k">วันที่</span><span class="v">${fmtDateRange(p.start_date || p.first_date, p.end_date || p.last_date)}</span></li>
                <li><span class="k">พื้นที่</span><span class="v">${esc(p.provinces || '-')}</span></li>
                <li><span class="k">สถานะ</span><span class="v">${statusChip(p.status, true)}</span></li>
                ${p.supporters ? `<li><span class="k">ผู้ร่วมสนับสนุน</span><span class="v">${esc(p.supporters)}</span></li>` : ''}
              </ul>
            </div>
            ${supportCard(p.status === 'delivered' ? 'ร่วมสนับสนุนรอบถัดไป' : `ร่วมสนับสนุนรอบที่ ${p.round_no}`)}
          </aside>
        </div>

        <section style="padding-top:28px">
          <div class="section-head"><h2 class="section-title">จุดส่งต่อความช่วยเหลือ (${p.locations.length})</h2></div>
          ${p.locations.length ? `<div class="grid-cards">${p.locations.map(locCard).join('')}</div>` : emptyState('ยังไม่มีจุดช่วยเหลือ', 'ทีมงานกำลังกำหนดพื้นที่สำหรับรอบนี้', 'pin')}
        </section>

        ${p.photos.length ? `<section style="padding-top:32px">
          <div class="section-head"><h2 class="section-title">ภาพจากรอบนี้</h2><a class="link-more" href="#/gallery?project_id=${p.id}">ดูทั้งหมด ${icon('arrow')}</a></div>
          <div class="photo-grid wide">${p.photos.slice(0, 8).map((ph, i) => `
            <button type="button" class="photo-tile" data-ph="${i}">${img(ph.thumb_path, ph.caption)}<span class="tag">${STAGES[ph.stage]}</span>
            <span class="cap"><b>#${esc(ph.location_code)} ${esc(ph.location_name)}</b><span>${fmtDate(ph.taken_date)}</span></span></button>`).join('')}</div>
        </section>` : ''}
      </div>`;
    view.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => Lightbox.open(p.photos, Number(b.dataset.ph)));
    view.querySelector('.js-share').addEventListener('click', () => ShareCard.open(ShareCard.fromProject(p)));
    const mm = makeMap(document.getElementById('projMap'), { scrollWheelZoom: false, dragging: !window.matchMedia('(pointer: coarse)').matches, tap: false });
    onCleanup(() => mm.remove());
    const pts = [];
    p.locations.filter(l => l.lat != null).forEach(l => {
      pts.push([l.lat, l.lng]);
      L.marker([l.lat, l.lng], { icon: pinIcon(l.status), title: `#${l.code} ${l.name}` }).on('click', () => { location.hash = `#/map?loc=${l.id}`; }).addTo(mm);
    });
    fitTo(mm, pts, 12);
  }

  // ─────────────── GALLERY ───────────────
  async function pageGallery(id, params) {
    const opts = await get('/api/filters');
    if (id !== renderId) return;
    const f = {
      category: params.get('category') || '', province_id: params.get('province_id') || '', district_id: params.get('district_id') || '', project_id: params.get('project_id') || '',
      date_from: params.get('date_from') || '', date_to: params.get('date_to') || '', stage: params.get('stage') || '',
    };
    let photos = [], total = 0, loading = false;
    const PAGE = 24;

    view.innerHTML = `
      <section class="page-head"><div class="container">
        <span class="eyebrow">Photo Gallery</span>
        <h1>ภาพการช่วยเหลือ</h1>
        <p>ภาพถ่ายจริงจากทุกขั้นตอน ตั้งแต่การรวบรวมสิ่งของจนถึงการส่งมอบถึงมือผู้ประสบภัย</p>
      </div></section>
      <div class="filter-bar"><div class="container">
        <div class="filter-toggle">
          <span class="filter-count" id="gCount">กำลังโหลด…</span>
          <button type="button" class="btn btn-outline btn-sm" id="fToggle" aria-expanded="false">${icon('filter')} ตัวกรอง <span id="fN"></span></button>
        </div>
        <div class="filter-panel" id="fPanel" hidden>
          <div class="filter-grid">
            <div><span class="field-label">จังหวัด</span><div id="gProv"></div></div>
            <div><span class="field-label">พื้นที่ (อำเภอ)</span><div id="gDist"></div></div>
            <div><span class="field-label">ประเภทโครงการ</span><div id="gCat"></div></div>
            <div><span class="field-label">รอบการช่วยเหลือ</span><div id="gProj"></div></div>
            <div class="full"><span class="field-label">วันที่</span><div class="date-pair">
              <input type="date" class="input" id="gFrom" aria-label="ตั้งแต่วันที่" value="${esc(f.date_from)}">
              <input type="date" class="input" id="gTo" aria-label="ถึงวันที่" value="${esc(f.date_to)}"></div></div>
            <div class="full" style="display:flex;justify-content:flex-end"><button type="button" class="btn btn-outline btn-sm" id="gClear">ล้างตัวกรอง</button></div>
          </div>
        </div>
        <div class="chips-row" id="gStages" style="margin-top:10px"></div>
      </div></div>
      <div class="container" style="padding-top:16px;padding-bottom:48px">
        <div class="photo-grid wide" id="gGrid"></div>
        <div class="load-more"><button type="button" class="btn btn-outline" id="gMore" hidden>โหลดภาพเพิ่มเติม</button></div>
      </div>`;

    const districtsFor = () => opts.districts.filter(d => !f.province_id || String(d.province_id) === f.province_id).map(d => ({ value: d.id, label: d.name }));
    const ssProv = new SearchSelect(document.getElementById('gProv'), {
      allLabel: 'ทุกจังหวัด', value: f.province_id, searchPlaceholder: 'ค้นหาจังหวัด...', options: opts.provinces.map(p => ({ value: p.id, label: p.name })),
      onChange: v => { f.province_id = v; f.district_id = ''; ssDist.setOptions(districtsFor(), false); reload(); },
    });
    const ssDist = new SearchSelect(document.getElementById('gDist'), {
      allLabel: 'ทุกพื้นที่', value: f.district_id, searchPlaceholder: 'ค้นหาอำเภอ...', options: districtsFor(),
      onChange: v => { f.district_id = v; reload(); },
    });
    const ssProj = new SearchSelect(document.getElementById('gProj'), {
      allLabel: 'ทุกรอบการช่วยเหลือ', value: f.project_id, searchPlaceholder: 'ค้นหารอบ...', options: opts.projects.map(p => ({ value: p.id, label: `รอบที่ ${p.round_no} · ${p.name}` })),
      onChange: v => { f.project_id = v; reload(); },
    });
    const ssCat = new SearchSelect(document.getElementById('gCat'), {
      allLabel: 'ทุกประเภท', value: f.category, options: (opts.categories || Object.keys(CATEGORIES)).map(k => ({ value: k, label: `${category(k).icon} ${category(k).label}` })),
      onChange: v => { f.category = v; reload(); },
    });
    onCleanup(() => { ssProv.destroy(); ssDist.destroy(); ssProj.destroy(); ssCat.destroy(); });

    const panel = document.getElementById('fPanel');
    document.getElementById('fToggle').onclick = e => { panel.hidden = !panel.hidden; e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden)); };
    document.getElementById('gFrom').onchange = e => { f.date_from = e.target.value; reload(); };
    document.getElementById('gTo').onchange = e => { f.date_to = e.target.value; reload(); };
    document.getElementById('gClear').onclick = () => {
      Object.keys(f).forEach(k => f[k] = '');
      ssProv.setValue(''); ssDist.setOptions(districtsFor(), false); ssProj.setValue(''); ssCat.setValue('');
      document.getElementById('gFrom').value = ''; document.getElementById('gTo').value = '';
      reload();
    };
    const stagesEl = document.getElementById('gStages');
    const renderStages = () => {
      stagesEl.innerHTML = [['', 'ทุกขั้นตอน'], ...Object.entries(STAGES)].map(([k, t]) => `<button type="button" class="fchip${f.stage === k ? ' on' : ''}" data-stage="${k}">${t}</button>`).join('');
    };
    stagesEl.addEventListener('click', e => { const b = e.target.closest('[data-stage]'); if (!b) return; f.stage = b.dataset.stage; renderStages(); reload(); });
    renderStages();

    const grid = document.getElementById('gGrid');
    grid.addEventListener('click', e => { const t = e.target.closest('[data-ph]'); if (t) Lightbox.open(photos, Number(t.dataset.ph)); });
    const more = document.getElementById('gMore');
    more.onclick = () => load(false);

    function qs(extra) {
      const q = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
      Object.entries(extra || {}).forEach(([k, v]) => q.set(k, v));
      return q.toString();
    }
    function reload() {
      const s = qs();
      history.replaceState(null, '', s ? `#/gallery?${s}` : '#/gallery');
      const n = ['category', 'province_id', 'district_id', 'project_id', 'date_from', 'date_to'].filter(k => f[k]).length;
      document.getElementById('fN').textContent = n ? `(${n})` : '';
      load(true);
    }
    async function load(reset) {
      if (loading) return;
      loading = true; more.disabled = true;
      if (reset) { photos = []; grid.innerHTML = Array.from({ length: 8 }, () => '<div class="photo-tile skeleton"></div>').join(''); }
      try {
        const r = await api(`/api/photos?${qs({ limit: PAGE, offset: photos.length })}`);
        if (id !== renderId) return;
        total = r.total;
        const start = photos.length;
        photos = photos.concat(r.photos);
        const html = r.photos.map((p, i) => `
          <button type="button" class="photo-tile" data-ph="${start + i}">
            ${img(p.thumb_path, p.caption || STAGES[p.stage])}<span class="tag">${STAGES[p.stage]}</span>
            <span class="cap"><b>${esc(p.caption || `#${p.location_code} ${p.location_name}`)}</b><span>${fmtDate(p.taken_date)} · ${esc(areaText(p))}</span></span>
          </button>`).join('');
        if (reset) grid.innerHTML = html; else grid.insertAdjacentHTML('beforeend', html);
        if (!photos.length) grid.innerHTML = `<div style="grid-column:1/-1">${emptyState('ไม่พบภาพตามตัวกรอง', 'ลองเปลี่ยนจังหวัด พื้นที่ รอบ หรือช่วงวันที่')}</div>`;
        document.getElementById('gCount').innerHTML = `พบ <b>${fmtNum(total)}</b> ภาพ`;
        more.hidden = photos.length >= total;
      } catch (e) { RH.toast('โหลดภาพไม่สำเร็จ', 'error'); }
      finally { loading = false; more.disabled = false; }
    }
    reload();
  }

  // ─────────────── IMPACT ───────────────
  async function pageImpact(id) {
    const d = await get('/api/impact');
    if (id !== renderId) return;
    const s = d.stats;
    const st = s.status;
    const pct = k => st.total ? (st[k] / st.total * 100) : 0;
    const maxProv = Math.max(1, ...d.byProvince.map(p => p.beneficiaries));
    const maxItem = Math.max(1, ...d.byItem.map(i => i.pieces ?? i.quantity));
    const updated = s.updated_at ? fmtDate(s.updated_at.slice(0, 10)) : null;

    view.innerHTML = `
      <section class="page-head" style="padding-bottom:90px"><div class="container">
        <span class="eyebrow">Our Impact</span>
        <h1>การช่วยเหลือของเรา</h1>
        <p>ตัวเลขทั้งหมดคำนวณจากข้อมูลการส่งมอบจริงที่ทีมรัตนไพบูลย์บันทึกไว้ และอัปเดตทันทีเมื่อมีการส่งมอบใหม่</p>
        ${updated ? `<p class="updated">อัปเดตล่าสุด ${updated}</p>` : ''}
      </div></section>
      <div class="container stats-float" style="margin-top:-64px">${statGrid(s)}</div>

      <div class="container" style="padding-top:24px;padding-bottom:48px;display:flex;flex-direction:column;gap:18px">
        <div class="card card-pad">
          <h3 class="card-title">${icon('truck')} ความคืบหน้าของโครงการ</h3>
          <p style="color:var(--muted);font-size:14px;margin:-6px 0 12px">สถานะของจุดช่วยเหลือทั้งหมด ${fmtNum(st.total)} จุด</p>
          <div class="seg" role="img" aria-label="ส่งมอบแล้ว ${st.delivered} กำลังนำส่ง ${st.in_transit} กำลังเตรียม ${st.preparing}">
            ${['delivered', 'in_transit', 'preparing'].map(k => st[k] ? `<i class="s-${k}" style="--w:${pct(k)}%"></i>` : '').join('')}
          </div>
          <div class="seg-legend">
            <div><b>${st.delivered}</b><i style="background:var(--navy)"></i>ส่งมอบแล้ว</div>
            <div><b>${st.in_transit}</b><i style="background:var(--gold)"></i>กำลังนำส่ง</div>
            <div><b>${st.preparing}</b><i style="background:#C5CCE3"></i>กำลังเตรียม</div>
          </div>
        </div>

        ${(d.byCategory || []).length > 1 ? `<div class="card card-pad">
          <h3 class="card-title">${icon('folder')} การช่วยเหลือตามประเภทโครงการ</h3>
          <div class="cat-grid">${d.byCategory.map(c => `
            <a class="cat-tile" href="#/projects?category=${esc(c.category)}">
              <span class="cat-ic">${category(c.category).icon}</span>
              <span class="cat-name">${esc(category(c.category).label)}</span>
              <b>${fmtNum(c.beneficiaries)} <small>คน</small></b>
              <span class="cat-sub">${fmtNum(c.projects)} โครงการ · ส่งมอบ ${fmtNum(c.delivered)} จุด</span>
            </a>`).join('')}</div>
        </div>` : ''}

        <div class="two-col">
          <div class="card card-pad">
            <h3 class="card-title">${icon('pin')} ผู้ได้รับความช่วยเหลือตามจังหวัด</h3>
            ${d.byProvince.length ? `<ul class="bars">${d.byProvince.map(p => `
              <li class="bar-row"><div class="top"><span>${esc(p.province)} <small>· ${p.locations} จุด</small></span><b>${fmtNum(p.beneficiaries)} คน</b></div>
              <div class="bar"><i style="--w:${p.beneficiaries / maxProv * 100}%"></i></div></li>`).join('')}</ul>` : emptyState('ยังไม่มีการส่งมอบ', 'ข้อมูลจะแสดงเมื่อมีการส่งมอบ', 'pin')}
          </div>
          <div class="card card-pad">
            <h3 class="card-title">${icon('box')} สิ่งของที่ส่งต่อแล้ว</h3>
            ${d.byItem.length ? `<ul class="bars">${d.byItem.map(i => `
              <li class="bar-row"><div class="top"><span>${esc(i.name)}</span><b>${qtyText(i.quantity, i.unit, i.name)}</b></div>
              <div class="bar gold"><i style="--w:${(i.pieces ?? i.quantity) / maxItem * 100}%"></i></div></li>`).join('')}</ul>` : emptyState('ยังไม่มีการส่งมอบ', 'ข้อมูลจะแสดงเมื่อมีการส่งมอบ', 'box')}
          </div>
        </div>

        <div class="two-col">
          <div class="card card-pad">
            <h3 class="card-title">${icon('folder')} รอบการช่วยเหลือ</h3>
            <ul class="round-list">${d.projects.map(p => `
              <li><a href="#/projects/${p.id}">
                <span class="rn"><span><small>รอบที่</small>${esc(p.round_no)}</span></span>
                <span><span class="nm">${esc(p.name)}</span><br><span class="sb">${p.delivered_count}/${p.location_count} จุด · ${fmtNum(p.beneficiaries)} คน · ${fmtDateRange(p.first_date || p.start_date, p.last_date || p.end_date)}</span></span>
                ${statusChip(p.status)}
              </a></li>`).join('') || '<li>' + emptyState('ยังไม่มีโครงการ', '', 'folder') + '</li>'}</ul>
          </div>
          <div class="card card-pad">
            <h3 class="card-title">${icon('calendar')} อัปเดตล่าสุด</h3>
            <ul class="loc-list">${d.recent.map(l => `
              <li><a class="loc-row" href="#/locations/${l.id}">
                <span class="th">${img(l.cover_thumb, '')}</span>
                <span class="tx"><span class="nm">#${esc(l.code)} · ${esc(l.name)}</span><span class="ar">${esc(areaText(l))}</span>
                <span class="ft">${statusChip(l.status)}<span>${fmtDate(l.delivery_date)}</span></span></span></a></li>`).join('')}</ul>
          </div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px">
          <a class="btn btn-navy" href="#/map">${icon('map')} ดูแผนที่การช่วยเหลือ</a>
          <a class="btn btn-outline" href="#/gallery">${icon('image')} ดูภาพการช่วยเหลือ</a>
        </div>
      </div>`;
    countUp(view);
  }

  // ─────────────── router ───────────────
  // ─────────────── DONATIONS ───────────────
  // Approved (slip-checked) donations only, names partly hidden, no phone numbers or slips.
  // Shown at once from the newest copy this browser has (last live answer, else data/donations.json baked by
  // the deploy workflow), then replaced by the live list from Apps Script (≤ 30 s behind the sheet).
  // While the page is open it refreshes every 30 s, and again whenever the tab comes back into view.
  const DON_KEY = 'rh_don_v1';
  const donStore = {
    get: () => { try { const c = JSON.parse(localStorage.getItem(DON_KEY) || 'null'); return c && Date.now() - c.t < 86400_000 ? c : null; } catch { return null; } },
    set: d => { try { localStorage.setItem(DON_KEY, JSON.stringify({ t: Date.now(), d })); } catch { /* storage blocked */ } },
  };
  const donKey = x => { if (!x) return ''; const { updated_at, ...rest } = x; return JSON.stringify(rest); };
  const hhmm = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`; };

  async function pageDonate(id) {
    const liveOn = window.RH.backend === 'apps-script';
    const live = () => (liveOn ? api('/api/donations').catch(() => null) : Promise.resolve(null));
    const liveNow = live();
    let d = null, at = 0;
    const cached = donStore.get();
    if (cached) { d = cached.d; at = cached.t; }
    else {
      try { d = await fetch('data/donations.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)); } catch { /* not built yet */ }
      if (!d) { d = await liveNow; if (d) { at = Date.now(); donStore.set(d); } }
    }
    if (id !== renderId) return;
    document.title = 'ผู้ร่วมบริจาค · RATTANA HELP';
    let shown = donKey(d), liveAt = at;
    const note = msg => { const el = view.querySelector('.don-note'); if (el) el.textContent = msg; };
    const stamp = () => note(liveAt ? `อัปเดตล่าสุด ${hhmm(liveAt)} น. · รายการที่ทีมงานอนุมัติแล้วจะขึ้นภายในประมาณ 1 นาที` : 'กำลังโหลดข้อมูลล่าสุด…');
    const update = x => {
      if (id !== renderId) return;
      if (!x) { if (!liveAt) note('ยังเชื่อมต่อข้อมูลล่าสุดไม่ได้ — จะลองใหม่อัตโนมัติ'); return; }
      liveAt = Date.now(); donStore.set(x);
      const key = donKey(x);
      if (key !== shown) { shown = key; drawDonations(x); enhance(view); }
      stamp();
    };
    drawDonations(d);
    if (!liveOn) { note('อัปเดตอัตโนมัติ'); return; } // Node server: the list above is already live
    stamp();
    liveNow.then(update);
    {
      const refresh = () => { if (!document.hidden) live().then(update); };
      const timer = setInterval(refresh, 30_000);
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('focus', refresh);
      onCleanup(() => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); });
    }
  }

  // Messages of support ("กำลังใจ") float as liquid-glass bubbles over the page header. The layer ignores the
  // pointer and sits only on the header (which has no buttons), so it never covers anything people tap.
  function bubbles(msgs) {
    if (!msgs.length) return '';
    const slots = Math.min(msgs.length, 4);
    return `<div class="don-bubbles" aria-hidden="true">${Array.from({ length: slots }, (_, i) => `
      <div class="don-bubble b${i}" data-i="${i}"><span class="q">“</span><span class="t">${esc(msgs[i].msg)}</span><span class="by">${icon('heart')}${esc(msgs[i].name)}</span></div>`).join('')}</div>`;
  }
  function startBubbles(msgs) {
    const els = view.querySelectorAll('.don-bubble');
    if (!els.length || msgs.length <= els.length) return;
    let next = els.length;
    els.forEach(el => el.addEventListener('animationiteration', () => {
      const m = msgs[next++ % msgs.length];
      el.querySelector('.t').textContent = m.msg;
      el.querySelector('.by').lastChild.textContent = m.name;
    }));
  }

  function drawDonations(d) {
    const list = (d && d.donations) || [], pending = (d && d.pending) || { count: 0 };
    const msgs = list.filter(x => x.msg).map(x => ({ msg: x.msg, name: x.name }));
    const itemText = items => items.map(i => `${esc(i.name)} ${fmtNum(i.qty)} ${esc(unitName(i.unit))}`).join(' · ');
    const totalPieces = d ? d.items.reduce((s, i) => s + pieces(i.qty, i.unit, i.name), 0) : 0;
    const stat = (ic, v, unit, label) => `<div class="stat"><div class="stat-ic">${icon(ic)}</div><div class="stat-v"><span data-count="${Number(v) || 0}">0</span><small>${unit}</small></div><div class="stat-l">${label}</div></div>`;
    view.innerHTML = `
      <section class="page-head${msgs.length ? ' has-bubbles' : ''}"><div class="container">
        <span class="eyebrow">Donations</span>
        <h1>ผู้ร่วมบริจาค</h1>
        <p>ขอบคุณทุกน้ำใจที่ร่วมส่งต่อความช่วยเหลือ — แสดงเฉพาะรายการที่ตรวจสอบสลิปแล้ว และแสดงชื่อเพียงบางส่วนเพื่อความเป็นส่วนตัว</p>
      </div>${bubbles(msgs)}</section>
      <div class="container" style="padding:20px 16px 48px">
        <div class="stat-grid">
          ${stat('heart', d ? d.total_amount : 0, 'บาท', 'ยอดบริจาครวม')}
          ${stat('users', d ? d.donor_count : 0, 'ราย', 'ผู้ร่วมบริจาค')}
          ${stat('gift', d ? d.order_count : 0, 'ครั้ง', 'รายการบริจาค')}
          ${stat('box', totalPieces, 'ชิ้น', 'สิ่งของที่ร่วมบริจาค')}
        </div>
        ${pending.count ? `<p class="don-pending">${icon('calendar')}<span>รอตรวจสอบสลิปอีก <b>${fmtNum(pending.count)}</b> รายการ — จะแสดงในรายชื่อเมื่อทีมงานตรวจสอบแล้ว</span></p>` : ''}
        <div class="don-grid">
          <section class="card card-pad">
            <h3 class="card-title">${icon('heart')} รายชื่อผู้ร่วมบริจาค</h3>
            ${list.length ? `<ul class="don-list">${list.map(x => `
              <li>
                <span class="don-av">${esc(Array.from(x.name)[0] || '♥')}</span>
                <div class="don-tx"><b>${esc(x.name)}</b><small>${itemText(x.items)}</small>${x.msg ? `<span class="don-msg">“${esc(x.msg)}”</span>` : ''}<small class="don-date">${fmtDate(x.date)}${x.time ? ` · ${esc(x.time)} น.` : ''}</small></div>
                <span class="don-amt">${fmtNum(x.amount)}<small>บาท</small></span>
              </li>`).join('')}</ul>`
              : emptyState('ยังไม่มีรายการที่ตรวจสอบแล้ว', pending.count ? 'รายการบริจาคจะแสดงที่นี่เมื่อทีมงานตรวจสอบสลิปเรียบร้อย' : 'ร่วมเป็นคนแรกที่ส่งต่อความช่วยเหลือ', 'heart')}
          </section>
          <aside style="display:flex;flex-direction:column;gap:16px">
            ${d && d.items.length ? `<section class="card card-pad"><h3 class="card-title">${icon('box')} สิ่งของที่ร่วมบริจาค</h3>
              <table class="items-table"><tbody>${d.items.map(i => `<tr><td><span class="dot"></span>${esc(i.name)}</td><td class="q">${qtyText(i.qty, i.unit, i.name)}</td></tr>`).join('')}</tbody></table></section>` : ''}
            ${supportCard('ร่วมบริจาคสิ่งของ')}
          </aside>
        </div>
        <p class="don-note"></p>
      </div>`;
    countUp(view);
    startBubbles(msgs);
  }

  const ROUTES = [
    [/^\/?$/, pageHome, 'home'],
    [/^\/donate$/, pageDonate, 'donate'],
    [/^\/map$/, pageMap, 'map'],
    [/^\/impact$/, pageImpact, 'impact'],
    [/^\/gallery$/, pageGallery, 'gallery'],
    [/^\/projects$/, pageProjects, 'projects'],
    [/^\/projects\/(\d+)$/, pageProject, 'projects'],
    [/^\/locations\/(\d+)$/, pageLocation, 'map'],
  ];
  const DEFAULT_TITLE = document.title;

  let renderedAt = 0;
  async function router(soft = false) {
    if (soft !== true) soft = false; // hashchange passes an Event
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const id = ++renderId;
    cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } });
    cleanups = [];
    Lightbox.close();
    document.title = DEFAULT_TITLE;
    const match = ROUTES.find(([re]) => re.test(path));
    const [re, fn, nav] = match || ROUTES[0];
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
    document.querySelectorAll('.topnav, .bottomnav').forEach(navIndicator);
    // Fresh view element so listeners from the previous page don't linger
    const fresh = view.cloneNode(false);
    view.replaceWith(fresh);
    view = fresh;
    const keepY = window.scrollY;
    if (!soft) { fresh.innerHTML = '<div class="loading"><div class="spinner"></div></div>'; window.scrollTo(0, 0); }
    try {
      await fn(id, params, ...(re.exec(path) || []).slice(1).map(Number));
      if (id !== renderId) return;
      renderedAt = Date.now();
      if (soft) window.scrollTo(0, keepY);
      else { fresh.classList.remove('view-enter'); void fresh.offsetWidth; fresh.classList.add('view-enter'); }
      enhance(fresh);
    } catch (e) {
      if (id !== renderId) return;
      console.error(e);
      fresh.innerHTML = `<div class="container">${emptyState(e.status === 404 ? 'ไม่พบข้อมูล' : 'โหลดข้อมูลไม่สำเร็จ', e.status === 404 ? 'ข้อมูลนี้อาจถูกลบหรือยังไม่เผยแพร่' : 'กรุณาลองใหม่อีกครั้ง', 'pin')}<p style="text-align:center"><a class="btn btn-navy" href="#/">กลับหน้าหลัก</a></p></div>`;
    }
  }
  if (lineUrl()) {
    document.body.insertAdjacentHTML('beforeend', `<a class="line-fab" href="${esc(lineUrl())}" target="_blank" rel="noopener" aria-label="ร่วมสนับสนุนผ่าน LINE">${LINE_ICON}<span>ร่วมสนับสนุน</span></a>`);
    document.querySelector('.site-footer .row')?.insertAdjacentHTML('beforeend', lineBtn({ label: 'LINE ร่วมสนับสนุน', cls: 'btn-sm', showId: true }));
  }
  window.addEventListener('hashchange', router);
  // Fresher live data arrived (Apps Script) right after this page was drawn from cache/snapshot → redraw quietly.
  // Later updates wait for the next navigation, so nobody's reading or map selection gets yanked away.
  window.addEventListener('rh:data-updated', () => {
    const lb = document.querySelector('.lb');
    const busy = (lb && !lb.hidden) || document.querySelector('.ss-panel:not([hidden])') || document.querySelector('.sheet.is-detail');
    if (!busy && Date.now() - renderedAt < 15_000 && window.scrollY < 300) router(true);
  });
  window.addEventListener('resize', () => document.querySelectorAll('.topnav, .bottomnav').forEach(navIndicator));
  document.fonts?.ready.then(() => document.querySelectorAll('.topnav, .bottomnav').forEach(navIndicator));
  router();
})();
