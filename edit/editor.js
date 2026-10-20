/* ============================================================================
   GAME HUB — РЕДАКТОР КОНТЕНТА (editor.js)
   Читает edit/schema.json + data/content.json, строит форму, сохраняет
   изменения и загруженные медиа прямо в GitHub через REST API.
   ========================================================================== */
(function () {
  'use strict';

  /* ----------------------------- КОНФИГ ------------------------------- */
  var DEFAULT_REPO = 'utahmoldovapartnership/game-hub-bender';
  var BRANCH = 'main';
  var CONTENT_PATH = 'data/content.json';
  var LS_TOKEN = 'gh_token';
  var LS_REPO = 'gh_repo';
  var LS_PREVIEW = 'gh_content_preview';

  /* ----------------------------- СОСТОЯНИЕ ---------------------------- */
  var schema = null;          // {sections:[{title,fields:[{key,label,type}]}]}
  var content = {};           // текущие значения (ключ -> значение)
  var published = {};         // опубликованная версия (для «Сбросить»)
  var staged = {};            // key -> {file, path, dataUrl}  новые медиа
  var activeSection = 0;
  var dirty = false;

  /* ----------------------------- УТИЛИТЫ ------------------------------ */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function slug(s){return String(s).toLowerCase().replace(/[^a-z0-9.]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50);}
  // безопасное имя файла: латиница из имени или 'file', расширение сохраняем
  function safeName(name, isVideo){
    name = String(name||'');
    var dot = name.lastIndexOf('.');
    var ext = dot>-1 ? name.slice(dot+1).toLowerCase().replace(/[^a-z0-9]/g,'') : '';
    if (!ext) ext = isVideo ? 'mp4' : 'jpg';
    var stem = slug(dot>-1 ? name.slice(0,dot) : name).replace(/\.+/g,'') || 'file';
    return stem + '.' + ext;
  }

  function getToken(){ try { return localStorage.getItem(LS_TOKEN) || ''; } catch(e){ return ''; } }
  function setToken(t){ try { t ? localStorage.setItem(LS_TOKEN,t) : localStorage.removeItem(LS_TOKEN); } catch(e){} }
  function getRepo(){ try { return localStorage.getItem(LS_REPO) || DEFAULT_REPO; } catch(e){ return DEFAULT_REPO; } }
  function setRepo(r){ try { localStorage.setItem(LS_REPO, r || DEFAULT_REPO); } catch(e){} }

  // base64 для UTF-8 строки
  function b64utf8(str){ return btoa(unescape(encodeURIComponent(str))); }
  // путь медиа относительно корня сайта (редактор лежит в /edit/)
  function siteUrl(path){ return '../' + path; }

  /* --------------------------- ЗАГРУЗКА ДАННЫХ ------------------------ */
  function boot() {
    Promise.all([
      fetch('schema.json?v=' + Date.now()).then(function(r){ return r.json(); }),
      fetch('../' + CONTENT_PATH + '?v=' + Date.now(), { cache:'no-store' })
        .then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; })
    ]).then(function (res) {
      schema = res[0];
      published = res[1] || {};
      // применяем несохранённое локальное превью поверх опубликованного
      var preview = readPreview();
      content = Object.assign({}, published, preview || {});
      // значения по умолчанию из схемы, если ключа нет нигде
      schema.sections.forEach(function(sec){ sec.fields.forEach(function(f){
        if (!(f.key in content)) content[f.key] = '';
      });});
      render();
      refreshConnection();
    }).catch(function (e) {
      $('#content').innerHTML = '<div class="panel is-active"><p class="panel__title">Не удалось загрузить данные</p><p class="panel__sub">'+esc(String(e))+'</p></div>';
    });
  }

  function readPreview(){ try { var r=localStorage.getItem(LS_PREVIEW); return r?JSON.parse(r):null; } catch(e){ return null; } }
  function writePreview(){ try { localStorage.setItem(LS_PREVIEW, JSON.stringify(content)); } catch(e){} }
  function clearPreview(){ try { localStorage.removeItem(LS_PREVIEW); } catch(e){} }

  /* ------------------------------ РЕНДЕР ------------------------------ */
  function render() {
    var nav = $('#nav'); nav.innerHTML = '';
    var tabs = $('#tabstrip'); tabs.innerHTML = '';
    var content_ = $('#content'); content_.innerHTML = '';

    schema.sections.forEach(function (sec, i) {
      // кнопка в сайдбаре
      var b = el('button', 'nav__btn' + (i===activeSection?' is-active':''));
      b.type = 'button';
      b.innerHTML = esc(sec.title) + '<span class="n">' + sec.fields.length + '</span>';
      b.addEventListener('click', function(){ selectSection(i); closeDrawer(); });
      nav.appendChild(b);

      // вкладка в ленте (моб)
      var t = el('button', 'tabstrip__btn' + (i===activeSection?' is-active':''));
      t.type = 'button'; t.textContent = sec.title;
      t.addEventListener('click', function(){ selectSection(i); });
      tabs.appendChild(t);

      // панель
      var panel = el('div', 'panel' + (i===activeSection?' is-active':''));
      panel.appendChild(el('h2','panel__title', esc(sec.title)));
      panel.appendChild(el('p','panel__sub','Измените нужные поля и нажмите «Сохранить».'));
      sec.fields.forEach(function(f){ panel.appendChild(buildField(f)); });
      content_.appendChild(panel);
    });
    updateCrumb();
  }

  function buildField(f){
    var wrap = el('div','field');
    wrap.appendChild(el('label','field__label', esc(f.label)));
    var val = content[f.key] != null ? content[f.key] : '';

    if (f.type === 'image' || f.type === 'video') {
      wrap.appendChild(buildMedia(f, val));
    } else if (f.type === 'textarea') {
      var ta = el('textarea','textarea'); ta.value = val; ta.rows = 4;
      ta.addEventListener('input', function(){ content[f.key]=ta.value; onChange(); });
      wrap.appendChild(ta);
    } else {
      var inp = el('input','input'); inp.type='text'; inp.value = val;
      if (f.type==='url'||f.type==='map') inp.placeholder='https://…';
      if (f.type==='tel') inp.placeholder='tel:+373…';
      inp.addEventListener('input', function(){ content[f.key]=inp.value; onChange(); });
      wrap.appendChild(inp);
      if (f.type==='map') wrap.appendChild(el('p','field__hint','Вставьте значение src из кода &lt;iframe&gt; Google Карт.'));
    }
    return wrap;
  }

  function buildMedia(f, val){
    var isVideo = f.type === 'video';
    var box = el('div','media');
    var prev = el('div','media__preview');
    var cur = staged[f.key] ? staged[f.key].dataUrl : (val ? siteUrl(val) : '');
    renderPreview(prev, cur, isVideo);

    var dz = el('div','dropzone');
    dz.innerHTML = '<b>Перетащите файл сюда</b><br>или<br><label class="dropzone__btn">Выбрать файл<input type="file" accept="'+(isVideo?'video/*':'image/*')+'"></label>'
      + '<div class="media__staged" style="display:none"></div>';
    var input = dz.querySelector('input[type=file]');
    var stalbl = dz.querySelector('.media__staged');

    function handle(file){
      if (!file) return;
      if (isVideo && !/^video\//.test(file.type)) { toast('Нужен видеофайл','err'); return; }
      if (!isVideo && !/^image\//.test(file.type)) { toast('Нужен файл изображения','err'); return; }
      var reader = new FileReader();
      reader.onload = function(){
        var dataUrl = reader.result;
        var folder = isVideo ? 'assets/video/uploads/' : 'assets/img/uploads/';
        var path = folder + Date.now() + '-' + safeName(file.name, isVideo);
        staged[f.key] = { file:file, path:path, dataUrl:dataUrl };
        content[f.key] = path;
        renderPreview(prev, dataUrl, isVideo);
        stalbl.style.display='block';
        stalbl.textContent = '✓ Новый файл готов к публикации';
        onChange();
      };
      reader.readAsDataURL(file);
    }
    input.addEventListener('change', function(){ handle(input.files[0]); });
    ['dragover','dragenter'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.add('is-over'); }); });
    ['dragleave','drop'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.classList.remove('is-over'); }); });
    dz.addEventListener('drop', function(e){ handle(e.dataTransfer.files[0]); });

    box.appendChild(prev); box.appendChild(dz);
    return box;
  }

  function renderPreview(container, src, isVideo){
    container.innerHTML = '';
    if (!src) { container.appendChild(el('span','ph','Нет файла')); return; }
    if (isVideo) {
      var v = document.createElement('video'); v.src = src; v.muted=true; v.controls=true; v.playsInline=true;
      container.appendChild(v);
    } else {
      var img = document.createElement('img'); img.src = src; img.alt='Предпросмотр';
      img.onerror = function(){ container.innerHTML=''; container.appendChild(el('span','ph','Не удалось показать')); };
      container.appendChild(img);
    }
  }

  function selectSection(i){
    activeSection = i;
    var panels = document.querySelectorAll('.panel');
    var navs = document.querySelectorAll('.nav__btn');
    var tabs = document.querySelectorAll('.tabstrip__btn');
    panels.forEach(function(p,idx){ p.classList.toggle('is-active', idx===i); });
    navs.forEach(function(b,idx){ b.classList.toggle('is-active', idx===i); });
    tabs.forEach(function(b,idx){ b.classList.toggle('is-active', idx===i); });
    $('#content').scrollTop = 0;
    updateCrumb();
    // активную вкладку подкрутим к началу ленты
    if (tabs[i]) tabs[i].scrollIntoView({inline:'center',block:'nearest'});
  }
  function updateCrumb(){ $('#crumbSection').textContent = schema ? '— ' + schema.sections[activeSection].title : ''; }

  function onChange(){ dirty = true; writePreview(); }

  /* --------------------------- ПОДКЛЮЧЕНИЕ ---------------------------- */
  function refreshConnection(){
    var dot = $('#statusDot'), title = $('#statusTitle'), sub = $('#statusSub');
    if (getToken()) {
      dot.className='status-dot ok'; title.textContent='Подключено';
      sub.textContent = getRepo();
    } else {
      dot.className='status-dot bad'; title.textContent='Не подключено';
      sub.textContent='Нажмите ⚙️ и вставьте токен';
    }
  }

  // авто-подключение по ссылке #token=… или ?token=…
  function captureTokenFromURL(){
    var h = location.hash || '', q = location.search || '', tok = '';
    var mh = h.match(/token=([^&]+)/); var mq = q.match(/token=([^&]+)/);
    if (mh) tok = decodeURIComponent(mh[1]);
    else if (mq) tok = decodeURIComponent(mq[1]);
    if (tok) {
      setToken(tok);
      // стираем токен из адресной строки
      try { history.replaceState(null, '', location.pathname); } catch(e){}
      toast('Подключено по ссылке','ok');
    }
  }

  /* ------------------------------ GITHUB ------------------------------ */
  function api(path, opts){
    opts = opts || {};
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + getToken(),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }, opts.headers||{});
    return fetch('https://api.github.com' + path, opts);
  }

  function getSha(repo, path){
    return api('/repos/'+repo+'/contents/'+encodeURIComponent(path).replace(/%2F/g,'/')+'?ref='+BRANCH)
      .then(function(r){ if (r.status===404) return null; if(!r.ok) throw new Error('GitHub '+r.status); return r.json(); })
      .then(function(j){ return j ? j.sha : null; });
  }

  function putFile(repo, path, base64, message, sha){
    var body = { message:message, content:base64, branch:BRANCH };
    if (sha) body.sha = sha;
    return api('/repos/'+repo+'/contents/'+encodeURIComponent(path).replace(/%2F/g,'/'), {
      method:'PUT', body: JSON.stringify(body)
    }).then(function(r){
      if (!r.ok) return r.json().then(function(j){ throw new Error((j&&j.message)||('GitHub '+r.status)); });
      return r.json();
    });
  }

  function dataUrlToB64(dataUrl){ var i = dataUrl.indexOf(','); return dataUrl.slice(i+1); }

  function save(){
    var token = getToken();
    if (!token){ openSettings(); toast('Сначала вставьте токен','err'); return; }
    var repo = getRepo();
    var btn = $('#saveBtn'); btn.classList.add('is-loading'); btn.disabled = true;

    var mediaKeys = Object.keys(staged);
    var chain = Promise.resolve();

    // 1) по очереди коммитим новые медиафайлы
    mediaKeys.forEach(function(key){
      chain = chain.then(function(){
        var s = staged[key];
        var b64 = dataUrlToB64(s.dataUrl);
        return putFile(repo, s.path, b64, 'Медиа: '+s.path+' (через редактор)', null);
      });
    });

    // 2) затем коммитим content.json (с актуальным sha)
    chain = chain.then(function(){
      return getSha(repo, CONTENT_PATH);
    }).then(function(sha){
      var json = JSON.stringify(content, null, 2);
      return putFile(repo, CONTENT_PATH, b64utf8(json), 'Контент сайта обновлён через редактор', sha);
    });

    chain.then(function(){
      published = Object.assign({}, content);
      staged = {};
      clearPreview();       // опубликовано — локальное превью больше не нужно
      dirty = false;
      render();             // перерисуем (сбросим «готово к публикации»)
      btn.classList.remove('is-loading'); btn.disabled=false;
      toast('Сохранено и опубликовано','ok');
    }).catch(function(err){
      btn.classList.remove('is-loading'); btn.disabled=false;
      var m = String(err && err.message || err);
      if (/401|Bad credentials/i.test(m)) m = 'Неверный или просроченный токен';
      else if (/403|404/i.test(m)) m = 'Нет доступа к репозиторию (проверьте права токена)';
      toast('Ошибка: '+m, 'err');
    });
  }

  /* --------------------- DOWNLOAD / RESET / UI ------------------------ */
  function download(){
    var blob = new Blob([JSON.stringify(content, null, 2)], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'content.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  function resetChanges(){
    if (!confirm('Сбросить все несохранённые изменения и вернуть опубликованную версию?')) return;
    staged = {}; dirty = false; clearPreview();
    content = Object.assign({}, published);
    schema.sections.forEach(function(sec){ sec.fields.forEach(function(f){ if(!(f.key in content)) content[f.key]=''; });});
    render();
    toast('Изменения сброшены','ok');
  }

  var toastTimer;
  function toast(msg, kind){
    var t = $('#toast'); $('#toastMsg').textContent = msg;
    t.className = 'toast show ' + (kind||'ok');
    t.querySelector('use').setAttribute('href', kind==='err' ? '#e-warn' : '#e-check');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ t.className='toast ' + (kind||'ok'); }, 3200);
  }

  /* --------------------------- МЕНЮ / МОДАЛКА ------------------------- */
  function openDrawer(){ $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); backdropMode='drawer'; }
  function closeDrawer(){ $('#sidebar').classList.remove('open'); if(backdropMode==='drawer') hideBackdrop(); }
  var backdropMode = null;
  function hideBackdrop(){ $('#backdrop').classList.remove('show'); backdropMode=null; }

  function openSettings(){
    $('#tokenInput').value = getToken();
    $('#repoInput').value = getRepo();
    $('#settings').classList.add('show'); $('#backdrop').classList.add('show'); backdropMode='modal';
  }
  function closeSettings(){ $('#settings').classList.remove('show'); if(backdropMode==='modal') hideBackdrop(); }

  /* ------------------------------ СОБЫТИЯ ----------------------------- */
  function wire(){
    $('#burger').addEventListener('click', openDrawer);
    $('#backdrop').addEventListener('click', function(){ closeDrawer(); closeSettings(); });
    $('#gearBtn').addEventListener('click', openSettings);
    $('#saveBtn').addEventListener('click', save);
    $('#resetBtn').addEventListener('click', resetChanges);
    $('#tokenSave').addEventListener('click', function(){
      setToken($('#tokenInput').value.trim());
      setRepo($('#repoInput').value.trim());
      refreshConnection(); closeSettings();
      toast(getToken() ? 'Токен сохранён' : 'Токен удалён', 'ok');
    });
    $('#tokenClear').addEventListener('click', function(){
      setToken(''); $('#tokenInput').value=''; refreshConnection();
    });
    document.addEventListener('keydown', function(e){
      if (e.key==='Escape'){ closeDrawer(); closeSettings(); }
      if ((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); save(); }
    });
    window.addEventListener('beforeunload', function(e){
      if (dirty){ e.preventDefault(); e.returnValue=''; }
    });
    // кнопка «скачать» добавляется в меню действий программно
    var dl = el('button','btn btn--ghost'); dl.id='downloadBtn'; dl.type='button';
    dl.innerHTML = '<svg viewBox="0 0 256 256"><use href="#e-download"/></svg><span class="btn__text">Скачать</span>';
    dl.addEventListener('click', download);
    $('.topbar__actions').insertBefore(dl, $('#saveBtn'));
  }

  /* ------------------------------ СТАРТ ------------------------------- */
  captureTokenFromURL();
  wire();
  boot();
})();
