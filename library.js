// Builds the home page menu from the live list in your Drive folder.
(function () {
  var CFG = window.APCSP_CONFIG || {};
  var CACHE_KEY = 'apcsp_index_v1';
  var CATS = [
    { id: 'quizzes',    label: 'Quizzes',    empty: 'No quizzes yet.' },
    { id: 'games',      label: 'Games',      empty: 'No games yet.' },
    { id: 'flashcards', label: 'Flashcards', empty: 'No flashcards yet.' }
  ];
  var items = [];
  var current = (location.hash || '').replace('#', '');
  if (!CATS.some(function (c) { return c.id === current; })) current = 'quizzes';

  var tabsEl = document.getElementById('tabs');
  var listEl = document.getElementById('list');

  function configured() { return CFG.APPS_SCRIPT_URL && !/PASTE/.test(CFG.APPS_SCRIPT_URL); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    CATS.forEach(function (c) {
      var n = items.filter(function (i) { return i.category === c.id; }).length;
      var b = el('button', 'tab' + (c.id === current ? ' is-on' : ''), c.label + (items.length ? ' (' + n + ')' : ''));
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', c.id === current ? 'true' : 'false');
      b.addEventListener('click', function () { current = c.id; history.replaceState(null, '', '#' + c.id); render(); });
      tabsEl.appendChild(b);
    });
  }

  function niceDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  }

  function renderList() {
    listEl.innerHTML = '';
    var cat = CATS.filter(function (c) { return c.id === current; })[0];
    var rows = items.filter(function (i) { return i.category === current; });
    if (!rows.length) { listEl.appendChild(el('p', 'loading', cat.empty)); return; }

    // group by unit (items with no unit go last)
    var groups = {};
    rows.forEach(function (r) {
      var k = r.unit === null || r.unit === undefined ? 'zz' : String(1000 + r.unit);
      (groups[k] = groups[k] || []).push(r);
    });
    Object.keys(groups).sort().forEach(function (k) {
      var rowsIn = groups[k].sort(function (a, b) { return a.title.localeCompare(b.title); });
      var h = el('h2', 'unit', k === 'zz' ? 'Other' : 'Unit ' + (Number(k) - 1000));
      listEl.appendChild(h);
      rowsIn.forEach(function (r) {
        var a = el('a', 'quiz-row');
        a.href = 'play.html?c=' + encodeURIComponent(r.category) + '&id=' + encodeURIComponent(r.id);
        var left = el('span');
        left.appendChild(el('span', 't', r.title));
        a.appendChild(left);
        a.appendChild(el('span', 'n', 'Updated ' + niceDate(r.updated)));
        listEl.appendChild(a);
      });
    });
  }

  function render() { renderTabs(); renderList(); }

  function showError(msg) {
    listEl.innerHTML = '';
    var p = el('p', 'status is-bad', msg + ' ');
    var b = el('button', 'link', 'Try again');
    b.type = 'button';
    b.addEventListener('click', load);
    p.appendChild(b);
    listEl.appendChild(p);
  }

  function load() {
    if (!configured()) {
      renderTabs();
      listEl.innerHTML = '';
      listEl.appendChild(el('p', 'status', 'The site is not connected to the Drive folder yet. Open assets/config.js and paste in the Web app URL (see README.md).'));
      return;
    }
    // Show the last list we saw right away, then refresh it.
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) {}
    if (cached && cached.length) { items = cached; render(); } else { renderTabs(); }

    fetch(CFG.APPS_SCRIPT_URL + '?action=list')
      .then(function (r) { return r.json(); })
      .then(function (out) {
        if (!out.ok) throw new Error(out.error || 'Could not load the list');
        items = out.items || [];
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch (e) {}
        render();
      })
      .catch(function () {
        if (!items.length) showError('Could not load the list. Check your connection.');
      });
  }

  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    if (CATS.some(function (c) { return c.id === h; })) { current = h; render(); }
  });

  load();
})();
