/* Zwicky: يطبّق محتوى الموقع من لوحة الإدارة (الألوان، الخط، النصوص، الصور، الأعمال، السلاسل، الباقات، الفريق).
   لو الـ API مش متاح يفضل الموقع زي ما هو (المحتوى الثابت في الصفحات). كل النصوص بتدخل بـ textContent فقط. */
(function () {
  'use strict';
  if (location.protocol === 'file:') return;
  var KEY = 'zw_site_v1', SITE = null, ITEMS = [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function mix(a, b, t) { var p = function (h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }, x = p(a), y = p(b);
    return '#' + x.map(function (v, i) { return ('0' + Math.round(v + (y[i] - v) * t).toString(16)).slice(-2); }).join(''); }
  function applyTheme(site) {
    var t = (site && site.theme) || {}, D = { bg: '#FBF7EE', ink: '#0A3D31', accent: '#0E6B50', dark: '#0A2F27', card: '#ffffff' }, c = {};
    for (var k in D) c[k] = /^#[0-9a-f]{6}$/i.test(t[k] || '') ? t[k] : D[k];
    var css = ':root{--bg:' + c.bg + ';--ink:' + c.ink + ';--muted:' + mix(c.ink, c.bg, .5) + ';--faint:' + mix(c.ink, c.bg, .7) + ';--accent:' + c.accent + ';--accent-dark:' + mix(c.accent, '#000000', .25) +
      ';--accent-soft:' + mix(c.accent, '#ffffff', .88) + ';--dark:' + c.dark + ';--dark-2:' + mix(c.dark, '#000000', .35) + ';--card:' + c.card + ';--line:' + mix(c.ink, c.bg, .88) +
      ';--mut:' + mix(c.ink, c.bg, .5) + ';--acc:' + c.accent + ';--accd:' + mix(c.accent, '#000000', .25) + ';--soft:' + mix(c.accent, '#ffffff', .88) + '}';
    var f = t.font && /^[A-Za-z ]{2,40}$/.test(t.font) ? t.font : '';
    if (f) {
      if (!$('link[data-zw-font]')) { var l = el('link'); l.rel = 'stylesheet'; l.setAttribute('data-zw-font', '1'); l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;600;700&display=swap'; document.head.appendChild(l); }
      css += 'body,button,input,select,textarea{font-family:"' + f + '","Segoe UI",Tahoma,sans-serif}';
    }
    var s = $('#zw-theme') || el('style'); s.id = 'zw-theme'; s.textContent = css; (document.head || document.documentElement).appendChild(s);
  }
  window.zwApplyTheme = applyTheme;
  try { var cached = JSON.parse(localStorage.getItem(KEY) || 'null'); if (cached) applyTheme(cached); } catch (e) {}

  function img(v) { if (!v) return ''; if (/^m:[0-9a-f-]{36}$/i.test(v)) return '/api/media/' + v.slice(2); if (/^assets\/img\/[a-z0-9-]+\.(jpg|png)$/.test(v)) return '/' + v; return ''; }
  function ytThumb(id) { return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' : ''; }
  function catName(it) { var cs = (SITE && SITE.categories) || [], f = it.extra && it.extra.filter, i; for (i = 0; i < cs.length; i++) if (cs[i].id === f) return cs[i].name; return ''; }
  function setText(e, v) { e.textContent = ''; String(v).split('\n').forEach(function (ln, i) { if (i) e.appendChild(document.createElement('br')); e.appendChild(document.createTextNode(ln)); }); }
  function href(k, v) {
    v = String(v || '').trim(); if (!v) return '';
    if (k === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'mailto:' + v : '';
    if (k === 'whatsapp') { if (/^https:\/\/wa\.me\/\d+/.test(v)) return v; var d = v.replace(/\D/g, ''); return d.length > 6 ? 'https://wa.me/' + d : ''; }
    return /^https:\/\/\S+$/.test(v) ? v : '';
  }
  function toast(m) { var t = $('.toast') || document.body.appendChild(el('div', 'toast')); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('show'); }, 3500); }

  /* ---- بطاقات ---- */
  function thumb(it, extra) {
    var t = el('div', 'thumb'), src = img(it.image) || ytThumb(it.yt), i;
    if (src) { i = el('img'); i.src = src; i.alt = it.title; i.loading = 'lazy'; t.appendChild(i); }
    var badge = it.cat || catName(it); if (badge) t.appendChild(el('span', 'cat', badge));
    if (extra !== false) t.appendChild(el('span', 'play', '▶'));
    return t;
  }
  function workCard(it, story) {
    var a = el('a', story ? 'story' : 'work'); a.href = 'watch.html?id=' + it.id;
    if (!story) a.setAttribute('data-cat', (it.extra && it.extra.filter) || '');
    a.appendChild(thumb(it));
    if (story) { a.appendChild(el('h3', null, it.title)); a.appendChild(el('p', null, it.sub)); }
    else { var b = el('div', 'work-body'); b.appendChild(el('h3', null, it.title)); b.appendChild(el('p', null, it.sub)); a.appendChild(b); }
    return a;
  }
  function packageCard(it) {
    var x = it.extra || {}, d = el('div', 'price' + (x.featured ? ' featured' : ''));
    if (x.featured && x.badge) d.appendChild(el('span', 'badge', x.badge));
    d.appendChild(el('h3', null, it.title)); d.appendChild(el('p', 'desc', it.sub));
    d.appendChild(el('div', 'amount', x.price || '')); d.appendChild(el('div', 'unit', x.unit || ''));
    var ul = el('ul'); (x.features || []).forEach(function (f) { ul.appendChild(el('li', null, f)); }); d.appendChild(ul);
    var a = el('a', 'btn block' + (x.featured ? ' primary' : ''), 'اطلب هذه الباقة'); a.href = 'request.html'; d.appendChild(a); return d;
  }
  function memberCard(it) {
    var d = el('div', 'member'), av = el('div', 'avatar'), src = img(it.image);
    if (src) { var i = el('img'); i.src = src; i.alt = it.title; av.appendChild(i); } else av.textContent = (it.title || '؟').trim().charAt(0);
    d.appendChild(av); d.appendChild(el('h3', null, it.title)); d.appendChild(el('div', 'role', (it.extra && it.extra.role) || '')); d.appendChild(el('p', null, it.sub)); return d;
  }
  function reelCard(it, list, idx) {
    var a = el('button', 'reel'); a.type = 'button'; a.setAttribute('data-cat', (it.extra && it.extra.filter) || '');
    var th = el('span', 'reel-thumb'), src = img(it.image) || ytThumb(it.yt);
    if (src) { var i = el('img'); i.src = src; i.alt = it.title; i.loading = 'lazy'; th.appendChild(i); }
    th.appendChild(el('span', 'play', '▶')); a.appendChild(th); a.appendChild(el('b', null, it.title)); if (it.sub) a.appendChild(el('small', null, it.sub));
    a.addEventListener('click', function () { openReel(list, idx); }); return a;
  }
  function openReel(list, idx) {
    var ov = $('#reel-ov'); if (ov) ov.remove();
    ov = el('div', 'reel-ov'); ov.id = 'reel-ov';
    var box = el('div', 'reel-box'), cap = el('div', 'reel-cap'), fr = el('div', 'reel-frame');
    function show(n) {
      idx = (n + list.length) % list.length; var it = list[idx]; fr.textContent = '';
      var f = el('iframe'); f.src = 'https://www.youtube-nocookie.com/embed/' + it.yt + '?autoplay=1&playsinline=1&rel=0&loop=1&playlist=' + it.yt;
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); f.setAttribute('allowfullscreen', ''); f.title = it.title; fr.appendChild(f);
      cap.textContent = ''; cap.appendChild(el('b', null, it.title)); if (it.sub) cap.appendChild(el('span', null, it.sub));
    }
    function close() { ov.remove(); document.removeEventListener('keydown', key); document.body.style.overflow = ''; }
    function key(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(idx + 1); else if (e.key === 'ArrowRight') show(idx - 1); }
    var x = el('button', 'reel-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'إغلاق'); x.onclick = close;
    var nx = el('button', 'reel-nav next', '‹'); nx.type = 'button'; nx.setAttribute('aria-label', 'التالي'); nx.onclick = function () { show(idx + 1); };
    var pv = el('button', 'reel-nav prev', '›'); pv.type = 'button'; pv.setAttribute('aria-label', 'السابق'); pv.onclick = function () { show(idx - 1); };
    box.appendChild(fr); box.appendChild(cap); ov.appendChild(box); if (list.length > 1) { ov.appendChild(pv); ov.appendChild(nx); } ov.appendChild(x);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.addEventListener('keydown', key); document.body.style.overflow = 'hidden'; document.body.appendChild(ov); show(idx);
  }
  function buildTabs(box, list) {
    var tabs = $('.tabs'); if (!tabs || !SITE.categories) return;
    var used = SITE.categories.filter(function (c) { return list.some(function (i) { return (i.extra && i.extra.filter) === c.id; }); });
    tabs.textContent = ''; var all = el('button', 'tab active', 'الكل'); all.setAttribute('data-filter', 'all'); tabs.appendChild(all);
    used.forEach(function (c) { var b = el('button', 'tab', c.name); b.setAttribute('data-filter', c.id); tabs.appendChild(b); });
    if (used.length < 1) { tabs.style.display = 'none'; return; } tabs.style.display = '';
    $$('.tab', tabs).forEach(function (t) {
      t.addEventListener('click', function () {
        $$('.tab', tabs).forEach(function (x) { x.classList.remove('active'); }); t.classList.add('active');
        var f = t.getAttribute('data-filter'); $$('[data-cat]', box).forEach(function (c) { c.style.display = (f === 'all' || c.getAttribute('data-cat') === f) ? '' : 'none'; });
      });
    });
  }
  function renderLists() {
    $$('[data-cms-list]').forEach(function (box) {
      var kind = box.getAttribute('data-cms-list');
      if (!SITE.managed || !SITE.managed[kind]) return; /* لسه المحتوى الثابت */
      var list = ITEMS.filter(function (i) { return i.kind === kind; }), lim = +box.getAttribute('data-limit') || 0;
      if (lim) list = list.slice(0, lim);
      box.textContent = '';
      if (!list.length) { box.appendChild(el('p', 'empty-msg', 'قريبًا… بنجهّز المحتوى.')); var tb = $('.tabs'); if (tb && (kind === 'work' || kind === 'reel')) tb.style.display = 'none'; return; }
      list.forEach(function (it, n) { box.appendChild(kind === 'reel' ? reelCard(it, list.filter(function (r) { return r.yt; }), list.filter(function (r) { return r.yt; }).indexOf(it)) : kind === 'package' ? packageCard(it) : kind === 'member' ? memberCard(it) : workCard(it, box.getAttribute('data-card') === 'story')); });
      if (kind === 'work' || kind === 'reel') buildTabs(box, list);
    });
  }

  /* ---- صفحة المشاهدة ---- */
  function renderWatch() {
    var q = new URLSearchParams(location.search), id = q.get('id'), epId = q.get('ep'); if (!id) return;
    var it = ITEMS.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    var series = it, cur = it, eps = [];
    if (it.kind === 'episode') { series = ITEMS.filter(function (x) { return x.id === it.extra.series; })[0] || it; epId = it.id; }
    if (series.kind === 'series') {
      eps = ITEMS.filter(function (x) { return x.kind === 'episode' && x.extra && x.extra.series === series.id; });
      cur = (epId && eps.filter(function (x) { return x.id === epId; })[0]) || eps[0] || series;
    }
    var h1 = $('.page-intro h1'), p = $('.page-intro p'); if (h1) h1.textContent = series.title; if (p) p.textContent = series.sub || '';
    document.title = series.title + ' — ' + ((SITE.texts && SITE.texts.brand) || 'ROUA');
    var wt = $('.watch-title h2'), wm = $('.watch-meta'); if (wt) wt.textContent = cur.title; if (wm) wm.textContent = cur === series ? '' : (cur.sub || '');
    var player = $('.player'), cover = $('.player .cover');
    if (player && cover) {
      var im = $('img', cover), src = img(cur.image) || img(series.image) || ytThumb(cur.yt); if (im) { if (src) im.src = src; }
      if (cur.yt) player.setAttribute('data-yt', cur.yt);
      else { var c2 = cover.cloneNode(true); cover.parentNode.replaceChild(c2, cover); var pl = $('.play', c2); if (pl) pl.textContent = ''; c2.appendChild(el('span', 'soon', 'الفيديو هيتنزل قريبًا')); c2.style.cursor = 'default'; c2.querySelector('.soon').style.cssText = 'position:absolute;inset:auto 0 18px 0;text-align:center;color:#fff;font-weight:700;text-shadow:0 1px 6px #000a'; }
    }
    var isWork = series.kind === 'work';
    if (isWork) {
      var sub = $('.subscribe'); if (sub && sub.closest('.section')) sub.closest('.section').style.display = 'none';
      var x = it.extra || {}, host = $('.watch-title') && $('.watch-title').parentNode, old = $('#work-details'); if (old) old.remove();
      if (host) {
        var d = el('div', 'work-details'); d.id = 'work-details';
        var chips = el('div', 'wd-chips'), cn = catName(it);
        [['التصنيف', cn], ['العميل', x.client], ['السنة', x.year], ['الخدمات', x.services]].forEach(function (c) { if (c[1]) { var s2 = el('span', 'wd-chip'); s2.appendChild(el('small', null, c[0])); s2.appendChild(el('b', null, c[1])); chips.appendChild(s2); } });
        if (chips.childNodes.length) d.appendChild(chips);
        if (x.desc) { var pp = el('p', 'wd-desc'); setText(pp, x.desc); d.appendChild(pp); }
        var cta = el('a', 'btn primary', 'اطلب عمل زي ده'); cta.href = 'request.html'; d.appendChild(cta);
        var rel = ITEMS.filter(function (r) { return r.kind === 'work' && r.id !== it.id && (!x.filter || (r.extra && r.extra.filter) === x.filter); }).slice(0, 3);
        if (rel.length) { d.appendChild(el('h3', 'wd-h', 'أعمال مشابهة')); var g = el('div', 'cards'); rel.forEach(function (r) { g.appendChild(workCard(r)); }); d.appendChild(g); }
        host.appendChild(d);
      }
    }
    var aside = $('.episodes'), grid = $('.watch-grid');
    if (aside) {
      if (!eps.length) { aside.style.display = 'none'; if (grid) grid.style.gridTemplateColumns = '1fr'; }
      else {
        $$('.episode', aside).forEach(function (e) { e.remove(); });
        eps.forEach(function (e) {
          var a = el('a', 'episode' + (e === cur ? ' current' : '')); a.href = 'watch.html?id=' + series.id + '&ep=' + e.id;
          var th = el('span', 'ep-thumb'), s = img(e.image) || img(series.image) || ytThumb(e.yt); if (s) { var i = el('img'); i.src = s; i.alt = ''; i.loading = 'lazy'; th.appendChild(i); } th.appendChild(el('span', null, '▶')); a.appendChild(th);
          var d = el('div'); d.appendChild(el('h4', null, e.title)); d.appendChild(el('p', null, e.sub)); a.appendChild(d); aside.appendChild(a);
        });
      }
    }
  }

  /* ---- النماذج ---- */
  function liveForms() {
    $$('form[data-cms-form]').forEach(function (old) {
      var kind = old.getAttribute('data-cms-form'), f = old.cloneNode(true); /* بيشيل مستمع الديمو */
      f.removeAttribute('data-demo'); old.parentNode.replaceChild(f, old);
      var hp = el('input'); hp.type = 'text'; hp.name = 'hp'; hp.tabIndex = -1; hp.autocomplete = 'off'; hp.setAttribute('aria-hidden', 'true'); hp.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;opacity:0;height:0'; f.appendChild(hp);
      f.addEventListener('submit', function (ev) {
        ev.preventDefault(); var data = { hp: hp.value }, btn = $('button[type=submit]', f);
        $$('input,select,textarea', f).forEach(function (x) { if (x.id && x !== hp) data[x.id] = x.value; });
        if (kind === 'subscribe') { var em = $('input[type=email]', f); data.email = em ? em.value : ''; }
        if (btn) btn.disabled = true;
        fetch('/api/public/' + (kind === 'subscribe' ? 'subscribe' : 'request'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
          .then(function (r) { if (r.status === 429) throw 'many'; if (!r.ok) throw 'bad'; f.reset(); toast(kind === 'subscribe' ? 'تمام، اشتركت.' : 'وصلنا طلبك. هنتواصل معاك قريب.'); })
          .catch(function (e) { toast(e === 'many' ? 'محاولات كتير. جرّب بعد شوية.' : 'حصلت مشكلة. جرّب تاني.'); })
          .then(function () { if (btn) btn.disabled = false; });
      });
    });
  }

  function apply() {
    var T = SITE.texts || {}, L = SITE.links || {}, I = SITE.images || {};
    $$('[data-cms]').forEach(function (e) { var v = T[e.getAttribute('data-cms')]; if (v) setText(e, v); });
    $$('[data-cms-link]').forEach(function (a) {
      var k = a.getAttribute('data-cms-link'), h = href(k, L[k]);
      if (h) { a.href = h; if (k !== 'email') { a.target = '_blank'; a.rel = 'noopener'; } else if (!a.querySelector('svg')) a.textContent = L[k]; }
      else if (SITE.hide_demo && (a.getAttribute('href') || '#') === '#') a.style.display = 'none';
    });
    var logo = img(I.logo);
    if (logo) { $$('img.logo-mark,.footer-brand img,.logo img').forEach(function (i) { i.src = logo; }); $$('link[rel=icon],link[rel=apple-touch-icon]').forEach(function (l) { l.href = logo; }); }
    $$('[data-demo-only]').forEach(function (e) { e.style.display = SITE.hide_demo ? 'none' : ''; });
    renderLists(); renderWatch(); liveForms();
  }
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  fetch('/api/site', { credentials: 'omit', cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) {
    SITE = d.site || {}; ITEMS = d.items || [];
    try { localStorage.setItem(KEY, JSON.stringify(SITE)); } catch (e) {}
    applyTheme(SITE); ready(function () { if (!$('[data-theme-only]')) apply(); else { var lg = img((SITE.images || {}).logo); if (lg) $$('.logo img').forEach(function (i) { i.src = lg; }); } });
  }).catch(function () {});
})();
