/** Reusable modal and confirm dialog */
export const MODAL = `// ---------- reusable modal ----------

var modalPoll = null;
/** Live task modal session — kept while an audit overlay is open so polls
 * don't yank the UI back to the task. */
var taskModalLive = null;

function closeModal() {
  if (modalPoll) { clearInterval(modalPoll); modalPoll = null; }
  taskModalLive = null;
  document.getElementById('modalRoot').innerHTML = '';
}

function syncModalBackDot() {
  var dot = document.getElementById('modalBackDot');
  if (!dot) return;
  var on = !!(taskModalLive && taskModalLive.viewingAudit && taskModalLive.dirty);
  dot.className = 'modal-back-dot' + (on ? ' on' : '');
  var backBtn = dot.parentElement;
  if (backBtn && backBtn.classList.contains('modal-back')) {
    backBtn.title = on ? 'Task updated while you were away' : '';
  }
}

/** Reusable modal: opts = { eyebrow, title, accent, subNode?, back?: { label, go }, body(bodyEl) }
 * Replaces the modal DOM but does NOT touch modalPoll — live re-renders keep
 * their polling; only closeModal() (user action) stops it. */
function showModal(opts) {
  var root = document.getElementById('modalRoot');
  root.innerHTML = '';
  var back = el('div', 'modal-backdrop');
  back.onclick = function (e) { if (e.target === back) closeModal(); };
  var m = el('div', 'modal' + (opts.className ? ' ' + opts.className : ''));
  var accent = el('div', 'modal-accent');
  if (opts.accent) accent.style.background = opts.accent;
  m.appendChild(accent);
  var head = el('div', 'modal-head');
  var hb = el('div', 'modal-head-body');
  var left = el('div');
  if (opts.back && opts.back.go) {
    var backBtn = el('button', 'modal-back');
    backBtn.type = 'button';
    backBtn.appendChild(document.createTextNode('\\u2190 ' + (opts.back.label || 'Back')));
    var backDot = el('span', 'modal-back-dot');
    backDot.id = 'modalBackDot';
    backBtn.appendChild(backDot);
    backBtn.onclick = function () { opts.back.go(); };
    left.appendChild(backBtn);
  }
  if (opts.subNode) { var sub = el('div', 'modal-sub'); sub.appendChild(opts.subNode); left.appendChild(sub); }
  else if (opts.eyebrow) left.appendChild(el('div', 'eyebrow', opts.eyebrow));
  left.appendChild(el('div', 'modal-title', opts.title || ''));
  hb.appendChild(left);
  var x = el('button', 'modal-close', '\\u2715');
  x.onclick = closeModal;
  hb.appendChild(x);
  head.appendChild(hb);
  m.appendChild(head);
  var body = el('div', 'modal-body');
  m.appendChild(body);
  back.appendChild(m);
  root.appendChild(back);
  if (opts.body) opts.body(body);
  syncModalBackDot();
  return { body: body, accentEl: accent, titleEl: left };
}

/** Confirm dialog: opts = { title, message, confirmLabel?, cancelLabel?, onConfirm() }
 * onConfirm may return a Promise; the modal stays open with a busy state until it settles. */
function confirmModal(opts) {
  showModal({
    className: 'confirm',
    eyebrow: 'Confirm',
    title: opts.title || 'Are you sure?',
    accent: '#f87171',
    body: function (body) {
      var msg = el('p', 'confirm-msg');
      msg.textContent = opts.message || '';
      body.appendChild(msg);
      var err = el('div', 'muted');
      err.style.color = '#f87171';
      err.style.marginTop = '0.75rem';
      err.style.fontSize = '0.8rem';
      err.hidden = true;
      body.appendChild(err);
      var actions = el('div', 'confirm-actions');
      var cancel = el('button', 'btn ghost', opts.cancelLabel || 'Cancel');
      cancel.type = 'button';
      cancel.onclick = closeModal;
      var ok = el('button', 'btn danger', opts.confirmLabel || 'Delete');
      ok.type = 'button';
      ok.onclick = function () {
        err.hidden = true;
        err.textContent = '';
        ok.disabled = true;
        cancel.disabled = true;
        ok.textContent = opts.busyLabel || 'Working\\u2026';
        Promise.resolve()
          .then(function () { return opts.onConfirm ? opts.onConfirm() : null; })
          .then(function () { closeModal(); })
          .catch(function (e) {
            ok.disabled = false;
            cancel.disabled = false;
            ok.textContent = opts.confirmLabel || 'Delete';
            err.textContent = (e && e.message) || 'Something went wrong';
            err.hidden = false;
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(ok);
      body.appendChild(actions);
      setTimeout(function () { ok.focus(); }, 0);
    }
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

var STATUS_ACCENT = {
  queued: '#60a5fa', running: '#fbbf24', waiting: '#e879f9', done: '#4ade80', failed: '#f87171'
};

function agentNamed(name) {
  if (!state || !name) return false;
  return state.agents.some(function (a) { return a.name === name; });
}

function metaCell(k, v, agentName) {
  var c = el('div', 'meta-cell');
  c.appendChild(el('div', 'k', k));
  var val = el('div', 'v');
  var label = v || '\\u2014';
  if (agentName && agentNamed(agentName)) {
    var dot = el('span', 'adot');
    dot.style.background = agentColor(agentName);
    val.appendChild(dot);
    val.appendChild(document.createTextNode(label));
  } else {
    val.textContent = label;
  }
  c.appendChild(val);
  return c;
}

function fmtTs(ts) { return ts ? ts.replace('T', ' ').slice(0, 19) : ''; }

`;
