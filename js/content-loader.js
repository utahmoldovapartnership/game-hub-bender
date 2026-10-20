/* ============================================================================
   GAME HUB — ГИДРАТАЦИЯ КОНТЕНТА
   ----------------------------------------------------------------------------
   Подтягивает тексты, картинки и ссылки из data/content.json и подставляет
   их в элементы с атрибутами data-edit*. Исходный HTML остаётся запасным
   вариантом: если файл не загрузился или ключа нет — на странице остаётся
   то, что уже свёрстано (важно для SEO, скорости и офлайн-просмотра).

   Приоритет значений:
     1) исходный HTML (запасной вариант по умолчанию)
     2) data/content.json  (опубликованная версия из репозитория)
     3) localStorage превью (несохранённые правки редактора — только на этом
        устройстве, для мгновенного предпросмотра до публикации)
   ========================================================================== */
(function () {
  'use strict';

  var PREVIEW_KEY = 'gh_content_preview';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Применяет одно значение к одному элементу по типу атрибута
  function applyTo(el, value) {
    if (value == null) return;

    if (el.hasAttribute('data-edit')) {
      el.textContent = value;

    } else if (el.hasAttribute('data-edit-ml')) {
      // многострочный текст: переносы -> <br>, остальное экранируем
      el.innerHTML = esc(value).replace(/\n/g, '<br>');

    } else if (el.hasAttribute('data-edit-href')) {
      if (value) el.setAttribute('href', value);

    } else if (el.hasAttribute('data-edit-poster')) {
      if (value) el.setAttribute('poster', value);

    } else if (el.hasAttribute('data-edit-src')) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        // если путь отличается от текущего — подставляем и убираем srcset,
        // чтобы браузер не выбрал старую адаптивную версию
        var cur = el.getAttribute('src') || '';
        if (value && value !== cur) {
          el.removeAttribute('srcset');
          el.setAttribute('src', value);
        }
      } else if (tag === 'source') {
        var curs = el.getAttribute('src') || '';
        if (value && value !== curs) {
          el.setAttribute('src', value);
          var v = el.closest('video');
          if (v) { try { v.load(); } catch (e) {} }
        }
      } else {
        // iframe (карта) и прочее
        if (value) el.setAttribute('src', value);
      }
    }
  }

  // Какой data-edit* ключ у элемента
  function keyOf(el) {
    return el.getAttribute('data-edit')
        || el.getAttribute('data-edit-ml')
        || el.getAttribute('data-edit-href')
        || el.getAttribute('data-edit-src')
        || el.getAttribute('data-edit-poster');
  }

  function hydrate(content) {
    if (!content) return;
    var nodes = document.querySelectorAll(
      '[data-edit],[data-edit-ml],[data-edit-href],[data-edit-src],[data-edit-poster]'
    );
    Array.prototype.forEach.call(nodes, function (el) {
      var key = keyOf(el);
      if (key && Object.prototype.hasOwnProperty.call(content, key)) {
        applyTo(el, content[key]);
      }
    });
  }

  function readPreview() {
    try {
      var raw = localStorage.getItem(PREVIEW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // 1) мгновенно применяем локальное превью (если есть) — ещё до сети
  var preview = readPreview();
  function runPreview() { if (preview) hydrate(preview); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runPreview);
  } else {
    runPreview();
  }

  // 2) затем подтягиваем опубликованную версию из репозитория
  fetch('data/content.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (published) {
      if (!published) return;
      function apply() {
        hydrate(published);
        // локальное превью всегда поверх опубликованного (несохранённые правки)
        if (preview) hydrate(preview);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
      } else {
        apply();
      }
    })
    .catch(function () { /* нет сети/файла — остаётся исходный HTML */ });
})();
