/** Shared globals, helpers, chat/plan composer utilities */
export const STATE_AND_CHAT = `var view = 'home';
var companySlug = null;
var lastDataSigByCompany = {};
var lastDataListByCompany = {};
var pendingDataRescan = {};
var freshDataKeysByCompany = {}; // slug -> { 'db': true, 'db::table': true }

var CO_TOOL_ORDER = ['grant', 'data', 'approvals', 'checkins', 'schedule', 'connectors'];
var CO_TOOL_DEFS = {
  grant: { label: '\\uff0b Grant', run: 'grantTokens()' },
  data: { label: 'Data', run: 'openDbBrowser()' },
  approvals: { label: 'Approvals', run: 'openApprovals()' },
  checkins: { label: 'Check-ins', run: 'openCheckins()' },
  schedule: { label: 'Schedule', run: 'openSchedule()' },
  connectors: { label: 'Connectors', run: 'openConnectors()' }
};
var CO_PINNED_KEY = 'aiCompanyOsCoPinned';
var DEFAULT_CO_PINNED = ['grant'];
var elapsedTickTimer = null;

function formatElapsed(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  return m + ':' + String(sec).padStart(2, '0');
}

function taskElapsedMs(t) {
  if (!t) return 0;
  var iso = t.startedAt || (t.status === 'running' ? t.updatedAt : null);
  if (!iso) return 0;
  var start = Date.parse(iso);
  if (!isFinite(start)) return 0;
  if (t.status === 'running') return Date.now() - start;
  var end = Date.parse(t.updatedAt || iso);
  return (isFinite(end) ? end : Date.now()) - start;
}

function ensureElapsedTicker() {
  if (elapsedTickTimer) return;
  elapsedTickTimer = setInterval(function () {
    var nodes = document.querySelectorAll('[data-elapsed-since]');
    if (!nodes.length) return;
    var now = Date.now();
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var since = Date.parse(n.getAttribute('data-elapsed-since') || '');
      if (!isFinite(since)) continue;
      n.textContent = formatElapsed(now - since);
    }
  }, 1000);
}

function elapsedBadge(t, cls) {
  if (!t || (t.status !== 'running' && !t.startedAt)) return null;
  var iso = t.startedAt || t.updatedAt;
  if (!iso) return null;
  ensureElapsedTicker();
  var span = el('span', cls || 'task-elapsed', formatElapsed(taskElapsedMs(t)));
  if (t.status === 'running') span.setAttribute('data-elapsed-since', iso);
  span.title = t.status === 'running' ? 'Running for' : 'Ran for';
  return span;
}

function loadCoPinned() {
  var raw = null;
  try { raw = localStorage.getItem(CO_PINNED_KEY); } catch (e) {}
  if (raw == null) return DEFAULT_CO_PINNED.slice();
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CO_PINNED.slice();
    return CO_TOOL_ORDER.filter(function (id) { return parsed.indexOf(id) >= 0; });
  } catch (e) {
    return DEFAULT_CO_PINNED.slice();
  }
}

function saveCoPinned(ids) {
  try { localStorage.setItem(CO_PINNED_KEY, JSON.stringify(ids)); } catch (e) {}
}

function coToolButtons(id) {
  return Array.prototype.slice.call(document.querySelectorAll('[data-co-tool="' + id + '"]'));
}

function markDataFresh(on) {
  coToolButtons('data').forEach(function (btn) {
    if (on) {
      btn.classList.add('data-fresh');
      btn.title = 'New data arrived \\u2014 open to inspect';
    } else {
      btn.classList.remove('data-fresh');
      btn.title = '';
    }
  });
}

function syncCoToolPinButtons() {
  var pinned = loadCoPinned();
  document.querySelectorAll('.co-tools-row[data-tool]').forEach(function (row) {
    var id = row.getAttribute('data-tool');
    var pin = row.querySelector('.co-tools-pin');
    if (!pin || !id) return;
    var on = pinned.indexOf(id) >= 0;
    pin.setAttribute('aria-pressed', on ? 'true' : 'false');
    var label = (CO_TOOL_DEFS[id] && CO_TOOL_DEFS[id].label) || id;
    pin.title = on ? ('Unpin ' + label.replace(/^\\uff0b\\s*/, '')) : ('Pin ' + label.replace(/^\\uff0b\\s*/, ''));
    pin.setAttribute('aria-label', pin.title);
  });
}

function renderCoPinnedTools() {
  var host = document.getElementById('coPinnedTools');
  if (!host) return;
  var prevFresh = !!document.querySelector('[data-co-tool="data"].data-fresh');
  var apprText = null;
  var apprColor = '';
  var apprBorder = '';
  var prevAppr = document.querySelector('[data-co-tool="approvals"]');
  if (prevAppr) {
    apprText = prevAppr.textContent;
    apprColor = prevAppr.style.color || '';
    apprBorder = prevAppr.style.borderColor || '';
  }
  host.innerHTML = '';
  loadCoPinned().forEach(function (id) {
    var def = CO_TOOL_DEFS[id];
    if (!def) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grant-btn';
    btn.setAttribute('data-co-tool', id);
    btn.setAttribute('onclick', def.run);
    btn.textContent = def.label;
    if (id === 'approvals' && apprText) {
      btn.textContent = apprText;
      btn.style.color = apprColor;
      btn.style.borderColor = apprBorder;
    }
    if (id === 'data' && prevFresh) {
      btn.classList.add('data-fresh');
      btn.title = 'New data arrived \\u2014 open to inspect';
    }
    host.appendChild(btn);
  });
  syncCoToolPinButtons();
}

function toggleCoToolPin(id, e) {
  if (e) e.stopPropagation();
  if (!CO_TOOL_DEFS[id]) return;
  var pinned = loadCoPinned();
  var i = pinned.indexOf(id);
  if (i >= 0) pinned.splice(i, 1);
  else pinned.push(id);
  pinned = CO_TOOL_ORDER.filter(function (k) { return pinned.indexOf(k) >= 0; });
  saveCoPinned(pinned);
  renderCoPinnedTools();
}

function toggleCoTools(e) {
  if (e) e.stopPropagation();
  var menu = document.getElementById('coToolsMenu');
  var toggle = document.getElementById('coToolsToggle');
  if (!menu || !toggle) return;
  var open = menu.hasAttribute('hidden');
  if (open) menu.removeAttribute('hidden');
  else menu.setAttribute('hidden', '');
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

document.addEventListener('click', function (e) {
  var menu = document.getElementById('coToolsMenu');
  var toggle = document.getElementById('coToolsToggle');
  if (!menu || !toggle || menu.hasAttribute('hidden')) return;
  if (menu.contains(e.target) || toggle.contains(e.target)) return;
  menu.setAttribute('hidden', '');
  toggle.setAttribute('aria-expanded', 'false');
});

function seedDataListBaseline(slug) {
  if (!slug || lastDataListByCompany[slug]) return;
  fetch('/api/db/list?company=' + encodeURIComponent(slug))
    .then(function (r) { return r.json(); })
    .then(function (list) {
      if (!Array.isArray(list)) return;
      if (!lastDataListByCompany[slug]) lastDataListByCompany[slug] = list;
    })
    .catch(function () {});
}

function noteDataSig(sig) {
  if (sig == null || !companySlug) return;
  var prev = lastDataSigByCompany[companySlug];
  if (prev != null && prev !== '' && sig !== prev) {
    markDataFresh(true);
    pendingDataRescan[companySlug] = true;
  }
  lastDataSigByCompany[companySlug] = sig;
  if (prev == null || prev === '') seedDataListBaseline(companySlug);
}

function freshDataKey(db, table) {
  return table ? (db + '::' + table) : db;
}

function isDataFreshKey(db, table) {
  var map = freshDataKeysByCompany[companySlug];
  if (!map) return false;
  if (table) return !!map[freshDataKey(db, table)];
  if (map[db]) return true;
  var prefix = db + '::';
  return Object.keys(map).some(function (k) { return k.indexOf(prefix) === 0; });
}

function clearFreshDataKey(db, table) {
  var map = freshDataKeysByCompany[companySlug];
  if (!map) return;
  if (table) delete map[freshDataKey(db, table)];
  else {
    delete map[db];
    var prefix = db + '::';
    Object.keys(map).forEach(function (k) {
      if (k.indexOf(prefix) === 0) delete map[k];
    });
  }
}

function diffDataLists(prev, next) {
  var fresh = {};
  var prevByDb = {};
  (prev || []).forEach(function (d) { prevByDb[d.db] = d; });
  (next || []).forEach(function (d) {
    var old = prevByDb[d.db];
    if (!old) {
      fresh[d.db] = true;
      (d.tables || []).forEach(function (t) { fresh[freshDataKey(d.db, t.name)] = true; });
      return;
    }
    var fileChanged = old.bytes !== d.bytes;
    var oldTables = {};
    (old.tables || []).forEach(function (t) { oldTables[t.name] = t; });
    (d.tables || []).forEach(function (t) {
      var ot = oldTables[t.name];
      if (!ot || ot.rows !== t.rows || fileChanged) {
        fresh[freshDataKey(d.db, t.name)] = true;
        fresh[d.db] = true;
      }
    });
    (old.tables || []).forEach(function (t) {
      if (!(d.tables || []).some(function (x) { return x.name === t.name; })) {
        fresh[d.db] = true;
      }
    });
  });
  return fresh;
}
var state = null;
var selectedAgent = null;
var agentSidebarOpen = true;
var selectedTab = 'overview';
var leftTab = 'queue';
var planHistory = [];
var planDraft = null;
var planSlug = null;
var chatHistories = {};
var chatLoaded = {};
var chiefSending = false;
var planSending = false;
var chiefStream = null; // { status, reasoning, reply }
var planPhaseIndex = 0;
var planPhaseTimer = null;
var PLAN_ACTIVITY_PHASES = ['Composing reply\\u2026', 'Building plan\\u2026', 'Structuring agents\\u2026'];
var skills = [];
var selectedSkill = null;
var skillFilePath = 'SKILL.md';
var skillDirty = false;
var cfg = { providers: [], roles: {}, models: {}, defaultProvider: '' };
var liveTools = localStorage.getItem('liveTools') !== '0';
var RANK_ACCENT = { chief: '#eab308', manager: '#d946ef', worker: '#3b82f6' };
// every agent gets its own color: chief gold, managers purple tones, workers the rest
var PALETTE = ['#3b82f6', '#22c55e', '#06b6d4', '#f97316', '#a78bfa', '#ef4444', '#facc15', '#4ade80', '#e879f9', '#60a5fa'];

function agentColors(agents) {
  var map = {};
  var wi = 0;
  (agents || []).forEach(function (a) {
    if (a.rank === 'chief') map[a.name] = '#eab308';
    else if (a.rank === 'manager') map[a.name] = '#d946ef';
    else { map[a.name] = PALETTE[wi % PALETTE.length]; wi++; }
  });
  return map;
}

function agentColor(name) {
  if (!state) return RANK_ACCENT.worker;
  if (!state._colors) state._colors = agentColors(state.agents);
  return state._colors[name] || RANK_ACCENT.worker;
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function chatSendIconSvg() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 13V3M8 3L4 7M8 3L12 7');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.75');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function chatSpinnerSvg() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'setup-chat-send-spinner');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '6');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('opacity', '0.25');
  var arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arc.setAttribute('d', 'M14 8a6 6 0 0 0-6-6');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', '2');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('fill', 'none');
  svg.appendChild(circle);
  svg.appendChild(arc);
  return svg;
}

function chatMicIconSvg() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z');
  path.setAttribute('fill', 'currentColor');
  var path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('d', 'M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8');
  path2.setAttribute('stroke', 'currentColor');
  path2.setAttribute('stroke-width', '2');
  path2.setAttribute('stroke-linecap', 'round');
  path2.setAttribute('stroke-linejoin', 'round');
  path2.setAttribute('fill', 'none');
  svg.appendChild(path);
  svg.appendChild(path2);
  return svg;
}

/** Live voice capture for chief/plan composers (null when idle). */
var voiceSession = null; // { kind, recorder, chunks, stream, phase: 'recording'|'transcribing' }

function resizeChatTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

/** Composer action button: mic (empty) | send (has text) | spinner (sending/recording).
 *  Always reads live chiefSending/planSending — never a stale build-time flag. */
function syncChatActionBtn(btn, opts) {
  if (!btn) return;
  opts = opts || {};
  var kind = opts.kind || 'chief';
  var sending = kind === 'plan' ? planSending : chiefSending;
  var hasContent = !!opts.hasContent;
  var voice = voiceSession && voiceSession.kind === kind ? voiceSession : null;
  var mode = 'mic';
  if (sending || (voice && voice.phase === 'transcribing')) mode = 'spinner';
  else if (voice && voice.phase === 'recording') mode = 'recording';
  else if (hasContent) mode = 'send';

  btn.disabled = mode === 'spinner';
  btn.dataset.mode = mode;
  btn.className = 'setup-chat-send'
    + (mode === 'send' || mode === 'mic' || mode === 'recording' ? ' setup-chat-send-ready' : '')
    + (mode === 'mic' || mode === 'recording' ? ' setup-chat-send-mic' : '')
    + (mode === 'recording' ? ' setup-chat-send-recording' : '');
  if (mode === 'spinner') btn.setAttribute('aria-label', sending ? 'Sending' : 'Transcribing');
  else if (mode === 'recording') btn.setAttribute('aria-label', 'Stop recording');
  else if (mode === 'mic') btn.setAttribute('aria-label', 'Dictate with microphone');
  else btn.setAttribute('aria-label', 'Send message');
  while (btn.firstChild) btn.removeChild(btn.firstChild);
  if (mode === 'spinner') btn.appendChild(chatSpinnerSvg());
  else if (mode === 'mic' || mode === 'recording') btn.appendChild(chatMicIconSvg());
  else btn.appendChild(chatSendIconSvg());
  return mode;
}

/** @deprecated use syncChatActionBtn — kept for call sites during transition */
function syncChatSendBtn(btn, canSend, sending) {
  var kind = (btn && btn.id === 'planSend') ? 'plan' : 'chief';
  syncChatActionBtn(btn, { kind: kind, hasContent: !!canSend && !sending });
}

function syncChatComposerHint(hintEl, sending, thinkingLabel) {
  if (!hintEl) return;
  if (voiceSession && voiceSession.phase === 'recording') {
    hintEl.textContent = 'Recording\\u2026 tap mic to stop';
    return;
  }
  if (voiceSession && voiceSession.phase === 'transcribing') {
    hintEl.textContent = 'Transcribing\\u2026';
    return;
  }
  hintEl.textContent = sending ? (thinkingLabel || 'Working\\u2026') : 'Enter to send \\u00b7 Shift+Enter for newline \\u00b7 mic when empty';
}

function composerHasContent(kind) {
  if (kind === 'plan') {
    var pta = document.getElementById('planInput');
    return !!(pta && pta.value.trim()) || (typeof planPendingAttachments !== 'undefined' && planPendingAttachments.length > 0);
  }
  var cta = document.getElementById('chiefInput');
  return !!(cta && cta.value.trim()) || (typeof chiefPendingAttachments !== 'undefined' && chiefPendingAttachments.length > 0);
}

function refreshComposerAction(kind) {
  var btn = document.getElementById(kind === 'plan' ? 'planSend' : 'chiefSend');
  var hint = document.getElementById(kind === 'plan' ? 'planChatHint' : 'chiefChatHint');
  var sending = kind === 'plan' ? planSending : chiefSending;
  var mode = syncChatActionBtn(btn, { kind: kind, hasContent: composerHasContent(kind) });
  if (kind === 'plan') {
    if (sending) syncChatComposerHint(hint, true, getPlanThinkingLabel());
    else if (voiceSession && voiceSession.kind === 'plan') syncChatComposerHint(hint, false);
    else if (hint && !sending) hint.textContent = 'Enter to send \\u00b7 drop plan sections for context \\u00b7 mic when empty';
  } else {
    syncChatComposerHint(hint, sending, (chiefStream && chiefStream.status) || 'Working\\u2026');
  }
  return mode;
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      var s = String(reader.result || '');
      var i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function stopVoiceTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
}

function cancelVoiceSession() {
  if (!voiceSession) return;
  var s = voiceSession;
  voiceSession = null;
  try { if (s.recorder && s.recorder.state !== 'inactive') s.recorder.stop(); } catch (e) {}
  stopVoiceTracks(s.stream);
  refreshComposerAction(s.kind);
}

function finishVoiceAndTranscribe(kind, blob, mime) {
  voiceSession = { kind: kind, phase: 'transcribing' };
  refreshComposerAction(kind);
  blobToBase64(blob).then(function (b64) {
    return fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audioBase64: b64,
        mimeType: mime || blob.type || 'audio/webm',
        filename: 'dictate.' + ((mime || blob.type || '').indexOf('mp4') >= 0 ? 'mp4' : 'webm')
      })
    }).then(function (r) { return r.json(); });
  }).then(function (d) {
    voiceSession = null;
    if (d && d.error) {
      showToast(d.error, 'err');
      refreshComposerAction(kind);
      return;
    }
    var text = (d && d.text ? String(d.text) : '').trim();
    var ta = document.getElementById(kind === 'plan' ? 'planInput' : 'chiefInput');
    if (ta && text) {
      ta.value = ta.value ? (ta.value.replace(/\\s+$/, '') + ' ' + text) : text;
      resizeChatTextarea(ta);
      ta.focus();
    } else if (!text) {
      showToast('No speech detected', 'err');
    }
    refreshComposerAction(kind);
  }).catch(function (e) {
    voiceSession = null;
    showToast('Transcription failed: ' + e, 'err');
    refreshComposerAction(kind);
  });
}

function toggleVoiceDictate(kind) {
  if ((kind === 'plan' ? planSending : chiefSending)) return;
  if (voiceSession && voiceSession.kind === kind && voiceSession.phase === 'recording') {
    var rec = voiceSession.recorder;
    try { rec.stop(); } catch (e) {}
    return;
  }
  if (voiceSession) cancelVoiceSession();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Microphone not available in this browser', 'err');
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    var mime = '';
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4')) mime = 'audio/mp4';
    }
    var recorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch (e) {
      stopVoiceTracks(stream);
      showToast('Could not start recorder', 'err');
      return;
    }
    var chunks = [];
    recorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) chunks.push(ev.data);
    };
    recorder.onstop = function () {
      stopVoiceTracks(stream);
      var type = recorder.mimeType || mime || 'audio/webm';
      var blob = new Blob(chunks, { type: type });
      if (!blob.size) {
        voiceSession = null;
        showToast('Empty recording', 'err');
        refreshComposerAction(kind);
        return;
      }
      finishVoiceAndTranscribe(kind, blob, type);
    };
    voiceSession = { kind: kind, recorder: recorder, chunks: chunks, stream: stream, phase: 'recording' };
    recorder.start();
    refreshComposerAction(kind);
  }).catch(function () {
    showToast('Microphone permission denied', 'err');
  });
}

function buildChatThinkingDots() {
  var wrap = el('span', 'setup-chat-thinking-dots');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  return wrap;
}

function appendChatThinking(log, label, id) {
  var msg = el('div', 'setup-chat-msg setup-chat-msg-assistant setup-chat-msg-thinking');
  if (id) msg.id = id;
  var body = el('div', 'setup-chat-msg-body');
  var row = el('div', 'setup-chat-thinking-row');
  row.setAttribute('aria-label', label || 'Assistant is working');
  row.appendChild(buildChatThinkingDots());
  var lbl = el('span', 'setup-chat-thinking-label thinking-label-text', label || '');
  lbl.setAttribute('aria-live', 'polite');
  row.appendChild(lbl);
  body.appendChild(row);
  msg.appendChild(body);
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
  return msg;
}

function appendSetupChatMessage(log, role, content, reasoning, created) {
  var d = el('div', 'setup-chat-msg setup-chat-msg-' + role);
  var body = el('div', 'setup-chat-msg-body');
  if (role === 'assistant' && reasoning) {
    var details = el('details', 'setup-chat-reasoning');
    details.appendChild(el('summary', null, 'Reasoning'));
    details.appendChild(document.createTextNode(reasoning));
    body.appendChild(details);
  }
  fillChatMessageBody(body, content, created);
  d.appendChild(body);
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

/** Strip legacy "➕ queued TASK-…" lines when we render real task cards. */
function stripQueuedTaskLines(content) {
  return String(content || '')
    .replace(/(?:^|\\n)(?:\\u2795|➕)\\s*queued\\s+TASK-\\d+[^\\n]*/g, '')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}

/** Recover created-task refs from legacy assistant text if needed. */
function createdFromMessage(m) {
  if (m && Array.isArray(m.created) && m.created.length) return m.created;
  var content = m && m.content ? m.content : '';
  var out = [];
  var re = /(?:\\u2795|➕)\\s*queued\\s+(TASK-\\d+)\\s*[\\u201c"]([^\\u201d"]*)[\\u201d"]/g;
  var match;
  while ((match = re.exec(content))) {
    out.push({ id: match[1], title: match[2] || match[1] });
  }
  return out.length ? out : null;
}

function resolveChatTask(ref) {
  var live = state && state.tasks ? state.tasks.find(function (t) { return t.id === ref.id; }) : null;
  if (live) return live;
  var chief = null;
  try { chief = chiefOf(); } catch (e) {}
  return {
    id: ref.id,
    title: ref.title || ref.id,
    status: 'queued',
    assignee: chief ? chief.name : '',
    priority: 'normal',
    parent: null
  };
}

function appendChatCreatedTasks(host, created) {
  if (!created || !created.length) return;
  var wrap = el('div', 'setup-chat-created');
  created.forEach(function (ref) {
    wrap.appendChild(taskCard(resolveChatTask(ref)));
  });
  host.appendChild(wrap);
}

function fillChatMessageBody(body, content, created) {
  var text = created && created.length ? stripQueuedTaskLines(content) : content;
  if (text) appendChatTextWithPaths(body, text);
  appendChatCreatedTasks(body, created);
}

/** Match company file paths; optional surrounding markdown bold is consumed so links stay clean.
 *  Use a regex literal — new RegExp(string) loses star escapes once this block is embedded
 *  in the page script template (becomes Nothing to repeat). */
function chatPathRegex() {
  return /(?:\\*\\*)?((?:data|agents|tasks|skills)\\/[A-Za-z0-9._-]+(?:\\/[A-Za-z0-9._-]+)*\\.[A-Za-z0-9]+)(?:\\*\\*)?/g;
}

function companyFileDownloadUrl(rel, company) {
  return '/api/file?company=' + encodeURIComponent(company || companySlug) +
    '&path=' + encodeURIComponent(rel) + '&download=1';
}

function isPreviewableCompanyPath(rel) {
  return /\\.(md|markdown|csv|tsv|txt|sql|json|jsonl|ya?ml|log|html?|xml)$/i.test(rel);
}

function makeChatPathLink(rel) {
  var a = el('a', 'chat-path', rel);
  a.href = companyFileDownloadUrl(rel);
  a.title = isPreviewableCompanyPath(rel)
    ? 'Open preview · Shift/Ctrl-click to download'
    : 'Download file';
  a.onclick = function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || !isPreviewableCompanyPath(rel)) {
      return;
    }
    ev.preventDefault();
    if (typeof openCompanyFileModal === 'function') {
      openCompanyFileModal(rel, { eyebrow: 'Company file', accent: '#60a5fa' });
    } else {
      window.location.href = companyFileDownloadUrl(rel);
    }
  };
  return a;
}

function appendChatTextWithPaths(host, text) {
  var s = String(text || '');
  var re = chatPathRegex();
  var last = 0;
  var m;
  while ((m = re.exec(s))) {
    if (m.index > last) host.appendChild(document.createTextNode(s.slice(last, m.index)));
    host.appendChild(makeChatPathLink(m[1]));
    last = m.index + m[0].length;
  }
  if (last < s.length) host.appendChild(document.createTextNode(s.slice(last)));
}

/** Upgrade already-mounted chat bubbles (poll refresh skips full chat re-render). */
function ensureChatPathsLinked() {
  var log = document.getElementById('chiefChatLog');
  if (!log || !companySlug) return;
  var bodies = log.querySelectorAll('.setup-chat-msg-body');
  for (var i = 0; i < bodies.length; i++) {
    var body = bodies[i];
    if (body.querySelector('a.chat-path')) continue;
    if (body.querySelector('.setup-chat-thinking-row, .setup-chat-stream-body, .setup-chat-stream-caret')) continue;
    var details = body.querySelector('details.setup-chat-reasoning');
    var created = body.querySelector('.setup-chat-created');
    var text = '';
    for (var n = body.firstChild; n; n = n.nextSibling) {
      if (n === details || n === created) continue;
      if (n.nodeType === 3) text += n.nodeValue;
      else if (n.nodeType === 1) text += n.textContent || '';
    }
    if (!text || text.indexOf('data/') < 0 && text.indexOf('agents/') < 0 &&
        text.indexOf('tasks/') < 0 && text.indexOf('skills/') < 0) continue;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (details) body.appendChild(details);
    appendChatTextWithPaths(body, text);
    if (created) body.appendChild(created);
  }
}

function appendChiefStreamMessage(log) {
  var d = el('div', 'setup-chat-msg setup-chat-msg-assistant');
  d.id = 'chiefStreamMsg';
  var body = el('div', 'setup-chat-msg-body');
  var details = el('details', 'setup-chat-reasoning');
  details.id = 'chiefStreamReasoning';
  details.open = true;
  details.style.display = 'none';
  details.appendChild(el('summary', null, 'Reasoning'));
  var reasonText = el('div');
  reasonText.id = 'chiefStreamReasoningText';
  details.appendChild(reasonText);
  body.appendChild(details);
  var status = el('div', 'setup-chat-thinking-row');
  status.id = 'chiefStreamStatus';
  status.appendChild(buildChatThinkingDots());
  var statusLabel = el('span', 'setup-chat-thinking-label', (chiefStream && chiefStream.status) || 'Composing reply\\u2026');
  statusLabel.id = 'chiefStreamStatusLabel';
  status.appendChild(statusLabel);
  body.appendChild(status);
  var reply = el('div', 'setup-chat-stream-body');
  reply.id = 'chiefStreamReply';
  body.appendChild(reply);
  var caret = el('span', 'setup-chat-stream-caret');
  caret.id = 'chiefStreamCaret';
  body.appendChild(caret);
  d.appendChild(body);
  log.appendChild(d);
  syncChiefStreamDom();
  log.scrollTop = log.scrollHeight;
  return d;
}

function syncChiefStreamDom() {
  if (!chiefStream) return;
  var reasonWrap = document.getElementById('chiefStreamReasoning');
  var reasonText = document.getElementById('chiefStreamReasoningText');
  var status = document.getElementById('chiefStreamStatus');
  var statusLabel = document.getElementById('chiefStreamStatusLabel');
  var reply = document.getElementById('chiefStreamReply');
  var caret = document.getElementById('chiefStreamCaret');
  var hint = document.getElementById('chiefChatHint');
  if (reasonWrap && reasonText) {
    if (chiefStream.reasoning) {
      reasonWrap.style.display = '';
      reasonText.textContent = chiefStream.reasoning;
    } else {
      reasonWrap.style.display = 'none';
    }
  }
  if (status) {
    status.style.display = chiefStream.reply ? 'none' : '';
  }
  if (statusLabel && chiefStream.status) statusLabel.textContent = chiefStream.status;
  if (reply) reply.textContent = chiefStream.reply || '';
  if (caret) caret.style.display = chiefSending ? '' : 'none';
  if (hint) syncChatComposerHint(hint, true, chiefStream.status || 'Working\\u2026');
  var log = document.getElementById('chiefChatLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function setChatMessageContent(msgEl, content) {
  if (!msgEl) return;
  msgEl.className = 'setup-chat-msg setup-chat-msg-assistant';
  msgEl.innerHTML = '';
  var body = el('div', 'setup-chat-msg-body');
  fillChatMessageBody(body, content, null);
  msgEl.appendChild(body);
  var log = msgEl.parentElement;
  if (log) log.scrollTop = log.scrollHeight;
}

function getPlanThinkingLabel() {
  return PLAN_ACTIVITY_PHASES[planPhaseIndex % PLAN_ACTIVITY_PHASES.length];
}

function updatePlanThinkingUI() {
  var label = getPlanThinkingLabel();
  syncChatComposerHint(document.getElementById('planChatHint'), true, label);
  var thinking = document.querySelector('#planThinking .thinking-label-text');
  if (thinking) thinking.textContent = label;
}

function startPlanPhaseTimer() {
  if (planPhaseTimer) clearInterval(planPhaseTimer);
  planPhaseIndex = 0;
  updatePlanThinkingUI();
  planPhaseTimer = setInterval(function () {
    planPhaseIndex = (planPhaseIndex + 1) % PLAN_ACTIVITY_PHASES.length;
    updatePlanThinkingUI();
  }, 2800);
}

function stopPlanPhaseTimer() {
  if (planPhaseTimer) { clearInterval(planPhaseTimer); planPhaseTimer = null; }
  planPhaseIndex = 0;
}

function buildChatComposer(opts) {
  var kind = opts.kind || (opts.sendId === 'planSend' ? 'plan' : 'chief');
  var dock = el('div', 'setup-chat-dock');
  var form = el('form', 'setup-chat-composer');
  form.onsubmit = function (e) {
    e.preventDefault();
    var mode = refreshComposerAction(kind);
    if (mode === 'mic' || mode === 'recording') toggleVoiceDictate(kind);
    else if (mode === 'send') opts.onSend();
  };

  var chips = el('div', 'chat-attach-chips');
  chips.id = opts.attachChipsId || '';
  chips.hidden = true;
  form.appendChild(chips);

  var ta = el('textarea');
  ta.id = opts.textareaId;
  ta.placeholder = opts.placeholder;
  ta.rows = 1;
  ta.setAttribute('aria-label', 'Message');
  ta.disabled = !!(kind === 'plan' ? planSending : chiefSending);
  function refreshSend() {
    refreshComposerAction(kind);
  }
  ta.oninput = function () {
    resizeChatTextarea(ta);
    refreshSend();
  };
  ta.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var mode = refreshComposerAction(kind);
      if (mode === 'send') opts.onSend();
    }
  };

  var bar = el('div', 'setup-chat-composer-bar');
  var hint = el('span', 'setup-chat-composer-hint');
  hint.id = opts.hintId;

  var actions = el('div', 'setup-chat-composer-actions');

  // optional 📎 attach (overpass-turbo JSON/GeoJSON/CSV or any data file)
  if (opts.onAttach) {
    var fileIn = el('input');
    fileIn.type = 'file';
    fileIn.accept = '.json,.geojson,.csv,.tsv,.txt';
    fileIn.style.display = 'none';
    fileIn.onchange = function () {
      if (fileIn.files && fileIn.files[0]) opts.onAttach(fileIn.files[0]);
      fileIn.value = '';
    };
    var attach = el('button', 'setup-chat-attach', '\\ud83d\\udcce');
    attach.type = 'button';
    attach.title = 'Attach data for your next message (overpass-turbo JSON/GeoJSON/CSV)';
    attach.onclick = function () { fileIn.click(); };
    actions.appendChild(fileIn);
    actions.appendChild(attach);
  }

  var sendBtn = el('button');
  sendBtn.type = 'submit';
  sendBtn.id = opts.sendId;
  opts.sendBtnRef = sendBtn;

  actions.appendChild(sendBtn);
  bar.appendChild(hint);
  bar.appendChild(actions);
  form.appendChild(ta);
  form.appendChild(bar);
  dock.appendChild(form);

  refreshSend();
  syncChatComposerHint(hint, !!(kind === 'plan' ? planSending : chiefSending), opts.thinkingLabel);
  resizeChatTextarea(ta);
  if (opts.renderAttachments) opts.renderAttachments();

  return { dock: dock, textarea: ta, sendBtn: sendBtn, hint: hint, refreshSend: refreshSend };
}

function syncPlanComposer() {
  var ta = document.getElementById('planInput');
  var btn = document.getElementById('planSend');
  var hint = document.getElementById('planChatHint');
  if (!ta || !btn || !hint) return;
  ta.disabled = planSending;
  refreshComposerAction('plan');
}

function insertPlanContext(text) {
  var ta = document.getElementById('planInput');
  if (!ta || planSending) return;
  var chunk = String(text || '').trim();
  if (!chunk) return;
  var cur = ta.value;
  var start = ta.selectionStart != null ? ta.selectionStart : cur.length;
  var end = ta.selectionEnd != null ? ta.selectionEnd : cur.length;
  var before = cur.slice(0, start);
  var after = cur.slice(end);
  var padBefore = before && !/\\n\\s*$/.test(before) ? '\\n\\n' : (before && !/\\n$/.test(before) ? '\\n' : '');
  var padAfter = after && !/^\\n/.test(after) ? '\\n\\n' : '';
  var next = before + padBefore + chunk + padAfter + after;
  ta.value = next;
  var caret = (before + padBefore + chunk).length;
  ta.focus();
  try { ta.setSelectionRange(caret, caret); } catch (e) {}
  resizeChatTextarea(ta);
  syncPlanComposer();
}

function bindPlanChatDrop(target) {
  if (!target || target.dataset.dropReady) return;
  target.dataset.dropReady = '1';
  target.addEventListener('dragover', function (e) {
    if (!e.dataTransfer) return;
    var types = e.dataTransfer.types;
    var ok = false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'text/plain' || types[i] === 'text/uri-list') { ok = true; break; }
    }
    if (!ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    target.classList.add('drag-over');
  });
  target.addEventListener('dragleave', function (e) {
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    target.classList.remove('drag-over');
  });
  target.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    target.classList.remove('drag-over');
    var text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (text) insertPlanContext(text);
  });
}

function makePlanDraggable(node, getText) {
  if (!node) return node;
  node.classList.add('plan-seg');
  node.draggable = true;
  node.title = node.title || 'Drag into chat for context';
  node.addEventListener('dragstart', function (e) {
    var text = typeof getText === 'function' ? getText() : getText;
    text = String(text || '').trim();
    if (!text) { e.preventDefault(); return; }
    e.stopPropagation();
    node.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', text);
    try {
      var ghost = node.cloneNode(true);
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.width = Math.min(node.offsetWidth, 320) + 'px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 16, 16);
      setTimeout(function () { ghost.remove(); }, 0);
    } catch (err) {}
  });
  node.addEventListener('dragend', function () { node.classList.remove('dragging'); });
  return node;
}

function planSegHeading(title) {
  var h = el('h2', 'sec');
  h.appendChild(el('span', 'plan-seg-grip', '\\u2837'));
  h.appendChild(document.createTextNode(title));
  return h;
}

function appendPlanSegment(box, title, buildBody, getText) {
  var seg = el('div', 'plan-seg');
  seg.appendChild(planSegHeading(title));
  var body = el('div', 'plan-seg-body');
  buildBody(body);
  seg.appendChild(body);
  makePlanDraggable(seg, getText);
  box.appendChild(seg);
  return seg;
}

function agentContextText(a) {
  var lines = ['--- Agent: ' + a.name + ' ---', 'rank: ' + a.rank, 'role: ' + a.role];
  if (a.manager) lines.push('reports to: ' + a.manager);
  if ((a.tools || []).length) lines.push('tools: ' + a.tools.join(', '));
  if ((a.skills || []).length) lines.push('skills: ' + a.skills.join(', '));
  (a.responsibilities || []).forEach(function (r) { lines.push('- ' + r); });
  return lines.join('\\n');
}

function initPlanChatComposer() {
  var ta = document.getElementById('planInput');
  var btn = document.getElementById('planSend');
  var form = document.getElementById('planChatForm');
  if (!ta || !btn || btn.dataset.ready) return;
  btn.dataset.ready = '1';
  ta.oninput = function () { resizeChatTextarea(ta); syncPlanComposer(); };
  ta.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var mode = refreshComposerAction('plan');
      if (mode === 'send') sendPlanMsg();
    }
  };
  if (form) {
    form.onsubmit = function (e) {
      e.preventDefault();
      var mode = refreshComposerAction('plan');
      if (mode === 'mic' || mode === 'recording') toggleVoiceDictate('plan');
      else if (mode === 'send') sendPlanMsg();
    };
  }
  bindPlanChatDrop(form);
  syncPlanComposer();
}

`;
