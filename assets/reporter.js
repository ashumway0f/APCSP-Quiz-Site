/*
 * Quiz reporter. The site injects this into each quiz that is loaded from Drive.
 * It watches for the "missed questions" review list, reads it, and sends it to the
 * parent page (play.html), which saves it to the class review doc.
 * It does nothing on games and flashcards, because they have no review list.
 */
(function () {
  if (window.__apcspReporter) return;
  window.__apcspReporter = true;

  var sentKey = null;        // the last review list we sent, so one attempt is only sent once
  var reviewedAttempt = false; // true once we have opened a quiz's "Review" screen for this attempt
  var timer = null;

  function visible(el) {
    return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }
  function clean(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }
  function lines(el) {
    return String(el.innerText || el.textContent || '').split('\n').map(clean).filter(Boolean);
  }

  // Turn one .review-item block into {number, question, yourAnswer, correctAnswer, explanation}
  function parseItem(el, fallbackNumber) {
    var L = lines(el);
    var out = { number: fallbackNumber, question: '', yourAnswer: '', correctAnswer: '', explanation: '' };
    var mode = 'pre', expl = [], yourParts = [], corrParts = [], m;
    var qRe = /^(?:Q(?:uestion)?\s*)?(\d+)\s*[.):]?\s*(.*)$/i;

    for (var i = 0; i < L.length; i++) {
      var line = L[i];

      if ((m = line.match(/^(?:your answer|you answered|you chose|your response)\s*:?\s*(.*)$/i))) {
        mode = 'your'; if (m[1]) yourParts.push(m[1]); continue;
      }
      if ((m = line.match(/^(?:correct answer|right answer|correct response)\s*:?\s*(.*)$/i))) {
        mode = 'correct'; if (m[1]) corrParts.push(m[1]); continue;
      }
      if (mode !== 'pre' && mode !== 'q' && (m = line.match(/^(?:explanation|why|reasoning|rationale)\s*:?\s*(.*)$/i))) {
        mode = 'expl'; if (m[1]) expl.push(m[1]); continue;
      }
      if (/^topic\s*:/i.test(line)) continue;

      if (mode === 'pre') {
        if ((m = line.match(qRe))) {
          out.number = parseInt(m[1], 10);
          if (m[2]) { out.question = m[2]; mode = 'q'; } else { mode = 'qnext'; }
        }
        // anything before the question number (a topic label) is skipped
        continue;
      }
      if (mode === 'qnext') { out.question = line; mode = 'q'; continue; }
      if (mode === 'q') { out.question += ' ' + line; continue; }
      if (mode === 'your') { yourParts.push(line); continue; }
      if (mode === 'correct') {
        // the first line after "Correct answer" is the answer; whatever follows is the explanation
        if (!corrParts.length) corrParts.push(line); else { mode = 'expl'; expl.push(line); }
        continue;
      }
      if (mode === 'expl') { expl.push(line); }
    }

    // No question number found at all: use the first line as the question
    if (!out.question && L.length) {
      var first = L.filter(function (x) { return !/^(topic|your answer|correct answer|explanation)/i.test(x); })[0];
      out.question = first || L[0];
    }
    out.yourAnswer = clean(yourParts.join(' '));
    out.correctAnswer = clean(corrParts.join(' '));
    out.explanation = clean(expl.join(' '));
    out.question = clean(out.question);
    return out;
  }

  // Find "12 / 15", "12/15" or "12 out of 15" in the score area
  function readScore() {
    var els = document.querySelectorAll('[id*="score" i], [class*="score" i]');
    for (var i = 0; i < els.length; i++) {
      if (!visible(els[i])) continue;
      var m = clean(els[i].innerText).replace(/\n/g, ' ').match(/(\d+)\s*(?:\/|out of|of)\s*(\d+)/i);
      if (m) return { score: +m[1], total: +m[2] };
    }
    return { score: null, total: null };
  }

  function sendIfItems(knownScore) {
    var els = Array.prototype.filter.call(document.querySelectorAll('.review-item'), visible);
    if (!els.length) return false;
    var missed = els.map(function (el, i) { return parseItem(el, i + 1); })
      .filter(function (x) { return x.question; });
    if (!missed.length) return false;
    var key = JSON.stringify(missed);
    if (key === sentKey) return true;
    sentKey = key;
    var s = (knownScore && knownScore.score !== null) ? knownScore : readScore();
    parent.postMessage({ type: 'apcsp-result', score: s.score, total: s.total, missed: missed }, '*');
    return true;
  }

  function check() {
    if (sendIfItems()) return;
    // Some quizzes only build the review after the student clicks "Review missed questions".
    // Open it for them once, read it, and go back to the results screen.
    var btn = document.getElementById('reviewBtn');
    if (btn && visible(btn) && !reviewedAttempt) {
      reviewedAttempt = true;
      var before = readScore(); // the results screen is hidden once the review opens
      btn.click();
      sendIfItems(before);
      var back = document.getElementById('backToResultsBtn');
      if (back && visible(back)) back.click();
    }
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(check, 450); }

  // A real click on a retake/restart button starts a fresh attempt
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;
    var b = e.target && e.target.closest ? e.target.closest('button, a, [role="button"]') : null;
    if (!b) return;
    var t = ((b.id || '') + ' ' + (b.textContent || '')).toLowerCase();
    if (/retake|restart|retry|try again/.test(t)) { sentKey = null; reviewedAttempt = false; }
  }, true);

  function start() {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden']
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
