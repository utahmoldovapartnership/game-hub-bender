/* ============================================================================
   GAME HUB — интерактив лендинга
   Без зависимостей. Всё деградирует корректно, если JS отключён.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------- Год в подвале ------ */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------- Мобильное меню ----- */
  var burger = document.getElementById('burger');
  var nav    = document.getElementById('nav');

  function closeMenu() {
    if (!burger || !nav) return;
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      nav.classList.toggle('is-open', !open);
      burger.setAttribute('aria-expanded', String(!open));
      burger.setAttribute('aria-label', !open ? 'Закрыть меню' : 'Открыть меню');
    });

    // Закрываем по клику на пункт и по Escape
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        closeMenu();
        burger.focus();
      }
    });
  }

  /* --------------------------------------- Тень у шапки при скролле ----- */
  var header = document.getElementById('header');
  if (header) {
    var onScrollHeader = function () {
      header.classList.toggle('is-stuck', window.scrollY > 8);
    };
    onScrollHeader();
    window.addEventListener('scroll', onScrollHeader, { passive: true });
  }

  /* -------------------------------- Подсветка активного пункта меню ----- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  if (sections.length && 'IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          var isCurrent = a.getAttribute('href') === '#' + entry.target.id;
          if (isCurrent) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navObserver.observe(s); });
  }

  /* ---------------------------------------- Появление блоков (reveal) --- */
  var revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    // Без анимации — просто показываем всё сразу
    Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('is-in'); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        // Лёгкая каскадность внутри одного экрана
        entry.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    // Сразу показываем всё, что уже находится в зоне видимости (или выше неё).
    // Это важно при переходе по прямой ссылке с якорем (#gallery, #faq и т.д.):
    // иначе пользователь несколько мгновений видит пустой экран, пока
    // не сработает наблюдатель, зависящий от отрисовки кадров.
    var vh = window.innerHeight || document.documentElement.clientHeight;
    Array.prototype.forEach.call(revealEls, function (el) {
      var rect = el.getBoundingClientRect();
      if (rect.top < vh * 0.95) {
        el.classList.add('is-in');
      } else {
        revealObserver.observe(el);
      }
    });

    // Страховка на случай, если наблюдатель так и не отработает:
    // пустую страницу пользователь увидеть не должен.
    setTimeout(function () {
      Array.prototype.forEach.call(revealEls, function (el) { el.classList.add('is-in'); });
    }, 1200);
  }

  /* ----------------------------------------- Фоновое видео в герое ------ */
  var heroVideo  = document.getElementById('heroVideo');
  var heroToggle = document.getElementById('heroToggle');

  if (heroVideo && heroToggle) {

    // Пользователь сам нажал паузу — тогда ничего не запускаем за него
    var userPaused = false;

    /*  Состояние кнопки берём ИЗ САМОГО ВИДЕО, а не выставляем руками.
        Иначе при заблокированном автозапуске кнопка показывала бы «пауза»,
        хотя видео стоит, и первое нажатие уходило бы впустую.             */
    function syncToggle() {
      var paused = heroVideo.paused;
      heroToggle.setAttribute('aria-pressed', String(paused));
      heroToggle.setAttribute('aria-label',
        paused ? 'Запустить фоновое видео' : 'Поставить фоновое видео на паузу');
    }
    heroVideo.addEventListener('play',  syncToggle);
    heroVideo.addEventListener('pause', syncToggle);

    function tryPlay() {
      var p = heroVideo.play();
      // В старых браузерах play() ничего не возвращает
      if (!p || typeof p.catch !== 'function') return;
      p.catch(function () { syncToggle(); });
    }

    /*  Браузер вправе заблокировать автозапуск: энергосбережение, режим
        «ограничить мультимедиа» в Edge, низкий заряд на телефоне.
        Тогда запускаем видео при первом же действии пользователя —
        он увидит движение, а не застывший кадр.                           */
    function playOnFirstInteraction() {
      var events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
      function start() {
        events.forEach(function (ev) { window.removeEventListener(ev, start); });
        if (!userPaused && heroVideo.paused) tryPlay();
      }
      events.forEach(function (ev) {
        window.addEventListener(ev, start, { passive: true });
      });
    }

    /*  Экономия мобильного трафика: если в телефоне включён режим
        экономии данных или связь совсем медленная, фоновое видео (около 3 МБ)
        не грузим — показываем постер. Запустить можно кнопкой.            */
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var saveData = !!(conn && (conn.saveData === true ||
                     /(^|-)2g$/.test(conn.effectiveType || '')));

    if (reduceMotion || saveData) {
      // Система просит меньше движения или экономить трафик:
      // сами не запускаем, но кнопка работает
      heroVideo.removeAttribute('autoplay');
      heroVideo.pause();
      if (saveData) {
        heroVideo.preload = 'none';
        heroVideo.removeAttribute('src');
        // прекращаем начатую закачку, постер остаётся на месте
        heroVideo.load();
      }
      userPaused = true;
    } else {
      tryPlay();
      // Через полсекунды проверяем, получилось ли
      setTimeout(function () {
        if (heroVideo.paused && !userPaused) playOnFirstInteraction();
      }, 500);
    }
    syncToggle();

    heroToggle.addEventListener('click', function () {
      if (heroVideo.paused) {
        userPaused = false;
        // Если видео не грузили ради экономии трафика — подгружаем сейчас
        if (!heroVideo.currentSrc && heroVideo.querySelector('source')) {
          heroVideo.preload = 'auto';
          heroVideo.load();
        }
        tryPlay();
      } else {
        userPaused = true;
        heroVideo.pause();
      }
    });

    // Экономим батарею и трафик: вне экрана видео стоит
    if ('IntersectionObserver' in window) {
      var heroObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (userPaused || reduceMotion) return;
          if (entry.isIntersecting) tryPlay();
          else heroVideo.pause();
        });
      }, { threshold: 0.1 });
      heroObserver.observe(heroVideo);
    }
  }

  /* -------------------------------------- Статус «открыто / закрыто» ---- */
  /*  Расписание. Летом (июнь–август) — 10:00–23:00 ежедневно.
      В учебный год: Пн–Пт 12:00–22:00, Сб–Вс 10:00–23:00.
      Чтобы поменять часы — правьте только этот объект.                    */
  var SCHEDULE = {
    summerMonths: [5, 6, 7],                 // июнь, июль, август (0 = январь)
    summer:  { open: 10, close: 23 },
    weekday: { open: 12, close: 22 },        // Пн–Пт в учебный год
    weekend: { open: 10, close: 23 }         // Сб–Вс в учебный год
  };

  function todayHours(now) {
    var month = now.getMonth();
    var day   = now.getDay();                // 0 = воскресенье
    if (SCHEDULE.summerMonths.indexOf(month) !== -1) return SCHEDULE.summer;
    return (day === 0 || day === 6) ? SCHEDULE.weekend : SCHEDULE.weekday;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function updateStatus() {
    var chip = document.getElementById('statusChip');
    var text = document.getElementById('statusText');
    if (!chip || !text) return;

    var now   = new Date();
    var hours = todayHours(now);
    var h     = now.getHours() + now.getMinutes() / 60;
    var isOpen = h >= hours.open && h < hours.close;

    chip.setAttribute('data-open', String(isOpen));
    text.textContent = isOpen
      ? 'Сегодня открыто до ' + pad(hours.close) + ':00'
      : 'Сейчас закрыто · сегодня с ' + pad(hours.open) + ':00 до ' + pad(hours.close) + ':00';
  }
  updateStatus();
  setInterval(updateStatus, 60000);

  /* ------------------------------------ Переключатель сезона (часы) ----- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.switch__btn'));

  function selectTab(tab) {
    tabs.forEach(function (t) {
      var selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { selectTab(tab); });
    // Навигация стрелками по вкладкам — требование для role="tablist"
    tab.addEventListener('keydown', function (e) {
      var dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      e.preventDefault();
      var next = tabs[(index + dir + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  // Автовыбор сезона по текущей дате
  if (tabs.length) {
    var isSummerNow = SCHEDULE.summerMonths.indexOf(new Date().getMonth()) !== -1;
    var target = document.getElementById(isSummerNow ? 'tab-summer' : 'tab-school');
    if (target) selectTab(target);
  }

  /* ----------------------------------------------------------- FAQ ------ */
  function expand(panel) {
    panel.style.height = panel.scrollHeight + 'px';
    // После анимации — auto, чтобы ответ не обрезался при изменении ширины окна
    var done = function () {
      panel.style.height = 'auto';
      panel.removeEventListener('transitionend', done);
    };
    panel.addEventListener('transitionend', done);
  }

  function collapse(panel) {
    panel.style.height = panel.scrollHeight + 'px';   // фиксируем текущую высоту
    void panel.offsetHeight;                          // принудительный reflow
    panel.style.height = '0px';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.faq__q'), function (btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));

    btn.addEventListener('click', function () {
      var item = btn.closest('.faq__item');
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (item) item.classList.toggle('is-open', !isOpen);
      if (!panel) return;
      if (isOpen) collapse(panel); else expand(panel);
    });
  });

  // Пересчитываем высоту открытых ответов при изменении ширины окна
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.faq__item.is-open .faq__a'), function (p) {
        p.style.height = 'auto';
      });
    }, 150);
  });

  /* ------------------------------------------------------- Лайтбокс ----- */
  var lightbox = document.getElementById('lightbox');
  var lbImg    = document.getElementById('lightboxImg');
  var lbClose  = document.getElementById('lbClose');
  var lbPrev   = document.getElementById('lbPrev');
  var lbNext   = document.getElementById('lbNext');
  var currentGroup = [];
  var current  = 0;
  var lastFocused = null;

  function show(index) {
    if (!currentGroup.length) return;
    current = (index + currentGroup.length) % currentGroup.length;
    var btn = currentGroup[current];
    var img = btn.querySelector('img');
    lbImg.src = btn.getAttribute('data-full') || (img && img.src) || '';
    lbImg.alt = (img && img.alt) || '';
  }

  function openLightbox(group, index) {
    if (!lightbox || typeof lightbox.showModal !== 'function') return false;
    currentGroup = group;
    lastFocused = document.activeElement;
    show(index);
    // Стрелки нужны только если в группе больше одного изображения
    var many = group.length > 1;
    if (lbPrev) lbPrev.hidden = !many;
    if (lbNext) lbNext.hidden = !many;
    lightbox.showModal();
    lbClose.focus();
    return true;
  }

  // Каждый контейнер [data-lightbox] — отдельная последовательность:
  // фотогалерея и лента Instagram листаются независимо друг от друга.
  Array.prototype.forEach.call(document.querySelectorAll('[data-lightbox]'), function (container) {
    var group = Array.prototype.slice.call(container.querySelectorAll('[data-full]'));
    group.forEach(function (btn, i) {
      btn.addEventListener('click', function (e) {
        if (openLightbox(group, i)) e.preventDefault();
      });
    });
  });

  if (lightbox) {
    lbClose.addEventListener('click', function () { lightbox.close(); });
    lbPrev.addEventListener('click',  function () { show(current - 1); });
    lbNext.addEventListener('click',  function () { show(current + 1); });

    lightbox.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); show(current - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
    });

    // Клик по фону закрывает
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) lightbox.close();
    });

    // Возвращаем фокус туда, откуда открыли
    lightbox.addEventListener('close', function () {
      lbImg.src = '';
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    });
  }

  /* ------------------------------------------------------- Карусели ----- */
  /*  Лента прокручивается нативно (свайп, колесо, клавиши), поэтому здесь
      только кнопки «вперёд/назад» и точки. Шаг — одна «страница», то есть
      столько карточек, сколько помещается в видимую часть.                 */
  Array.prototype.forEach.call(document.querySelectorAll('[data-carousel]'), function (root) {
    var track = root.querySelector('.carousel__track');
    var prev  = root.querySelector('[data-carousel-prev]');
    var next  = root.querySelector('[data-carousel-next]');
    var dotsBox = root.querySelector('[data-carousel-dots]');
    if (!track) return;

    var slides = Array.prototype.slice.call(track.children);
    if (!slides.length) return;

    var pages = 1;

    // Ширина шага = ширина карточки + промежуток между карточками
    function step() {
      if (slides.length < 2) return track.clientWidth;
      return Math.round(slides[1].offsetLeft - slides[0].offsetLeft);
    }

    function perView() {
      var w = step();
      if (!w) return 1;
      return Math.max(1, Math.round(track.clientWidth / w));
    }

    function currentPage() {
      var w = step() * perView();
      if (!w) return 0;
      return Math.min(pages - 1, Math.round(track.scrollLeft / w));
    }

    function buildDots() {
      if (!dotsBox) return;
      pages = Math.max(1, Math.ceil(slides.length / perView()));
      dotsBox.innerHTML = '';
      if (pages < 2) return;                 // одна страница — точки не нужны
      for (var i = 0; i < pages; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'carousel__dot';
        b.setAttribute('aria-label', 'Показать группу ' + (i + 1) + ' из ' + pages);
        b.dataset.page = String(i);
        dotsBox.appendChild(b);
      }
    }

    function goToPage(i) {
      var w = step() * perView();
      track.scrollTo({ left: i * w, behavior: 'auto' });   // плавность задаёт CSS
    }

    function update() {
      // 1px допуска: браузеры округляют scrollLeft дробно
      var atStart = track.scrollLeft <= 1;
      var atEnd   = track.scrollLeft >= track.scrollWidth - track.clientWidth - 1;
      if (prev) prev.disabled = atStart;
      if (next) next.disabled = atEnd;

      if (!dotsBox) return;
      var active = currentPage();
      Array.prototype.forEach.call(dotsBox.children, function (dot, i) {
        if (i === active) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    // Сдвиг на страницу. update() вызываем и сразу, и после прокрутки:
    // состояние кнопок не должно зависеть от того, успел ли браузер
    // отрисовать кадр — иначе «назад» может остаться заблокированной
    // и начнёт глотать нажатия.
    function nudge(dir) {
      track.scrollBy({ left: dir * step() * perView(), behavior: 'auto' });
      update();
      setTimeout(update, 450);   // после плавной прокрутки
    }

    if (prev) prev.addEventListener('click', function () { nudge(-1); });
    if (next) next.addEventListener('click', function () { nudge(1); });
    if (dotsBox) dotsBox.addEventListener('click', function (e) {
      var dot = e.target.closest('.carousel__dot');
      if (!dot) return;
      goToPage(+dot.dataset.page);
      update();
      setTimeout(update, 450);
    });

    // Стрелки ←/→, когда фокус на самой ленте
    track.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      nudge(e.key === 'ArrowRight' ? 1 : -1);
    });

    // Троттлинг по времени, а не по кадрам: работает и в фоновой вкладке
    var lastRun = 0, pending;
    track.addEventListener('scroll', function () {
      var now = Date.now();
      clearTimeout(pending);
      if (now - lastRun > 100) { lastRun = now; update(); }
      else { pending = setTimeout(function () { lastRun = Date.now(); update(); }, 100); }
    }, { passive: true });

    var resizeT;
    window.addEventListener('resize', function () {
      clearTimeout(resizeT);
      resizeT = setTimeout(function () { buildDots(); update(); }, 150);
    });

    buildDots();
    update();
  });

  /* ------------------------------ Мобильная панель: показ после героя --- */
  var bar = document.getElementById('mobilebar');
  var hero = document.querySelector('.hero');
  if (bar && hero && 'IntersectionObserver' in window) {
    var barObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        bar.classList.toggle('is-visible', !entry.isIntersecting);
      });
    }, { threshold: 0, rootMargin: '-100px 0px 0px 0px' });
    barObserver.observe(hero);
  } else if (bar) {
    bar.classList.add('is-visible');
  }

})();
