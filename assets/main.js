/* منصة الشركة — نسخة تجريبية (ديمو) */
(function () {
  'use strict';

  /* فيديو يوتيوب تجريبي مؤقت لإثبات آلية التضمين.
     يُستبدل بمعرّفات فيديوهات قناة الشركة بعد رفعها.
     كل بطاقة/حلقة تأخذ معرّفها من data-yt عند التشغيل الفعلي. */
  var DEMO_YT_ID = 'aqz-KE-bpKQ'; // Big Buck Bunny — فيديو اختبار مفتوح المصدر

  if ('serviceWorker' in navigator && location.protocol === 'https:') { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {}); }

  /* شريط التنقل السفلي (الموبايل) */
  (function () {
    if (document.querySelector('.bottom-nav') || !document.querySelector('.site-header')) return;
    var path = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '').split('/').pop() || 'index';
    var ic = {
      home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
      works: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
      reels: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 10l3 2-3 2z"/>',
      series: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
      req: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'
    };
    var items = [['index', 'index.html', 'الرئيسية', 'home'], ['works', 'works.html', 'الأعمال', 'works'], ['reels', 'reels.html', 'ريلز', 'reels'], ['series', 'series.html', 'السلاسل', 'series'], ['request', 'request.html', 'اطلب خدمتك', 'req']];
    var nav = document.createElement('nav'); nav.className = 'bottom-nav'; nav.setAttribute('aria-label', 'التنقل');
    items.forEach(function (it) {
      var a = document.createElement('a'); a.href = it[1]; if (path === it[0]) a.className = 'on';
      a.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ic[it[3]] + '</svg><span></span>';
      a.lastChild.textContent = it[2]; nav.appendChild(a);
    });
    document.body.appendChild(nav);
  })();

  /* قائمة الموبايل */
  var menuBtn = document.querySelector('.menu-btn');
  var mobileMenu = document.querySelector('.mobile-menu');
  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener('click', function () {
      mobileMenu.classList.toggle('open');
      menuBtn.textContent = mobileMenu.classList.contains('open') ? '✕' : '☰';
    });
  }

  /* تبويبات تصفية الأعمال */
  var tabs = document.querySelectorAll('.tab[data-filter]');
  if (tabs.length) {
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var f = tab.getAttribute('data-filter');
        document.querySelectorAll('[data-cat]').forEach(function (card) {
          card.style.display = (f === 'all' || card.getAttribute('data-cat') === f) ? '' : 'none';
        });
      });
    });
  }

  /* مشغل يوتيوب: لا يحمّل iframe إلا بعد الضغط على زر التشغيل */
  var cover = document.querySelector('.player .cover');
  if (cover) {
    cover.addEventListener('click', function () {
      var player = cover.parentElement;
      var id = player.getAttribute('data-yt') || DEMO_YT_ID;
      var iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      iframe.setAttribute('allow', 'accelerometer; autoplay; encrypted-media; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      iframe.title = 'مشغل الفيديو';
      cover.remove();
      player.appendChild(iframe);
    });
  }

  /* اختيار حلقة من القائمة */
  var episodes = document.querySelectorAll('.episode');
  if (episodes.length) {
    episodes.forEach(function (ep) {
      ep.addEventListener('click', function () {
        episodes.forEach(function (e) { e.classList.remove('current'); });
        ep.classList.add('current');
        var titleEl = document.querySelector('.watch-title h2');
        var h4 = ep.querySelector('h4');
        if (titleEl && h4) titleEl.textContent = h4.textContent;
        var player = document.querySelector('.player');
        if (player) {
          player.scrollIntoView({ behavior: 'smooth', block: 'center' });
          /* في الديمو كل الحلقات تعرض نفس الفيديو التجريبي */
        }
      });
    });
  }

  /* النماذج في الديمو: لا إرسال فعلي */
  document.querySelectorAll('form[data-demo]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showToast(form.getAttribute('data-demo') || 'نسخة تجريبية — لم يتم الإرسال');
    });
  });

  var toastTimer;
  function showToast(msg) {
    var toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 3200);
  }

  /* سنة الفوتر */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
