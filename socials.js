// GOUAL ART social links (Instagram, YouTube, TikTok), shared by the 3D site, the classic site
// and the formation page. Any element with class "socials" is filled with the three icons.
(() => {
  const LINKS = [
    ['Instagram', 'https://www.instagram.com/goual_art/', '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.2"/>'],
    ['YouTube', 'https://www.youtube.com/@goualart', '<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8A26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/>'],
    ['TikTok', 'https://www.tiktok.com/@goualart', '<path d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>'],
  ];
  const css = '.socials{display:inline-flex;align-items:center;gap:10px;vertical-align:middle}' +
    '.socials a{width:var(--soc,38px);height:var(--soc,38px);border-radius:50%;display:grid;place-items:center;color:inherit;border:1px solid currentColor;opacity:.85;text-decoration:none;transition:opacity .25s,transform .25s,background .25s,border-color .25s}' +
    '.socials a:hover,.socials a:focus-visible{opacity:1;transform:translateY(-2px);background:linear-gradient(135deg,#3d8bff,#ff2bd6 60%,#a24bff);border-color:transparent;color:#fff}' +
    '.socials svg{width:46%;height:46%;fill:currentColor}';
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  const fill = el => {
    if (el.dataset.filled) return; el.dataset.filled = '1';
    el.innerHTML = LINKS.map(([n, u, p]) => `<a href="${u}" target="_blank" rel="noopener" aria-label="GOUAL ART on ${n}" title="${n}"><svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg></a>`).join('');
  };
  const run = () => document.querySelectorAll('.socials').forEach(fill);
  run(); document.addEventListener('DOMContentLoaded', run);
  // Menus built later (the futuristic mobile menu) can call this again.
  window.goualSocials = run;
})();
