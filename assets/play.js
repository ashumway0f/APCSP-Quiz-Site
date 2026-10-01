// Loads one quiz, game, or flashcard set from Drive and runs it in a frame.
// For quizzes, it also saves the missed questions to the class review doc.
(function () {
  var CFG = window.APCSP_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var fileId = params.get('id');
  var category = params.get('c') || 'quizzes';
  var isQuiz = category === 'quizzes';
  var STUDENT_KEY = 'apcsp_student';

  var $ = function (id) { return document.getElementById(id); };
  var frame = $('frame'), statusEl = $('status'), loadingEl = $('loading');
  var title = 'Activity';
  var lastPayload = null, sending = false;

  function configured() { return CFG.APPS_SCRIPT_URL && !/PASTE/.test(CFG.APPS_SCRIPT_URL); }
  function getStudent() { try { return localStorage.getItem(STUDENT_KEY) || ''; } catch (e) { return ''; } }
  function setStudent(v) { try { localStorage.setItem(STUDENT_KEY, v); } catch (e) {} }

  function setStatus(cls, msg, retry) {
    statusEl.hidden = false;
    statusEl.className = 'status-bar ' + cls;
    statusEl.textContent = msg + ' ';
    if (retry) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'link'; b.textContent = 'Try again';
      b.addEventListener('click', send);
      statusEl.appendChild(b);
    }
  }

  function showWho() {
    var who = $('who');
    who.innerHTML = '';
    if (!isQuiz) return;
    var s = getStudent();
    if (!s) return;
    who.appendChild(document.createTextNode(s + ' '));
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'link'; b.textContent = 'change';
    b.addEventListener('click', function () { setStudent(''); location.reload(); });
    who.appendChild(b);
  }

  // ---- load the file and put it in the frame ----
  function loadFile() {
    if (!fileId) { loadingEl.textContent = 'No activity selected. Go back and pick one.'; return; }
    if (!configured()) { loadingEl.textContent = 'The site is not connected to the Drive folder yet (see README.md).'; return; }
    loadingEl.hidden = false; loadingEl.textContent = 'Loading…';

    Promise.all([
      fetch(CFG.APPS_SCRIPT_URL + '?action=file&id=' + encodeURIComponent(fileId)).then(function (r) { return r.json(); }),
      isQuiz ? fetch('assets/reporter.js').then(function (r) { return r.text(); }) : Promise.resolve('')
    ]).then(function (res) {
      var out = res[0], reporter = res[1];
      if (!out.ok) throw new Error(out.error || 'Could not load');
      title = out.title || 'Activity';
      $('title').textContent = title;
      document.title = title + ' | AP CSP practice';
      var html = out.html;
      if (isQuiz) {
        var tag = '<script>' + reporter + '<\/script>';
        var i = html.toLowerCase().lastIndexOf('</body>');
        html = i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
      }
      frame.srcdoc = html;
      frame.hidden = false;
      loadingEl.hidden = true;
    }).catch(function () {
      loadingEl.hidden = false;
      loadingEl.textContent = 'Could not load this one. Check your connection and reload the page.';
    });
  }

  // ---- save missed questions ----
  function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }

  window.addEventListener('message', function (e) {
    if (!isQuiz || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.type !== 'apcsp-result' || !Array.isArray(d.missed) || !d.missed.length) return;
    lastPayload = {
      secret: CFG.CLASS_CODE,
      student: clip(getStudent() || 'Anonymous', 60),
      quizId: fileId,
      quizTitle: clip(title, 200),
      timestamp: new Date().toISOString(),
      score: typeof d.score === 'number' ? d.score : null,
      total: typeof d.total === 'number' ? d.total : null,
      missed: d.missed.slice(0, 100).map(function (m) {
        return {
          number: Number(m.number) || 0,
          question: clip(m.question, 1500),
          yourAnswer: clip(m.yourAnswer, 800),
          correctAnswer: clip(m.correctAnswer, 800),
          explanation: clip(m.explanation, 1500)
        };
      })
    };
    send();
  });

  function send() {
    if (sending || !lastPayload) return;
    if (!configured()) { setStatus('', 'The class review doc is not connected yet, so these were not saved. Ask your teacher.'); return; }
    sending = true;
    setStatus('', 'Saving your missed questions to the class review doc…');
    fetch(CFG.APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain keeps this a "simple" request so the browser does not need a CORS preflight
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(lastPayload)
    }).then(function (r) { return r.json(); }).then(function (out) {
      if (!out.ok) throw new Error(out.error || 'Not saved');
      setStatus('is-ok', 'Saved ' + lastPayload.missed.length + ' missed question' + (lastPayload.missed.length === 1 ? '' : 's') + ' to the class review doc.');
    }).catch(function (err) {
      var why = err && err.message ? err.message : '';
      if (/failed to fetch|networkerror|load failed/i.test(why)) why = 'no response from the server';
      setStatus('is-bad', 'Could not save your missed questions' + (why ? ' (' + why + ')' : '') + '. Check your connection, then', true);
    }).then(function () { sending = false; });
  }

  // ---- start ----
  showWho();
  if (isQuiz && CFG.REQUIRE_STUDENT_ID !== false && !getStudent()) {
    loadingEl.hidden = true;
    $('gate').hidden = false;
    $('gateForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = $('sid').value.trim();
      if (!v) { $('gateError').textContent = 'Please enter a name or ID.'; return; }
      setStudent(v);
      $('gate').hidden = true;
      showWho();
      loadFile();
    });
    $('sid').focus();
  } else {
    loadFile();
  }
})();
