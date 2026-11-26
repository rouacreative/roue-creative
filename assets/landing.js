/* Landing page motion: scroll reveals, progress bar, parallax, header state. Progressive: without JS everything is visible. */
(function () {
  var root = document.documentElement;
  root.classList.remove('lp-js-pending');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;
  root.classList.add('lp-js');

  /* hero headline: word by word on load */
  var h1 = document.querySelector('.lp-hero h1');
  if (h1 && !h1.querySelector('span')) {
    var out = '', n = 0;
    h1.childNodes.forEach(function (nd) {
      if (nd.nodeType === 3) nd.textContent.split(/\s+/).filter(Boolean).forEach(function (w) { out += '<span class="w" style="--i:' + (n++) + '">' + w + '</span> '; });
      else if (nd.nodeName === 'BR') out += '<br>';
    });
    h1.innerHTML = out;
  }

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
      hero = document.querySelector('.lp-hero'), steps = document.querySelector('.lp-steps'), tick = false;
  function frame() {
    tick = false;
    var y = window.pageYOffset, h = document.documentElement.scrollHeight - window.innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    if (hdr) hdr.classList.toggle('scrolled', y > 24);
    if (hero && y < window.innerHeight * 1.2) hero.style.setProperty('--py', (y * 0.18).toFixed(1) + 'px'), hero.style.setProperty('--gy', (y * -0.08).toFixed(1) + 'px');
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
