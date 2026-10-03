// RATTANA HELP — site settings (edit here, no rebuild needed)
window.RH_CONFIG = {
  version: '2.2',
  // Google Apps Script web app URL (…/exec) — the data backend when hosted on GitHub Pages.
  // See apps-script/SETUP.md. Leave empty only when running the Node server (npm start).
  apiUrl: '',
  // 'CE' = ค.ศ. (03/10/2026) · 'BE' = พ.ศ. (03/10/2569)
  dateEra: 'BE',
  // Link to Rattanaphaiboon's own ordering / support channel (LINE OA, website, etc.).
  // Leave empty to hide the button. This app never takes orders or payments itself.
  supportUrl: '',
  supportLabel: 'ช่องทางร่วมสนับสนุนของรัตนไพบูลย์',
  // LINE Official Account for supporters (ordering / sponsoring happens there, never in this app).
  // url: the "Add friend" link from LINE OA Manager, e.g. 'https://lin.ee/AbCdEfG' or 'https://line.me/R/ti/p/@yourid'
  // id:  the @ID shown under the button, e.g. '@rattanaphaiboon' (optional)
  // Leave url empty to hide every LINE button.
  lineOa: { url: 'https://lin.ee/XQHHq7M', id: '@RPBSALE' },
  // Default map view (Central Thailand)
  mapCenter: [14.1, 100.3],
  mapZoom: 8,
  // Map tiles. OpenStreetMap's free tiles suit low traffic; for heavy production traffic switch to a
  // keyed provider (e.g. MapTiler / Stadia) and add its domain to img-src in server.js PAGE_CSP.
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};
