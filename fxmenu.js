// Futuristic mobile menu: turns every <nav data-fxm> into a full-screen menu with
// digital rain behind it and labels that "decode" when it opens.
// The page itself opens and closes it by toggling the nav's `hidden` attribute.
(() => {
  const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789<>/{}=+*#';
  const COLS = ['#3d8bff', '#00d2ff', '#ff2bd6', '#a24bff', '#ff5ad9'];
  const STOPS = [[40, 120, 255], [0, 210, 255], [255, 43, 214], [138, 43, 255]];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  function setup(nav) {
    nav.classList.add('fxm');
    const items = [...nav.querySelectorAll(':scope > a, :scope > button')];
    items.forEach((el, k) => {
      const t = el.textContent.trim(), sub = el.dataset.sub || '';
      el.classList.add('fxm-item'); el.style.setProperty('--k', k); el.style.setProperty('--c', COLS[k % COLS.length]);
      el.setAttribute('aria-label', t);
      el.innerHTML = `<span class="fxm-n" aria-hidden="true">${String(k + 1).padStart(2, '0')}</span><span class="fxm-l" aria-hidden="true"></span><span class="fxm-s" aria-hidden="true"></span><span class="fxm-a" aria-hidden="true">→</span>`;
      el.querySelector('.fxm-l').textContent = t; el.querySelector('.fxm-s').textContent = sub; el._t = t;
    });
    const head = document.createElement('div'); head.className = 'fxm-head'; head.innerHTML = 'GOUAL <b>//</b> NAVIGATION';
    const foot = document.createElement('div'); foot.className = 'fxm-foot'; foot.innerHTML = '<span><i></i>SYSTEM ONLINE</span><span class="socials" style="--soc:34px;color:#fff"></span>';
    const cv = document.createElement('canvas'); cv.className = 'fxm-rain'; cv.setAttribute('aria-hidden', 'true');
    nav.prepend(cv, head); nav.append(foot);
    window.goualSocials?.();

    const g = cv.getContext('2d'); let W, H, F = 13, drops = [], run = false, last = 0, timers = [];
    const col = (x, a) => { let u = (x / W) * (STOPS.length - 1), i = Math.min(u | 0, STOPS.length - 2), f = u - i, A = STOPS[i], B = STOPS[i + 1];
      return `rgba(${A[0] + (B[0] - A[0]) * f | 0},${A[1] + (B[1] - A[1]) * f | 0},${A[2] + (B[2] - A[2]) * f | 0},${a})`; };
    function size() {
      const d = Math.min(devicePixelRatio || 1, 1.5); W = nav.clientWidth; H = nav.clientHeight;
      cv.width = W * d; cv.height = H * d; g.setTransform(d, 0, 0, d, 0, 0);
      drops = Array.from({ length: Math.ceil(W / F) }, () => ({ y: Math.random() * -40, v: .3 + Math.random() * .7 }));
    }
    function loop(now) {
      if (!run) return; requestAnimationFrame(loop); if (now - last < 40) return; last = now;
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over'; g.font = `600 ${F}px ui-monospace, Menlo, monospace`; g.textBaseline = 'top';
      drops.forEach((d, c) => {
        const x = c * F, y = d.y | 0;
        if (y >= 0) { g.fillStyle = col(x, .85); g.fillText(pick(), x, (y - 1) * F); g.fillStyle = 'rgba(235,245,255,.9)'; g.fillText(pick(), x, y * F); }
        d.y += d.v; if (d.y * F > H + Math.random() * 300) { d.y = Math.random() * -10; d.v = .3 + Math.random() * .7; }
      });
    }
    // Labels start as random glyphs and settle letter by letter.
    function decode() {
      items.forEach((el, k) => {
        const l = el.querySelector('.fxm-l'), t = el._t; let n = 0;
        if (calm) { l.textContent = t; return; }
        l.textContent = t.replace(/\S/g, pick);
        const start = setTimeout(() => {
          const iv = setInterval(() => {
            n += .5; l.textContent = [...t].map((ch, i) => (i < n || ch === ' ') ? ch : pick()).join('');
            if (n >= t.length) { clearInterval(iv); l.textContent = t; }
          }, 35);
          timers.push(iv);
        }, 120 + k * 90);
        timers.push(start);
      });
    }
    function open() {
      size(); g.clearRect(0, 0, W, H);
      nav.classList.remove('fxm-in'); void nav.offsetWidth; requestAnimationFrame(() => nav.classList.add('fxm-in'));
      decode(); if (!calm && !run) { run = true; requestAnimationFrame(loop); }
    }
    function close() { run = false; nav.classList.remove('fxm-in'); timers.forEach(t => (clearTimeout(t), clearInterval(t))); timers = []; }
    new MutationObserver(() => (nav.hidden ? close() : open())).observe(nav, { attributes: true, attributeFilter: ['hidden'] });
    addEventListener('resize', () => { if (!nav.hidden) size(); });
    if (!nav.hidden) open();
  }
  const init = () => document.querySelectorAll('nav[data-fxm]').forEach(setup);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
