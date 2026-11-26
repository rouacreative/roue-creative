/* Landing page motion: scroll reveals, progress bar, parallax, header state. Progressive: without JS everything is visible. */
(function () {
  var root = document.documentElement;
  root.classList.remove('lp-js-pending');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  root.classList.add('lp-js');

  /* hero headline: word by word on load */
  var h1 = document.querySelector('.lp-copy h1');
  if (h1 && !h1.querySelector('span')) {
    var out = '', n = 0;
    h1.childNodes.forEach(function (nd) {
      if (nd.nodeType === 3) nd.textContent.split(/\s+/).filter(Boolean).forEach(function (w) { out += '<span class="w" style="--i:' + (n++) + '">' + w + '</span> '; });
      else if (nd.nodeName === 'BR') out += '<br>';
    });
    h1.innerHTML = out;
  }

  var bigEl = document.querySelector('.lp-big');
  if (bigEl && !bigEl.querySelector('.sw')) bigEl.innerHTML = bigEl.textContent.trim().split(/\s+/).map(function (w) { return '<span class="sw">' + w + '</span>'; }).join(' ');

  /* reveal targets, staggered inside each parent */
  var sel = '.lp-head, .lp-card, .lp-steps li, .lp-why > div, .lp-points li, .lp-alt .section-title, .work, .lp-cta .wrap > *, .lp-pills li';
  var io = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' }) : null;
  function arm(scope) {
    (scope || document).querySelectorAll(sel).forEach(function (el) {
      if (el.__rv) return; el.__rv = 1;
      var sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.children, el) : 0;
      el.style.setProperty('--d', Math.min(sib, 5) * 90 + 'ms');
      el.classList.add('rv');
      if (io) io.observe(el); else el.classList.add('in');
    });
  }
  arm();
  /* works are rendered later by the site content script */
  new MutationObserver(function () { arm(); }).observe(document.body, { childList: true, subtree: true });

  /* scroll: progress bar, header state, hero parallax, steps line */
  var bar = document.querySelector('.lp-progress i'), hdr = document.querySelector('.site-header'),
      stage = document.querySelector('.lp-stage'), pin = document.querySelector('.lp-pin'), big = document.querySelector('.lp-big'), steps = document.querySelector('.lp-steps'), tick = false;
  function frame() {
    tick = false;
    var y = window.pageYOffset, h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    if (hdr) hdr.classList.toggle('scrolled', y > 24);
    if (stage && pin) {
      var vh = window.innerHeight, sr = stage.getBoundingClientRect(), tot = sr.height - vh,
          p = tot > 0 ? Math.max(0, Math.min(1, -sr.top / tot)) : 1,
          e = 1 - Math.pow(1 - Math.min(1, p / 0.7), 3),
          t2 = Math.max(0, Math.min(1, (p - 0.12) / 0.3)),
          mob = window.innerWidth < 700, ix = 0, iy = 0, fw = window.innerWidth * (1 - 2 * ix / 100) / 2;
      pin.style.setProperty('--e', e.toFixed(3));
      pin.style.setProperty('--t2', t2.toFixed(3));
      pin.style.setProperty('--ix', (ix * (1 - e)).toFixed(2) + '%');
      pin.style.setProperty('--iy', (iy * (1 - e)).toFixed(2) + '%');
      pin.style.setProperty('--rad', '0px');
      pin.style.setProperty('--sc', (1.12 - 0.12 * e).toFixed(3));
      pin.style.setProperty('--py', (p * -vh * 0.06).toFixed(1) + 'px');
    }
    if (big) {
      var ws = big.querySelectorAll('.sw'), br = big.getBoundingClientRect(),
          q = (window.innerHeight * 0.85 - br.top) / (br.height + window.innerHeight * 0.25);
      q = Math.max(0, Math.min(1, q)); var upto = Math.round(q * ws.length * 1.15);
      for (var k = 0; k < ws.length; k++) ws[k].classList.toggle('on', k < upto);
    }
    document.querySelectorAll('.work .thumb').forEach(function (t) {
      var r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > window.innerHeight) return;
      var img = t.querySelector('img'); if (img) img.style.setProperty('--ty', ((r.top + r.height / 2 - window.innerHeight / 2) * -0.07).toFixed(1) + 'px');
    });
    if (steps) {
      var r = steps.getBoundingClientRect(), p = (window.innerHeight * 0.75 - r.top) / (r.height + window.innerHeight * 0.2);
      steps.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    }
  }
  window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(frame); } }, { passive: true });
  window.addEventListener('resize', frame);
  frame();

  /* soft tilt on service cards (pointer devices only) */
  if (window.matchMedia && matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('.lp-card').forEach(function (c) {
      c.addEventListener('mousemove', function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg'); c.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
        c.style.setProperty('--mx', (x * 100 + 50) + '%'); c.style.setProperty('--my', (y * 100 + 50) + '%');
      });
      c.addEventListener('mouseleave', function () { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
    });
  }
})();
