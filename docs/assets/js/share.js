// RATTANA HELP — share cards: a liquid-glass image of one relief point / project, drawn on a canvas in
// Instagram & Facebook story / post sizes, then handed to the phone's share sheet (or saved as a file).
(function () {
  'use strict';
  const { esc, fmtNum, fmtDate, fmtDateRange, areaText, category, icon, toast, lineUrl, CFG } = window.RH;

  const FORMATS = [
    { key: 'igStory', label: 'IG Story', app: 'ig', w: 1080, h: 1920, kind: 'story' },
    { key: 'fbStory', label: 'Facebook Story', app: 'fb', w: 1080, h: 1920, kind: 'story' },
    { key: 'igPost', label: 'IG Post', app: 'ig', w: 1080, h: 1350, kind: 'post' },
    { key: 'fbPost', label: 'Facebook Post', app: 'fb', w: 1080, h: 1080, kind: 'square' },
  ];
  const APP_ICON = {
    ig: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r=".9" fill="currentColor" stroke="none"/></svg>',
    fb: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z"/></svg>',
  };

  const FONT = 'Inter, "Noto Sans Thai", system-ui, -apple-system, "Segoe UI", sans-serif';
  const font = (w, px) => `${w} ${Math.round(px)}px ${FONT}`;
  const GOLD = '#FFCF4D', GOLD_D = '#F5AE0A', INDIGO = '#132063';

  // Stroke icons on a 24-unit grid (same shapes as the site's inline SVG icons)
  const PATHS = {
    pin: 'M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z M14.5 10a2.5 2.5 0 1 0-5 0a2.5 2.5 0 1 0 5 0',
    calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M3 10h18 M8 3v4 M16 3v4',
    box: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  };
  const LINE_BUBBLE = 'M12 3C6.48 3 2 6.6 2 11.05c0 3.98 3.55 7.32 8.35 7.95.33.07.77.22.88.5.1.25.07.65.03.9l-.14.86c-.04.25-.2 1 .88.54 1.07-.45 5.8-3.42 7.92-5.85C21.38 14.33 22 12.76 22 11.05 22 6.6 17.52 3 12 3z';

  // ── canvas helpers ──
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function drawCover(ctx, img, x, y, w, h, fy = 0.5) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) * fy, sw, sh, x, y, w, h);
  }
  // Soft blur that works in every browser (canvas `filter` is missing on older Safari):
  // shrink step by step, then grow back step by step with smoothing on
  function blurred(img, w, h, factor) {
    let cw = w, ch = h, cur = mk(w, h);
    let c = cur.getContext('2d'); c.imageSmoothingQuality = 'high'; drawCover(c, img, 0, 0, w, h);
    const tw = Math.max(6, Math.round(w / factor)), th = Math.max(6, Math.round(h / factor));
    while (cw / 2 > tw) { cw = Math.round(cw / 2); ch = Math.round(ch / 2); const n = mk(cw, ch); const nc = n.getContext('2d'); nc.imageSmoothingQuality = 'high'; nc.drawImage(cur, 0, 0, cw, ch); cur = n; }
    const small = mk(tw, th); c = small.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, tw, th); cur = small; cw = tw; ch = th;
    while (cw * 2 < w) { cw *= 2; ch *= 2; const n = mk(cw, ch); const nc = n.getContext('2d'); nc.imageSmoothingQuality = 'high'; nc.drawImage(cur, 0, 0, cw, ch); cur = n; }
    const out = mk(w, h); c = out.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, w, h);
    return out;
  }
  function drawIcon(ctx, name, x, y, size, color, lw = 2) {
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D(PATHS[name])); ctx.restore();
  }
  // Thai has no spaces between words: break lines on word boundaries from Intl.Segmenter
  const wordSeg = window.Intl && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const charSeg = window.Intl && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
  const words = t => wordSeg ? Array.from(wordSeg.segment(t), s => s.segment) : Array.from(t);
  const chars = t => charSeg ? Array.from(charSeg.segment(t), s => s.segment) : Array.from(t);
  // Names that must never be split across lines
  const KEEP = ['รัตนไพบูลย์', 'RATTANA HELP'];
  function pieces(chunk) { // word pieces of a chunk too long for one line, protected names kept whole
    const out = []; let rest = chunk;
    while (rest) {
      let at = -1, hit = '';
      for (const k of KEEP) { const i = rest.indexOf(k); if (i >= 0 && (at < 0 || i < at)) { at = i; hit = k; } }
      if (at < 0) { out.push(...words(rest)); break; }
      if (at) out.push(...words(rest.slice(0, at)));
      out.push(hit); rest = rest.slice(at + hit.length);
    }
    return out;
  }
  // Inside a long phrase, prefer to break just before words that start a new part of a Thai name or place
  // ("ลานจอดรถ | บริษัทรัตนไพบูลย์ | ทางเข้าวัดไทร") rather than between any two dictionary words
  const STARTERS = ['บริษัท', 'ทาง', 'ตำบล', 'อำเภอ', 'จังหวัด', 'หมู่บ้าน', 'หมู่', 'บ้าน', 'วัด', 'โรงเรียน', 'ชุมชน', 'ศาลา', 'ศูนย์', 'สำหรับ', 'ลาน', 'ตลาด', 'โรงพยาบาล', 'มูลนิธิ', 'ร้าน'];
  function groups(chunk) {
    const out = [];
    for (const w of pieces(chunk)) {
      if (!out.length || STARTERS.some(st => w.startsWith(st))) out.push([w]);
      else out[out.length - 1].push(w);
    }
    return out;
  }
  // Break at spaces first (Thai writers put spaces between phrases); only a phrase longer than a whole line
  // is split — before a name/place word if possible, else between dictionary words, never inside a protected name
  function wrap(ctx, text, maxW, maxLines) {
    const lines = []; let cur = '';
    const fits = t => ctx.measureText(t).width <= maxW;
    const push = () => { if (cur.trim()) lines.push(cur.trim()); cur = ''; };
    const word = tk => {
      if (fits(cur + tk)) { cur += tk; return; }
      push();
      if (fits(tk)) { cur = tk; return; }
      for (const ch of chars(tk)) { if (!fits(cur + ch) && cur) push(); cur += ch; }
    };
    const piece = grp => {
      const t = grp.join('');
      if (fits(cur + t)) { cur += t; return; }
      if (fits(t)) { push(); cur = t; return; }
      grp.forEach(word);
    };
    for (const para of String(text || '').split('\n')) {
      for (const c of para.split(/(\s+)/)) {
        if (!c) continue;
        if (/^\s+$/.test(c)) { if (cur) cur += ' '; continue; }
        if (fits(cur + c)) { cur += c; continue; }
        if (fits(c)) { push(); cur = c; continue; }
        groups(c).forEach(piece);
      }
      push();
    }
    if (lines.length <= maxLines) return lines;
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && !fits(last + '…')) last = chars(last).slice(0, -1).join('');
    keep[maxLines - 1] = last + '…';
    return keep;
  }
  function spaced(ctx, text, x, y, spacing) { // letter-spaced Latin text (ctx.letterSpacing is not everywhere yet)
    for (const ch of text) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
    return x;
  }
  const spacedWidth = (ctx, text, spacing) => Array.from(text).reduce((s, ch) => s + ctx.measureText(ch).width + spacing, 0) - spacing;

  // Liquid glass panel: refracted (less blurred, slightly magnified) background inside, sheen, rim light and a soft shadow
  function glass(ctx, bgSharp, x, y, w, h, r, { shadow = true, tint = 0.10, lens = 0.85 } = {}) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (shadow) {
      ctx.save(); ctx.shadowColor = 'rgba(4, 10, 40, .5)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 34;
      rr(ctx, x, y, w, h, r); ctx.fillStyle = 'rgba(20, 30, 80, .35)'; ctx.fill(); ctx.restore();
    }
    ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
    if (bgSharp && lens) {
      const k = 1.06, cx = x + w / 2, cy = y + h / 2;
      ctx.globalAlpha = lens;
      ctx.drawImage(bgSharp, cx - (cx * k), cy - (cy * k), W * k, H * k);
      ctx.globalAlpha = 1;
    }
    let g = ctx.createLinearGradient(x, y, x + w * .6, y + h);
    g.addColorStop(0, `rgba(255,255,255,${tint + .16})`); g.addColorStop(.5, `rgba(255,255,255,${tint})`); g.addColorStop(1, `rgba(255,255,255,${tint + .04})`);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(14, 24, 80, .22)'; ctx.fillRect(x, y, w, h);
    g = ctx.createRadialGradient(x + w * .12, y, 0, x + w * .12, y, Math.max(w, h) * .75);
    g.addColorStop(0, 'rgba(255,255,255,.26)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.restore();
    // rim light
    ctx.save(); rr(ctx, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5);
    const rim = ctx.createLinearGradient(x, y, x + w, y + h);
    rim.addColorStop(0, 'rgba(255,255,255,.85)'); rim.addColorStop(.35, 'rgba(255,255,255,.18)'); rim.addColorStop(.7, 'rgba(255,255,255,.12)'); rim.addColorStop(1, 'rgba(255,255,255,.55)');
    ctx.strokeStyle = rim; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
  function pill(ctx, x, y, h, text, { bg = 'rgba(255,255,255,.16)', border = 'rgba(255,255,255,.45)', color = '#fff', size, weight = 600, padX } = {}) {
    size = size || h * .5; padX = padX ?? h * .45;
    ctx.font = font(weight, size);
    const w = ctx.measureText(text).width + padX * 2;
    rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, x + padX, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
    return w;
  }

  // ── images ──
  const imgCache = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise(res => {
      const im = new Image();
      if (!src.startsWith(location.origin) && /^https?:/.test(src)) im.crossOrigin = 'anonymous';
      const t = setTimeout(() => res(null), 15000);
      im.onload = () => { clearTimeout(t); res(im); };
      im.onerror = () => { clearTimeout(t); res(null); };
      im.decoding = 'async'; im.src = src;
    });
    imgCache.set(src, p);
    return p;
  }
  // Drive photos come from lh3.googleusercontent.com (CORS-enabled); ask for a size of our own so a cached
  // non-CORS copy of the same URL can never taint the canvas
  const shareSize = u => /googleusercontent\.com/.test(u) ? u.replace(/=w\d+(-h\d+)?$/, '') + '=w1080' : u;
  async function fontsReady() {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.all(['500', '600', '700', '800', '900'].flatMap(w => [document.fonts.load(`${w} 40px "Noto Sans Thai"`, 'กขค'), document.fonts.load(`${w} 40px Inter`, 'Aa1')])); } catch { /* fall back to system fonts */ }
  }

  // Photo slot: one photo, or a mix of 2–4 (the first picked is the big one)
  const MAX_PICK = 4;
  function collage(ctx, pics, x, y, w, h, s) {
    const n = Math.min(pics.length, MAX_PICK), gap = 8 * s, r = 18 * s;
    if (!n) return;
    if (n === 1) { drawCover(ctx, pics[0], x, y, w, h, .45); return; }
    let tiles;
    if (n === 2) { const h1 = (h - gap) / 2; tiles = [[x, y, w, h1], [x, y + h1 + gap, w, h1]]; }
    else if (n === 3) { const h1 = (h - gap) * .58, h2 = h - gap - h1, w2 = (w - gap) / 2; tiles = [[x, y, w, h1], [x, y + h1 + gap, w2, h2], [x + w2 + gap, y + h1 + gap, w2, h2]]; }
    else { const h1 = (h - gap) * .5, w2 = (w - gap) / 2; tiles = [[x, y, w2, h1], [x + w2 + gap, y, w2, h1], [x, y + h1 + gap, w2, h - gap - h1], [x + w2 + gap, y + h1 + gap, w2, h - gap - h1]]; }
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x, y, w, h); // shows in the gaps
    tiles.forEach(([tx, ty, tw, th], i) => {
      ctx.save(); rr(ctx, tx, ty, tw, th, r); ctx.clip();
      drawCover(ctx, pics[i], tx, ty, tw, th, .45);
      ctx.restore();
    });
  }

  // ── the card ──
  async function render(data, fmt) {
    const { w: W, h: H, kind } = fmt;
    const picked = (data.picked && data.picked.length ? data.picked : [data.photo]).filter(Boolean).slice(0, MAX_PICK);
    const [loaded, logo] = await Promise.all([
      Promise.all(picked.map(u => loadImg(shareSize(u)))),
      loadImg(new URL('assets/img/logo.png', location.href).href),
      fontsReady(),
    ]);
    let pics = loaded.filter(Boolean);
    if (!pics.length) { const fb = await loadImg(new URL('assets/img/hero.jpg', location.href).href); pics = fb ? [fb] : []; }
    const photo = pics[0] || null;
    const cv = mk(W, H), ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    // Background: the photo, heavily blurred and tinted in the brand indigo, with soft sky + gold light
    const bg = photo ? blurred(photo, W, H, 26) : null;
    const lensBg = photo ? blurred(photo, W, H, 9) : null;
    if (bg) ctx.drawImage(bg, 0, 0); else { ctx.fillStyle = '#1C2E86'; ctx.fillRect(0, 0, W, H); }
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(13, 22, 75, .62)'); g.addColorStop(.45, 'rgba(19, 32, 99, .34)'); g.addColorStop(1, 'rgba(8, 14, 52, .82)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    g = ctx.createRadialGradient(W * .9, H * .1, 0, W * .9, H * .1, W * .8); g.addColorStop(0, 'rgba(255, 196, 60, .30)'); g.addColorStop(1, 'rgba(255, 196, 60, 0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W * .05, H * .78, 0, W * .05, H * .78, W * .9); g.addColorStop(0, 'rgba(70, 170, 255, .34)'); g.addColorStop(1, 'rgba(70, 170, 255, 0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // Layout per size (stories keep content out of the top/bottom bars Instagram & Facebook draw over)
    const L = {
      story: { headY: 200, logo: 92, headline: true, cardW: 960, cardY: 600, statY: 1370, statH: 150, footY: 1580 },
      post: { headY: 70, logo: 78, headline: false, cardW: 960, cardY: 196, statY: 952, statH: 138, footY: 1140 },
      square: { headY: 40, logo: 62, headline: false, cardW: 800, cardY: 130, statY: 758, statH: 108, footY: 890 },
    }[kind];
    const cardW = L.cardW, cardH = Math.round(cardW * 3 / 4), cardX = Math.round((W - cardW) / 2), s = cardW / 960;

    // Header: logo + wordmark
    {
      const lg = L.logo, x = cardX + 4, y = L.headY;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
      ctx.beginPath(); ctx.arc(x + lg / 2, y + lg / 2, lg / 2 + 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
      if (logo) { ctx.save(); ctx.beginPath(); ctx.arc(x + lg / 2, y + lg / 2, lg / 2, 0, Math.PI * 2); ctx.clip(); drawCover(ctx, logo, x, y, lg, lg); ctx.restore(); }
      ctx.beginPath(); ctx.arc(x + lg / 2, y + lg / 2, lg / 2 + 4, 0, Math.PI * 2); ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
      const tx = x + lg + 26;
      ctx.font = font(800, lg * .42); ctx.fillStyle = '#fff';
      const after = spaced(ctx, 'RATTANA', tx, y + lg * .5, lg * .07);
      ctx.fillStyle = GOLD; spaced(ctx, 'HELP', after + lg * .16, y + lg * .5, lg * .07);
      ctx.font = font(500, lg * .26); ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.fillText('ส่งต่อความช่วยเหลือ โดยรัตนไพบูลย์', tx, y + lg * .9);
    }

    // Story headline above the card
    if (L.headline) {
      const x = cardX + 4; let y = 420;
      g = ctx.createLinearGradient(x, 0, x + 48, 0); g.addColorStop(0, GOLD); g.addColorStop(1, GOLD_D);
      rr(ctx, x, y - 14, 48, 8, 4); ctx.fillStyle = g; ctx.fill();
      ctx.font = font(700, 34); ctx.fillStyle = GOLD; ctx.fillText(data.eyebrow, x + 64, y);
      y += 92;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 6;
      ctx.font = font(800, 84); ctx.fillStyle = '#fff';
      ctx.fillText(wrap(ctx, CFG.heroTitle || 'คนละไม้ คนละมือ', cardW, 1)[0], x - 2, y);
      ctx.restore();
    }

    // The 4:3 glass card
    glass(ctx, lensBg, cardX, L.cardY, cardW, cardH, 48 * s);
    const p = 30 * s, phW = Math.round(cardW * .45), phH = cardH - p * 2, phX = cardX + p, phY = L.cardY + p;
    ctx.save(); ctx.shadowColor = 'rgba(0, 8, 40, .45)'; ctx.shadowBlur = 30 * s; ctx.shadowOffsetY = 12 * s;
    rr(ctx, phX, phY, phW, phH, 32 * s); ctx.fillStyle = '#0d1640'; ctx.fill(); ctx.restore();
    ctx.save(); rr(ctx, phX, phY, phW, phH, 32 * s); ctx.clip();
    collage(ctx, pics, phX, phY, phW, phH, s);
    g = ctx.createLinearGradient(0, phY + phH * .6, 0, phY + phH); g.addColorStop(0, 'rgba(8,14,52,0)'); g.addColorStop(1, 'rgba(8,14,52,.55)');
    ctx.fillStyle = g; ctx.fillRect(phX, phY, phW, phH);
    ctx.restore();
    rr(ctx, phX + 1, phY + 1, phW - 2, phH - 2, 31 * s); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
    // status chip on the photo
    {
      const st = data.status, h = 58 * s, x = phX + 20 * s, y = phY + phH - h - 20 * s;
      if (st === 'delivered') {
        ctx.font = font(800, 25 * s);
        const label = 'ส่งมอบแล้ว', tw = ctx.measureText(label).width, w = tw + 92 * s;
        ctx.save(); ctx.shadowColor = 'rgba(245,174,10,.55)'; ctx.shadowBlur = 24 * s;
        g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, GOLD); g.addColorStop(1, GOLD_D);
        rr(ctx, x, y, w, h, h / 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(x + h / 2 + 2 * s, y + h / 2, h * .34, 0, Math.PI * 2); ctx.fillStyle = INDIGO; ctx.fill();
        drawIcon(ctx, 'check', x + h / 2 + 2 * s - h * .22, y + h / 2 - h * .22, h * .44, '#fff', 3.2);
        ctx.fillStyle = INDIGO; ctx.textBaseline = 'middle'; ctx.fillText(label, x + h + 10 * s, y + h / 2 + 1); ctx.textBaseline = 'alphabetic';
      } else {
        pill(ctx, x, y, h, st === 'in_transit' ? 'กำลังนำส่ง' : 'กำลังเตรียม', { bg: st === 'in_transit' ? 'rgba(44,150,238,.92)' : 'rgba(255,255,255,.92)', color: st === 'in_transit' ? '#fff' : INDIGO, border: null, weight: 800, size: 25 * s });
      }
    }

    // Info column
    {
      const x = phX + phW + 34 * s, iw = cardX + cardW - p - 6 * s - x, bottom = L.cardY + cardH - p;
      let y = L.cardY + p + 6 * s;
      let px = x;
      if (data.round) { ctx.font = font(800, 26 * s); ctx.fillStyle = GOLD; ctx.textBaseline = 'middle'; ctx.fillText(data.round, x, y + 22 * s); ctx.textBaseline = 'alphabetic'; px += ctx.measureText(data.round).width + 16 * s; }
      const cat = category(data.category);
      if (px + 150 * s > x + iw) { px = x; y += 56 * s; }
      pill(ctx, px, y, 44 * s, `${cat.icon} ${cat.label}`, { size: 22 * s, weight: 600 });
      y += 44 * s + 26 * s;

      // Title: largest size that fits in three lines
      let size = 46 * s, lines;
      for (; size >= 32 * s; size -= 2 * s) { ctx.font = font(800, size); lines = wrap(ctx, data.title, iw, 3); if (lines.length <= 3 && !lines[lines.length - 1].endsWith('…')) break; }
      ctx.font = font(800, size); lines = wrap(ctx, data.title, iw, 3);
      ctx.fillStyle = '#fff';
      lines.forEach(l => { y += size * 1.22; ctx.fillText(l, x, y); });
      y += 26 * s;
      g = ctx.createLinearGradient(x, 0, x + iw, 0); g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, iw, 2);
      y += 22 * s;

      const row = (ic, text, maxLines) => {
        if (!text) return;
        ctx.font = font(500, 25 * s);
        const ls = wrap(ctx, text, iw - 44 * s, maxLines);
        if (y + ls.length * 36 * s > bottom) return;
        drawIcon(ctx, ic, x, y + 3 * s, 28 * s, GOLD, 2.2);
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ls.forEach((l, i) => ctx.fillText(l, x + 44 * s, y + 25 * s + i * 36 * s));
        y += ls.length * 36 * s + 16 * s;
      };
      row('pin', data.area, 2);
      row('calendar', data.date, 1);
      row('box', data.items, 2);
    }

    // Stats under the card
    {
      const stats = data.stats.filter(x => x && x.v != null).slice(0, 3);
      if (stats.length) {
        const gap = 20 * s, h = L.statH, w = (cardW - gap * (stats.length - 1)) / stats.length;
        stats.forEach((st, i) => {
          const x = cardX + i * (w + gap), y = L.statY;
          glass(ctx, lensBg, x, y, w, h, 34 * s, { shadow: true, tint: .08, lens: .7 });
          const num = fmtNum(st.v);
          ctx.font = font(800, h * .36); const nw = ctx.measureText(num).width;
          ctx.font = font(700, h * .18); const uw = ctx.measureText(st.unit).width;
          const sx = x + (w - nw - uw - 10 * s) / 2, by = y + h * .5;
          ctx.font = font(800, h * .36); ctx.fillStyle = '#fff'; ctx.fillText(num, sx, by);
          ctx.font = font(700, h * .18); ctx.fillStyle = GOLD; ctx.fillText(st.unit, sx + nw + 10 * s, by);
          ctx.font = font(500, h * .15); ctx.fillStyle = 'rgba(255,255,255,.82)';
          const lab = wrap(ctx, st.label, w - 28 * s, 1)[0];
          ctx.fillText(lab, x + (w - ctx.measureText(lab).width) / 2, y + h * .8);
        });
      }
    }

    // Footer: LINE OA call-to-action + site address
    {
      const y = L.footY, h = kind === 'square' ? 84 : 100;
      if (lineUrl()) {
        glass(ctx, null, cardX, y, cardW, h, h / 2, { shadow: false, tint: .12, lens: 0 });
        const ic = h * .62, ix = cardX + (h - ic) / 2 + 4, iy = y + (h - ic) / 2;
        rr(ctx, ix, iy, ic, ic, ic * .28); ctx.fillStyle = '#06C755'; ctx.fill();
        ctx.save(); ctx.translate(ix + ic * .1, iy + ic * .08); ctx.scale(ic * .8 / 24, ic * .8 / 24); ctx.fillStyle = '#fff'; ctx.fill(new Path2D(LINE_BUBBLE)); ctx.restore();
        ctx.font = font(900, ic * .2); ctx.fillStyle = '#06C755'; ctx.textAlign = 'center'; ctx.fillText('LINE', ix + ic / 2, iy + ic * .52); ctx.textAlign = 'left';
        const tx = ix + ic + 22;
        ctx.font = font(600, h * .25); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText('ร่วมส่งต่อความช่วยเหลือ', tx, y + h * .43);
        ctx.font = font(800, h * .3); ctx.fillStyle = '#fff'; ctx.fillText(`แอดไลน์ ${(CFG.lineOa && CFG.lineOa.id) || ''}`, tx, y + h * .78);
      }
      ctx.font = font(600, kind === 'square' ? 24 : 27); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'center';
      ctx.fillText(siteHost(), W / 2, y + h + (kind === 'square' ? 46 : 62));
      ctx.textAlign = 'left';
    }
    return cv;
  }

  const siteBase = () => location.href.split('#')[0].replace(/index\.html$/, '').replace(/\?.*$/, '');
  const siteHost = () => siteBase().replace(/^https?:\/\//, '').replace(/\/$/, '');

  // ── data from the public API objects ──
  // Photos for the picker: cover first, then delivery → after → transit → prepare → collect
  function photoList(list, coverUrl) {
    const rank = { deliver: 0, after: 1, transit: 2, prepare: 3, collect: 4 };
    const seen = new Set();
    return [...(list || [])]
      .sort((a, b) => ((b.file_path === coverUrl) - (a.file_path === coverUrl)) || ((rank[a.stage] ?? 9) - (rank[b.stage] ?? 9)))
      .filter(x => x.file_path && !seen.has(x.file_path) && seen.add(x.file_path))
      .map(x => ({ full: x.file_path, thumb: x.thumb_path || x.file_path }));
  }
  function fromLocation(d) {
    const items = (d.items || []).filter(i => i.name).map(i => `${i.name} ${fmtNum(i.quantity)}${i.unit ? ` ${window.RH.unitName(i.unit)}` : ''}`).join(' · ');
    const delivered = d.status === 'delivered';
    return {
      id: `loc-${d.id}`, eyebrow: delivered ? 'ส่งต่อความช่วยเหลือแล้ว' : 'กำลังส่งต่อความช่วยเหลือ',
      title: d.name, round: d.round_no ? `รอบที่ ${d.round_no}` : '', category: d.project_category, status: d.status,
      area: areaText(d, true), date: d.delivery_date ? `${delivered ? 'ส่งมอบ' : 'กำหนดส่งมอบ'} ${fmtDate(d.delivery_date)}` : '', items,
      photo: d.cover_url || (d.photos && d.photos[0] && d.photos[0].file_path),
      photos: photoList(d.photos, d.cover_url),
      stats: [
        d.beneficiaries ? { v: d.beneficiaries, unit: 'คน', label: delivered ? 'ได้รับความช่วยเหลือ' : 'ผู้รับ (เป้าหมาย)' } : null,
        d.households ? { v: d.households, unit: 'ครัวเรือน', label: 'ครัวเรือนที่ได้รับ' } : null,
        d.items_total ? { v: d.items_total, unit: 'ชิ้น', label: 'สิ่งของที่ส่งต่อ' } : null,
      ],
      link: `${siteBase()}#/locations/${d.id}`,
    };
  }
  function fromProject(p) {
    const rank = { deliver: 0, after: 1, transit: 2, prepare: 3, collect: 4 };
    const ph = [...(p.photos || [])].sort((a, b) => (rank[a.stage] ?? 9) - (rank[b.stage] ?? 9))[0];
    const delivered = p.status === 'delivered';
    return {
      id: `proj-${p.id}`, eyebrow: delivered ? 'ส่งต่อความช่วยเหลือแล้ว' : 'กำลังส่งต่อความช่วยเหลือ',
      title: p.name, round: p.round_no ? `รอบที่ ${p.round_no}` : '', category: p.category, status: p.status,
      area: p.provinces ? `จังหวัด${p.provinces}` : '', date: fmtDateRange(p.start_date || p.first_date, p.end_date || p.last_date).replace(/^-$/, ''),
      items: p.summary && p.summary !== p.name ? p.summary : '',
      photo: ph ? ph.file_path : null,
      photos: photoList(p.photos, ph && ph.file_path),
      stats: [
        p.location_count ? { v: p.delivered_count, unit: `/${fmtNum(p.location_count)} จุด`, label: 'ส่งมอบแล้ว' } : null,
        p.beneficiaries ? { v: p.beneficiaries, unit: 'คน', label: 'ได้รับความช่วยเหลือ' } : null,
        p.items_total ? { v: p.items_total, unit: 'ชิ้น', label: 'สิ่งของที่ส่งต่อ' } : null,
      ],
      link: `${siteBase()}#/projects/${p.id}`,
    };
  }
  function caption(d) {
    const st = d.stats.find(x => x && x.unit === 'คน');
    return [
      `${d.status === 'delivered' ? '✅' : '🤍'} ${d.title}`,
      [d.area && `📍 ${d.area}`, d.date && `📅 ${d.date}`].filter(Boolean).join('  '),
      st ? `👥 ${st.label} ${fmtNum(st.v)} คน` : '',
      '',
      lineUrl() ? `ร่วมส่งต่อความช่วยเหลือ แอดไลน์ ${(CFG.lineOa && CFG.lineOa.id) || ''} ${lineUrl()}` : '',
      `ดูรายละเอียด: ${d.link}`,
      '',
      `#RATTANAHELP #รัตนไพบูลย์ #ส่งต่อความช่วยเหลือ #${String(CFG.heroTitle || 'คนละไม้คนละมือ').replace(/\s+/g, '')}`,
    ].filter((l, i, a) => l || (a[i - 1] && i < a.length - 1)).join('\n');
  }

  // ── share sheet UI ──
  let el = null, cur = null;
  const canShareFiles = () => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'])], 'x.jpg', { type: 'image/jpeg' })] })); } catch { return false; } };
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { /* old browsers */ }
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* none */ } ta.remove(); return ok;
  }
  function build() {
    el = document.createElement('div');
    el.className = 'shr'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'แชร์การช่วยเหลือ');
    el.innerHTML = `
      <div class="shr-panel">
        <div class="shr-head"><div><b>แชร์การช่วยเหลือ</b><small>เลือกขนาดตามที่จะโพสต์</small></div>
          <button type="button" class="shr-x" aria-label="ปิด">${icon('close')}</button></div>
        <div class="shr-tabs" role="tablist">${FORMATS.map(f => `<button type="button" role="tab" data-f="${f.key}" class="app-${f.app}">${APP_ICON[f.app]}<span>${f.label}</span><small>${f.w}×${f.h}</small></button>`).join('')}</div>
        <div class="shr-pics" hidden><div class="shr-pics-head"><b>ภาพบนการ์ด</b><small>แตะเลือก 1 ภาพ หรือหลายภาพเพื่อมิกซ์ (สูงสุด ${MAX_PICK})</small></div><div class="shr-pics-row"></div></div>
        <div class="shr-stage"><div class="shr-frame"><img alt="ตัวอย่างการ์ดแชร์"><div class="shr-busy"><div class="spinner"></div><span>กำลังสร้างการ์ด…</span></div></div></div>
        <div class="shr-acts">
          <button type="button" class="btn btn-gold shr-go"></button>
          <button type="button" class="btn btn-outline shr-save">${icon('download')} บันทึกรูป</button>
          <button type="button" class="btn btn-outline shr-copy">${icon('copy')} คัดลอกข้อความ</button>
        </div>
        <p class="shr-hint"></p>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.shr-x').onclick = close;
    el.addEventListener('click', e => { if (e.target === el) close(); });
    document.addEventListener('keydown', e => { if (!el.hidden && e.key === 'Escape') close(); });
    el.querySelector('.shr-tabs').onclick = e => { const b = e.target.closest('[data-f]'); if (b) select(b.dataset.f); };
    el.querySelector('.shr-save').onclick = () => save();
    el.querySelector('.shr-copy').onclick = async () => toast(await copyText(caption(cur.data)) ? 'คัดลอกข้อความแล้ว — วางเป็นแคปชันได้เลย' : 'คัดลอกไม่สำเร็จ', 'success');
    el.querySelector('.shr-go').onclick = () => share();
    el.querySelector('.shr-pics-row').onclick = e => {
      const b = e.target.closest('[data-pic]'); if (!b) return;
      const u = cur.data.photos[+b.dataset.pic].full, at = cur.data.picked.indexOf(u);
      if (at >= 0) { if (cur.data.picked.length === 1) return; cur.data.picked.splice(at, 1); }
      else { if (cur.data.picked.length >= MAX_PICK) return toast(`เลือกได้สูงสุด ${MAX_PICK} ภาพ`, 'info'); cur.data.picked.push(u); }
      renderPics(); select(cur.fmt.key);
    };
  }
  function renderPics() {
    const list = cur.data.photos || [], box = el.querySelector('.shr-pics');
    box.hidden = list.length < 2;
    if (box.hidden) return;
    box.querySelector('.shr-pics-row').innerHTML = list.map((ph, i) => {
      const n = cur.data.picked.indexOf(ph.full) + 1;
      return `<button type="button" data-pic="${i}" class="${n ? 'on' : ''}" aria-pressed="${!!n}" aria-label="ภาพที่ ${i + 1}"><img src="${esc(ph.thumb)}" alt="" loading="lazy">${n ? `<span>${n}</span>` : ''}</button>`;
    }).join('');
  }
  const fmtOf = key => FORMATS.find(f => f.key === key);
  const sizeKey = f => `${f.w}x${f.h}`;
  function blobFor(f) {
    const k = `${sizeKey(f)}|${(cur.data.picked || []).join('|')}`;
    if (!cur.blobs[k]) cur.blobs[k] = render(cur.data, f).then(cv => new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', .92)));
    return cur.blobs[k];
  }
  async function select(key) {
    const f = fmtOf(key); cur.fmt = f;
    el.querySelectorAll('.shr-tabs [data-f]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.f === key)));
    const frame = el.querySelector('.shr-frame'), im = frame.querySelector('img');
    frame.style.aspectRatio = `${f.w} / ${f.h}`; frame.style.setProperty('--ar', String(f.w / f.h));
    frame.classList.add('is-busy');
    const files = canShareFiles();
    el.querySelector('.shr-go').innerHTML = files ? `${APP_ICON[f.app]} แชร์ไป ${f.label}` : `${icon('download')} บันทึกรูปสำหรับ ${f.label}`;
    el.querySelector('.shr-save').hidden = !files;
    el.querySelector('.shr-hint').textContent = files
      ? `กด “แชร์” แล้วเลือก ${f.app === 'ig' ? 'Instagram' : 'Facebook'}${f.kind === 'story' ? ' → Story' : ''} · ข้อความแคปชันจะถูกคัดลอกไว้ให้วางได้ทันที`
      : `บันทึกรูปแล้วอัปโหลดใน ${f.app === 'ig' ? 'Instagram' : 'Facebook'}${f.kind === 'story' ? ' Story' : ''} · ข้อความแคปชันจะถูกคัดลอกไว้ให้`;
    try {
      const b = await blobFor(f);
      if (cur.fmt !== f) return;
      if (im.src.startsWith('blob:')) URL.revokeObjectURL(im.src);
      im.src = URL.createObjectURL(b);
    } catch { toast('สร้างการ์ดไม่สำเร็จ ลองอีกครั้ง', 'error'); }
    finally { if (cur.fmt === f) frame.classList.remove('is-busy'); }
  }
  const fileName = f => `rattana-help-${cur.data.id}-${f.key}.jpg`;
  async function save() {
    const f = cur.fmt;
    const b = await blobFor(f);
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = fileName(f);
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    copyText(caption(cur.data));
    toast('บันทึกรูปแล้ว · คัดลอกข้อความแคปชันไว้ให้แล้ว', 'success');
  }
  async function share() {
    const f = cur.fmt;
    if (!canShareFiles()) return save();
    let b;
    try { b = await blobFor(f); } catch { return toast('สร้างการ์ดไม่สำเร็จ ลองอีกครั้ง', 'error'); }
    const file = new File([b], fileName(f), { type: 'image/jpeg' });
    copyText(caption(cur.data));
    try { await navigator.share({ files: [file] }); }
    catch (e) { if (e && e.name !== 'AbortError') save(); }
  }
  async function open(data, key) {
    if (!el) build();
    // several photos → start with a mix of up to 3 (cover first); tapping the thumbnails changes it
    data.photos = data.photos || [];
    data.picked = data.photos.length ? data.photos.slice(0, Math.min(3, data.photos.length)).map(x => x.full) : [];
    cur = { data, blobs: {}, fmt: null };
    renderPics();
    el.hidden = false; document.body.classList.add('no-scroll');
    requestAnimationFrame(() => el.classList.add('is-open'));
    el.querySelector('.shr-x').focus({ preventScroll: true });
    await select(key || (window.matchMedia('(max-width: 899px)').matches ? 'igStory' : 'fbPost'));
  }
  function close() {
    if (!el || el.hidden) return;
    el.classList.remove('is-open'); document.body.classList.remove('no-scroll');
    setTimeout(() => { el.hidden = true; }, 220);
  }

  const button = (cls = '') => `<button type="button" class="btn-share ${cls}">${icon('share')}<span>แชร์การ์ด</span></button>`;
  window.RH.ShareCard = { open, close, fromLocation, fromProject, render, button, FORMATS };
})();
