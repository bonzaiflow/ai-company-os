/** Chief/plan data uploads and audit event UI */
export const UPLOADS = `// ---------- data uploads (📎 in chief chat + plan chat) ----------

var chiefPendingAttachments = [];
var planPendingAttachments = [];

function readFileB64(file, cb) {
  var r = new FileReader();
  r.onload = function () { cb(String(r.result).split(',')[1]); };
  r.readAsDataURL(file);
}

function chiefUploadNote(d) {
  var note = 'I uploaded ' + d.path;
  if (d.bytes) note += ' (' + d.bytes + ' B)';
  if (d.preview) {
    note += ' \\u2014 parsed as a business list: ' + d.preview.rows + ' rows, ' +
      d.preview.withEmail + ' with email (e.g. ' + (d.preview.sample || []).join(', ') + ')';
  } else if (d.parseError) {
    note += ' \\u2014 file saved but business parse failed: ' + d.parseError;
  }
  note += '. Import with importdata on this exact path (do not rewrite truncated copies).';
  return note;
}

function planUploadNote(d) {
  var note = 'I uploaded a data file (' + d.path + ')';
  if (d.bytes) note += ' ' + d.bytes + ' B';
  if (d.preview) note += ' with ' + d.preview.rows + ' businesses (' + d.preview.withEmail + ' incl. email)';
  else if (d.parseError) note += ' \\u2014 parse failed: ' + d.parseError;
  note += ' \\u2014 it will be available to the company at data/uploads/. Plan an importdata step on the original file (no truncated rewrite).';
  return note;
}

function renderAttachChips(hostId, list, onChange) {
  var host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';
  if (!list.length) { host.hidden = true; return; }
  host.hidden = false;
  list.forEach(function (a, i) {
    var chip = el('span', 'chat-attach-chip');
    chip.appendChild(el('span', null, '\\ud83d\\udcce ' + (a.name || a.path)));
    chip.title = a.path || a.name || '';
    var x = el('button', 'chat-attach-chip-x', '\\u00d7');
    x.type = 'button';
    x.title = 'Remove attachment';
    x.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      list.splice(i, 1);
      if (onChange) onChange();
    };
    chip.appendChild(x);
    host.appendChild(chip);
  });
}

function renderChiefAttachChips() {
  renderAttachChips('chiefAttachChips', chiefPendingAttachments, function () {
    renderChiefAttachChips();
    syncChiefComposerReady();
  });
}

function renderPlanAttachChips() {
  renderAttachChips('planAttachChips', planPendingAttachments, function () {
    renderPlanAttachChips();
    syncPlanComposer();
  });
}

function syncChiefComposerReady() {
  var ta = document.getElementById('chiefInput');
  var btn = document.getElementById('chiefSend');
  if (!ta || !btn) return;
  var can = (ta.value.trim().length > 0 || chiefPendingAttachments.length > 0) && !chiefSending && !ta.disabled;
  syncChatSendBtn(btn, can, chiefSending);
}

function uploadToChief(file) {
  readFileB64(file, function (b64) {
    fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company: companySlug, filename: file.name, dataBase64: b64 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { showToast('upload failed: ' + d.error, 'err'); return; }
      chiefPendingAttachments.push({
        path: d.path,
        name: file.name,
        preview: d.preview || null,
        note: chiefUploadNote(d)
      });
      renderChiefAttachChips();
      syncChiefComposerReady();
      showToast('Attached ' + file.name + ' \\u2014 add a message and send', 'ok');
      var ta = document.getElementById('chiefInput');
      if (ta) ta.focus();
    }).catch(function (e) { showToast('upload failed: ' + e, 'err'); });
  });
}

function uploadToPlan(file) {
  readFileB64(file, function (b64) {
    fetch('/api/plan/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: planSlug || '', filename: file.name, dataBase64: b64 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { showToast('upload failed: ' + d.error, 'err'); return; }
      planSlug = d.slug; // a fresh plan gets its slug from the upload
      planPendingAttachments.push({
        path: d.path,
        name: file.name,
        preview: d.preview || null,
        note: planUploadNote(d)
      });
      ensurePlanAttachChips();
      renderPlanAttachChips();
      syncPlanComposer();
      showToast('Attached ' + file.name + ' \\u2014 add a message and send', 'ok');
      var ta = document.getElementById('planInput');
      if (ta) ta.focus();
    }).catch(function (e) { showToast('upload failed: ' + e, 'err'); });
  });
}

function ensurePlanAttachChips() {
  var form = document.getElementById('planChatForm');
  if (!form) return;
  var chips = document.getElementById('planAttachChips');
  if (chips) return;
  chips = el('div', 'chat-attach-chips');
  chips.id = 'planAttachChips';
  chips.hidden = true;
  var ta = document.getElementById('planInput');
  if (ta && ta.parentNode === form) form.insertBefore(chips, ta);
  else form.insertBefore(chips, form.firstChild);
}

function sendChiefMsg() {
  var ta = document.getElementById('chiefInput');
  if (!ta) return;
  var text = ta.value.trim();
  var notes = chiefPendingAttachments.map(function (a) { return a.note; });
  if ((!text && !notes.length) || chiefSending) return;
  var message = notes.length
    ? (notes.join('\\n') + (text ? '\\n\\n' + text : '')).trim()
    : text;
  chiefPendingAttachments = [];
  renderChiefAttachChips();
  if (!chatHistories[companySlug]) chatHistories[companySlug] = [];
  var hist = chatHistories[companySlug];
  var prior = hist.slice();
  ta.value = '';
  chiefSending = true;
  chiefStream = { status: 'Composing reply\\u2026', reasoning: '', reply: '' };
  hist.push({ role: 'user', content: message });
  renderAgentPanel();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, message: message, history: prior })
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!r.body || !r.body.getReader) throw new Error('streaming not supported');
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          if (chiefSending) {
            var fallback = (chiefStream && chiefStream.reply) || '(empty reply)';
            finishChiefStream(hist, fallback, chiefStream && chiefStream.reasoning);
          }
          return;
        }
        buf += decoder.decode(result.value, { stream: true });
        var parts = buf.split('\\n');
        buf = parts.pop() || '';
        parts.forEach(function (line) {
          var trimmed = line.trim();
          if (trimmed.indexOf('data:') !== 0) return;
          var payload = trimmed.slice(5).trim();
          if (!payload) return;
          var evt;
          try { evt = JSON.parse(payload); } catch (e) { return; }
          if (!chiefStream) chiefStream = { status: '', reasoning: '', reply: '' };
          if (evt.type === 'status') {
            chiefStream.status = evt.label || 'Working\\u2026';
            syncChiefStreamDom();
          } else if (evt.type === 'reasoning') {
            chiefStream.reasoning += evt.text || '';
            syncChiefStreamDom();
          } else if (evt.type === 'delta') {
            chiefStream.reply += evt.text || '';
            syncChiefStreamDom();
          } else if (evt.type === 'lookup') {
            chiefStream.status = 'Looking up ' + (evt.path || 'details') + '\\u2026';
            syncChiefStreamDom();
          } else if (evt.type === 'done') {
            var reply = evt.reply || chiefStream.reply || '';
            finishChiefStream(hist, reply, evt.reasoning || chiefStream.reasoning, evt.created || []);
          } else if (evt.type === 'error') {
            finishChiefStream(hist, '(error: ' + evt.error + ')');
          }
        });
        if (chiefSending) return pump();
      });
    }
    return pump();
  }).catch(function (e) {
    finishChiefStream(hist, '(request failed: ' + e + ')');
  });
}

function parseLlmCallDetail(detail) {
  // e.g. "cursor/auto 2322+276tok" or an error message
  var m = String(detail || '').match(/^([^/\\s]+)\\/(\\S+)\\s+(\\d+)\\+(\\d+)tok\\b/);
  if (!m) return null;
  return {
    provider: m[1],
    model: m[2],
    promptTokens: Number(m[3]),
    completionTokens: Number(m[4]),
    totalTokens: Number(m[3]) + Number(m[4]),
  };
}

function tryPrettyJson(text) {
  var s = String(text || '').trim();
  if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) return null;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch (e) {
    return null;
  }
}

function appendDetailDoc(parent, detail, maxHeight) {
  var pretty = tryPrettyJson(detail);
  var pre = el('pre', 'doc' + (pretty ? ' json' : ''));
  if (maxHeight) pre.style.maxHeight = maxHeight;
  if (pretty) {
    var esc = pretty
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    var out = '';
    var i = 0;
    while (i < esc.length) {
      var ch = esc.charAt(i);
      if (ch === '"') {
        var j = i + 1;
        while (j < esc.length) {
          if (esc.charAt(j) === '\\\\') { j += 2; continue; }
          if (esc.charAt(j) === '"') { j++; break; }
          j++;
        }
        var str = esc.slice(i, j);
        var k = j;
        while (k < esc.length && /\\s/.test(esc.charAt(k))) k++;
        if (esc.charAt(k) === ':') out += '<span class="jk">' + str + '</span>';
        else out += '<span class="js">' + str + '</span>';
        i = j;
        continue;
      }
      if (/[\\d-]/.test(ch)) {
        var num = esc.slice(i).match(/^-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/);
        if (num) {
          out += '<span class="jn">' + num[0] + '</span>';
          i += num[0].length;
          continue;
        }
      }
      if (/[tfn]/.test(ch)) {
        var lit = esc.slice(i).match(/^(true|false|null)\\b/);
        if (lit) {
          out += '<span class="jb">' + lit[0] + '</span>';
          i += lit[0].length;
          continue;
        }
      }
      out += ch;
      i++;
    }
    pre.innerHTML = out;
  } else {
    pre.textContent = detail;
  }
  parent.appendChild(pre);
  return pre;
}

function openAuditEventModal(e, fromTask) {
  if (fromTask && taskModalLive) {
    taskModalLive.viewingAudit = true;
    taskModalLive.dirty = false;
  }
  var back = null;
  if (fromTask && taskModalLive) {
    back = {
      label: taskModalLive.id || e.taskId || 'Task',
      go: function () {
        if (!taskModalLive) return;
        taskModalLive.viewingAudit = false;
        taskModalLive.dirty = false;
        var d = taskModalLive.latest;
        if (d) renderTaskModal(d, true, taskModalLive.opts || {});
        else openTaskModal(taskModalLive.id, taskModalLive.opts || {});
      }
    };
  } else if (e.taskId) {
    back = {
      label: e.taskId,
      go: function () { openTaskModal(e.taskId); }
    };
  }
  showModal({
    eyebrow: 'Audit event',
    title: e.type || 'Event',
    accent: e.ok ? '#4ade80' : '#f87171',
    back: back,
    body: function (body) {
      var grid = el('div', 'meta-grid');
      grid.appendChild(metaCell('Status', e.ok ? 'OK' : 'ERR'));
      grid.appendChild(metaCell('When', fmtTs(e.ts)));
      if (e.agent) grid.appendChild(metaCell('Agent', e.agent, e.agent));
      if (e.taskId) grid.appendChild(metaCell('Task', e.taskId));

      var detail = e.detail || '';
      var llm = e.type === 'llm.call' ? parseLlmCallDetail(detail) : null;
      if (llm) {
        grid.appendChild(metaCell('Provider', llm.provider));
        grid.appendChild(metaCell('Model', llm.model));
        grid.appendChild(metaCell('Prompt tok', llm.promptTokens.toLocaleString()));
        grid.appendChild(metaCell('Completion', llm.completionTokens.toLocaleString()));
        grid.appendChild(metaCell('Total', llm.totalTokens.toLocaleString()));
      }
      body.appendChild(grid);

      if (e.type === 'llm.call') {
        body.appendChild(el('div', 'muted',
          'Audit rows store provider and token counts only. The model\\u2019s thoughts and tool steps live in the task execution log.'));
        if (e.taskId && !fromTask) {
          var actions = el('div', 'schedule-actions');
          actions.style.margin = '0.75rem 0 1rem';
          var openTask = el('button', 'btn ghost', 'Open ' + e.taskId);
          openTask.onclick = function () { openTaskModal(e.taskId); };
          actions.appendChild(openTask);
          body.appendChild(actions);
        }

        if (e.taskId) {
          body.appendChild(el('h2', 'sec', 'Execution log'));
          var host = el('div', 'muted', 'Loading\\u2026');
          body.appendChild(host);
          fetch('/api/task?company=' + encodeURIComponent(companySlug) + '&id=' + encodeURIComponent(e.taskId))
            .then(function (r) { return r.json(); })
            .then(function (d) {
              host.innerHTML = '';
              if (d.error) { host.textContent = d.error; return; }
              if (!d.thoughts) {
                host.className = 'muted';
                host.textContent = 'No execution log recorded for this task yet.';
                return;
              }
              var wrap = el('div');
              host.replaceWith(wrap);
              renderMdPreview(wrap, e.taskId + '.md', 'agents/' + (e.agent || d.task && d.task.assignee || '') + '/workspace/' + e.taskId + '.md', d.thoughts);
            })
            .catch(function (err) {
              host.textContent = 'failed: ' + err;
            });
        }
        if (!llm && detail) {
          body.appendChild(el('h2', 'sec', 'Detail'));
          appendDetailDoc(body, detail, '28rem');
        }
        return;
      }

      if (!detail) {
        body.appendChild(el('div', 'muted', 'No detail on this event.'));
        return;
      }

      body.appendChild(el('h2', 'sec', 'Detail'));

      // chat.message details are often "user: … | Agent: …"
      var parts = [];
      if (e.type === 'chat.message' && detail.indexOf(' | ') >= 0) {
        detail.split(' | ').forEach(function (chunk) {
          var m = chunk.match(/^([^:]+):\\s*([\\s\\S]*)$/);
          if (m) parts.push({ who: m[1].trim(), text: m[2].trim() });
        });
      }

      if (parts.length >= 2) {
        parts.forEach(function (p) {
          var block = el('div', 'audit-detail-block');
          block.appendChild(el('div', 'who', p.who));
          block.appendChild(el('div', 'body', p.text));
          body.appendChild(block);
        });
        return;
      }

      appendDetailDoc(body, detail, '28rem');
    }
  });
}

function evtRow(e, fromTask) {
  var d = el('div', 'evt action');
  d.title = 'Inspect event';
  var head = el('div');
  head.appendChild(el('span', 'type', e.type));
  head.appendChild(el('span', e.ok ? 'ok' : 'err', e.ok ? 'OK' : 'ERR'));
  if (e.taskId) head.appendChild(el('span', 'ts', ' ' + e.taskId));
  d.appendChild(head);
  var detail = String(e.detail || '').replace(/\\s+/g, ' ').trim();
  if (detail.length > 140) detail = detail.slice(0, 139) + '\\u2026';
  var meta = (e.agent ? e.agent + ' \\u00b7 ' : '') + detail;
  if (meta) d.appendChild(el('div', 'detail', meta));
  d.appendChild(el('div', 'ts', e.ts.replace('T', ' ').slice(0, 19)));
  d.onclick = function () { openAuditEventModal(e, !!fromTask); };
  return d;
}

/** Countdown: the bar and number DEPLETE from the full budget toward 0. */
function renderBudget(spent, cap) {
  var remaining = Math.max(0, cap - spent);
  var wrap = document.getElementById('tokWrap');
  wrap.className = 'bar' + (cap && remaining === 0 ? ' depleted' : '');
  document.getElementById('tokTxt').textContent =
    remaining.toLocaleString() + ' / ' + cap.toLocaleString();
  document.getElementById('tokBar').style.width = cap ? (remaining / cap * 100) + '%' : '0%';
}

function grantTokens() {
  var remaining = state ? Math.max(0, state.meta.budget.tokens - state.spent.tokens) : 0;
  showModal({
    eyebrow: 'Budget',
    title: 'Grant tokens',
    accent: '#4ade80',
    body: function (body) {
      body.appendChild(el('div', 'muted',
        'Currently ' + remaining.toLocaleString() + ' tokens remaining. How much do you want to grant on top?'));
      var row = el('div');
      row.style.cssText = 'display:flex;gap:0.5rem;margin:0.9rem 0;align-items:center';
      var input = el('input');
      input.type = 'text';
      input.id = 'grantAmount';
      input.value = '100000';
      input.className = 'mono';
      input.style.flex = '1';
      row.appendChild(input);
      var confirm = el('button', 'btn', 'Grant');
      confirm.onclick = function () {
        var n = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
        if (!n) return;
        confirm.disabled = true;
        fetch('/api/budget', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ company: companySlug, addTokens: n })
        }).then(function () { closeModal(); refresh(); });
      };
      row.appendChild(confirm);
      body.appendChild(row);
      var quick = el('div');
      [50000, 100000, 250000, 500000, 1000000].forEach(function (n) {
        var b = el('button', 'tab', '+' + (n >= 1000000 ? (n / 1000000) + 'M' : (n / 1000) + 'k'));
        b.style.marginRight = '0.35rem';
        b.onclick = function () { input.value = String(n); };
        quick.appendChild(b);
      });
      body.appendChild(quick);
      input.focus();
      input.select();
    }
  });
}

`;
