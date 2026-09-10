/** Tick/loop, toast, org chart, agent panel, chief chat */
export const RUNTIME = `// ---------- runtime controls ----------

var runnerState = { mode: null, stopRequested: false };

function refreshRunner() {
  if (view !== 'company' || !companySlug) return;
  fetch('/api/run/status?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      runnerState = s;
      var tickBtn = document.getElementById('tickBtn');
      var loopBtn = document.getElementById('loopBtn');
      var tickLabel = document.getElementById('tickBtnLabel');
      var loopLabel = document.getElementById('loopBtnLabel');
      var status = document.getElementById('runtimeStatus');
      var statusText = document.getElementById('runtimeStatusText');
      if (!tickBtn || !loopBtn) return;

      tickBtn.disabled = !!s.mode;
      if (s.mode === 'tick') {
        tickBtn.className = 'runtime-run-btn busy';
        if (tickLabel) tickLabel.textContent = 'Working\\u2026';
      } else {
        tickBtn.className = 'runtime-run-btn primary';
        if (tickLabel) tickLabel.textContent = 'Once';
      }

      if (s.mode === 'loop') {
        loopBtn.className = 'runtime-run-btn stop';
        loopBtn.disabled = s.stopRequested;
        if (loopLabel) {
          loopLabel.textContent = s.stopRequested
            ? 'Stopping\\u2026'
            : ('Stop \\u00b7 ' + (s.ticks || 0));
        }
      } else {
        loopBtn.className = 'runtime-run-btn';
        loopBtn.disabled = !!s.mode;
        if (loopLabel) loopLabel.textContent = 'Keep going';
      }

      if (status && statusText) {
        var paused = state && state.meta && state.meta.paused;
        if (paused) {
          status.className = 'runtime-status paused';
          statusText.textContent = 'Paused \\u2014 resume to run';
        } else if (s.mode === 'loop') {
          status.className = 'runtime-status' + (s.stopRequested ? ' stopping' : ' busy');
          statusText.textContent = s.stopRequested
            ? 'Stopping after this wave\\u2026'
            : ('Keep going \\u00b7 wave ' + (s.ticks || 0));
        } else if (s.mode === 'tick') {
          status.className = 'runtime-status busy';
          statusText.textContent = 'Running one wave\\u2026';
        } else {
          status.className = 'runtime-status ready';
          statusText.textContent = 'Ready';
        }
      }
    })
    .catch(function () {});
}

function flashStrip(msg) {
  var strip = document.getElementById('liveStrip');
  strip.innerHTML = '';
  var s = el('span', null, msg);
  s.style.color = '#f87171';
  strip.appendChild(s);
}

function showToast(msg, kind, opts) {
  opts = opts || {};
  var host = document.getElementById('toastHost');
  if (!host) { flashStrip(msg); return; }
  var t = el('div', 'toast' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : ''));
  var row = el('div', 'toast-row');
  row.appendChild(el('div', 'toast-msg', msg));
  if (opts.actionLabel && opts.onAction) {
    var act = el('button', 'toast-action', opts.actionLabel);
    act.type = 'button';
    act.onclick = function (e) {
      e.stopPropagation();
      t.remove();
      opts.onAction();
    };
    row.appendChild(act);
  }
  t.appendChild(row);
  host.appendChild(t);
  var ms = opts.duration || (kind === 'err' ? 7000 : 2800);
  setTimeout(function () {
    if (!t.parentNode) return;
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.2s ease';
    setTimeout(function () { t.remove(); }, 220);
  }, ms);
}

function raisePriorityRequest(id, opts) {
  opts = opts || {};
  return fetch('/api/task/priority', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, id: id, force: !!opts.force })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res.error) {
      if (res.code === 'already_front' && !opts.force) {
        showToast(res.error, 'err', {
          actionLabel: 'Force',
          duration: 10000,
          onAction: function () {
            raisePriorityRequest(id, { force: true, onDone: opts.onDone })
              .catch(function () { showToast('Priority update failed', 'err'); });
          }
        });
      } else {
        showToast(res.error, 'err');
      }
      return res;
    }
    showToast(
      id + (res.forced ? ' forced' : '') + ' \\u2191 ' + res.priority +
        (res.moved && res.moved.length ? ' \\u00b7 ' + res.moved.join(', ') : ''),
      'ok'
    );
    refresh();
    if (opts.onDone) opts.onDone(res);
    return res;
  });
}

function runTick() {
  if (!companySlug) { flashStrip('open a company first'); return; }
  document.getElementById('tickBtn').disabled = true;
  fetch('/api/run/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) flashStrip('tick: ' + d.error);
    refreshRunner(); refresh();
  }).catch(function (e) { flashStrip('tick failed: ' + e); refreshRunner(); });
}

function runLoopToggle() {
  if (!companySlug) { flashStrip('open a company first'); return; }
  var action = runnerState.mode === 'loop' ? 'stop' : 'start';
  document.getElementById('loopBtn').disabled = true;
  fetch('/api/run/loop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, action: action })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) flashStrip('loop: ' + d.error);
    refreshRunner(); refresh();
  }).catch(function (e) { flashStrip('loop failed: ' + e); refreshRunner(); });
}

function runningAgents() {
  if (!state) return {};
  var out = {};
  state.tasks.forEach(function (t) { if (t.status === 'running') out[t.assignee] = t.id; });
  return out;
}

function nodeFor(a, opts) {
  opts = opts || {};
  var running = opts.static ? {} : runningAgents();
  var accent = opts.colors
    ? (opts.colors[a.name] || RANK_ACCENT[a.rank] || RANK_ACCENT.worker)
    : agentColor(a.name);
  var showTools = opts.showTools !== undefined ? opts.showTools : liveTools;
  var n = el('div', 'org-card' + (!opts.static && selectedAgent === a.name ? ' sel' : '') + (running[a.name] ? ' active' : ''));
  n.style.setProperty('--accent', accent);
  n.appendChild(el('div', 'org-accent'));
  var body = el('div', 'org-body');
  body.appendChild(el('span', 'org-rank ' + a.rank, a.rank));
  body.appendChild(el('div', 'org-name', a.name));
  body.appendChild(el('div', 'org-role', a.role));
  if (a.llm && a.llm.provider) {
    var srcLabel = a.llm.source === 'agent' ? a.llm.provider : (a.llm.provider + ' · default');
    body.appendChild(el('div', 'org-llm' + (a.llm.source === 'agent' ? ' pinned' : ''), srcLabel));
  }
  if (showTools && ((a.tools || []).length || (a.skills || []).length)) {
    var chips = el('div', 'org-tools');
    var hotTool = opts.static ? null : liveToolFor(a.name);
    (a.tools || []).forEach(function (t) { chips.appendChild(el('span', 'chip' + (hotTool === t ? ' hot' : ''), t)); });
    (a.skills || []).forEach(function (s) { chips.appendChild(el('span', 'chip skill', s)); });
    body.appendChild(chips);
  }
  if (!opts.static && liveTools && running[a.name]) body.appendChild(el('div', 'org-task-tag', '\\u25b6 ' + running[a.name]));
  n.appendChild(body);
  if (!opts.static) n.onclick = function () { selectAgent(a.name); };
  return n;
}

function renderOrgInto(box, agents, opts) {
  box.innerHTML = '';
  function subtree(a) {
    var wrap = el('div', 'sub');
    wrap.appendChild(nodeFor(a, opts));
    var kids = agents.filter(function (x) { return x.manager === a.name; });
    if (kids.length) {
      wrap.appendChild(el('div', 'down')); // stub from parent card into the rail
      var row = el('div', 'kids');
      kids.forEach(function (k) { row.appendChild(subtree(k)); });
      wrap.appendChild(row);
    }
    return wrap;
  }
  agents.filter(function (a) { return !a.manager; }).forEach(function (a) {
    box.appendChild(subtree(a));
  });
}

function renderOrg(agents) {
  renderOrgInto(document.getElementById('org'), agents, {});
}

function chiefOf() {
  if (!state) return null;
  var c = state.agents.filter(function (a) { return a.rank === 'chief'; })[0];
  return c || state.agents[0] || null;
}

function selectAgent(name) {
  selectedAgent = name;
  agentSidebarOpen = true;
  syncCompanyLayout();
  renderAgentPanel();
  renderOrg(state.agents);
}

function ensureAgentSelection() {
  if (!agentSidebarOpen || !state || !state.agents.length) return;
  if (!selectedAgent) selectedAgent = (chiefOf() || state.agents[0]).name;
}

function renderAgentPanel() {
  if (!state) return;
  ensureAgentSelection();
  var pills = document.getElementById('agentPills');
  pills.innerHTML = '';
  state.agents.forEach(function (a) {
    var p = el('button', 'tab' + (a.name === selectedAgent ? ' on' : ''));
    var dot = el('span', 'dot');
    dot.style.background = agentColor(a.name);
    p.appendChild(dot);
    p.appendChild(document.createTextNode(a.name));
    p.onclick = function () { selectAgent(a.name); };
    pills.appendChild(p);
  });

  var sel = state.agents.filter(function (x) { return x.name === selectedAgent; })[0];
  document.getElementById('agentAccent').style.background = sel ? agentColor(sel.name) : '';

  var chief = chiefOf();
  var tabs = [
    ['overview', 'Overview'], ['tasks', 'Tasks'], ['files', 'Files'], ['audit', 'Audit']
  ];
  if (chief && sel && sel.name === chief.name) tabs.push(['chat', 'Chat']);
  if (selectedTab === 'chat' && (!chief || !sel || sel.name !== chief.name)) selectedTab = 'overview';
  var tb = document.getElementById('agentTabs');
  tb.innerHTML = '';
  tabs.forEach(function (t) {
    var b = el('button', 'tab' + (selectedTab === t[0] ? ' on' : ''), t[1]);
    b.onclick = function () { selectedTab = t[0]; renderAgentPanel(); };
    tb.appendChild(b);
  });

  var body = document.getElementById('agentBody');
  var a = sel;
  if (!a) { body.innerHTML = ''; body.className = 'side-inner agent-body'; return; }

  if (selectedTab === 'chat') { renderChiefChat(body); return; }
  body.innerHTML = '';
  body.className = 'side-inner agent-body';
  body.style.display = 'block';
  body.style.overflowY = 'auto';

  if (selectedTab === 'overview') {
    body.appendChild(renderAgentLlmEditor(a));
    body.appendChild(el('pre', 'doc', a.profile || '(no profile)'));
  } else if (selectedTab === 'tasks') {
    var mine = state.tasks.filter(function (t) { return t.assignee === a.name; });
    if (!mine.length) body.appendChild(el('div', 'muted', 'no tasks assigned'));
    mine.forEach(function (t) {
      body.appendChild(taskCard(t));
      if (t.result) {
        var r = el('pre', 'doc', t.result);
        r.style.marginTop = '-2px';
        r.style.marginBottom = '0.55rem';
        body.appendChild(r);
      }
    });
  } else if (selectedTab === 'files') {
    if (!a.files || !a.files.length) body.appendChild(el('div', 'muted', 'no files yet'));
    (a.files || []).forEach(function (f) {
      var row = el('div', 'file');
      row.appendChild(el('span', null, f.path.replace('agents/' + a.name + '/', '')));
      row.appendChild(el('span', null, f.size + ' B'));
      row.onclick = function () { openCompanyFileModal(f.path); };
      body.appendChild(row);
    });
  } else if (selectedTab === 'audit') {
    var evts = state.audit.filter(function (e) { return e.agent === a.name; });
    if (!evts.length) body.appendChild(el('div', 'muted', 'no events yet'));
    evts.slice().reverse().forEach(function (e) { body.appendChild(evtRow(e)); });
  }
}

function renderAgentLlmEditor(a) {
  var box = el('div', 'agent-llm');
  box.appendChild(el('div', 'agent-llm-title', 'LLM source'));
  var row = el('div', 'agent-llm-row');
  var srcSel = el('select', 'agent-llm-src');
  var mdlSel = el('select', 'agent-llm-mdl');
  var defOpt = document.createElement('option');
  defOpt.value = '';
  defOpt.textContent = 'Company / workspace default';
  srcSel.appendChild(defOpt);
  (cfg.providers || []).forEach(function (p) {
    var o = document.createElement('option');
    o.value = p; o.textContent = p;
    srcSel.appendChild(o);
  });
  var overrideProvider = (a.provider || (a.llm && a.llm.override && a.llm.override.provider) || '');
  var overrideModel = (a.model || (a.llm && a.llm.override && a.llm.override.model) || '');
  if (overrideProvider) srcSel.value = overrideProvider;
  else srcSel.value = '';

  function fillModels(selected) {
    mdlSel.innerHTML = '';
    var none = document.createElement('option');
    none.value = '';
    none.textContent = srcSel.value ? '(provider default)' : '—';
    mdlSel.appendChild(none);
    if (!srcSel.value) {
      mdlSel.disabled = true;
      return Promise.resolve();
    }
    mdlSel.disabled = false;
    return fetchModels(srcSel.value).then(function (d) {
      (d.models || []).forEach(function (m) {
        var o = document.createElement('option');
        o.value = m; o.textContent = m;
        mdlSel.appendChild(o);
      });
      if (selected && (d.models || []).indexOf(selected) !== -1) mdlSel.value = selected;
      else if (selected) {
        var custom = document.createElement('option');
        custom.value = selected; custom.textContent = selected; custom.selected = true;
        mdlSel.appendChild(custom);
      }
    });
  }

  function saveAgentLlm() {
    var body = { company: companySlug, name: a.name };
    if (!srcSel.value) body.clear = true;
    else {
      body.provider = srcSel.value;
      body.model = mdlSel.value || '';
    }
    fetch('/api/agent/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) return;
      a.provider = body.clear ? undefined : body.provider;
      a.model = body.clear ? undefined : (body.model || undefined);
      if (d.llm) a.llm = d.llm;
      renderOrg(state.agents);
      var hint = document.getElementById('agentLlmHint');
      if (hint && d.llm) {
        hint.textContent = 'Effective: ' + d.llm.provider + (d.llm.model ? '/' + d.llm.model : '') + ' (' + d.llm.source + ')';
      }
    });
  }

  srcSel.onchange = function () {
    fillModels('').then(saveAgentLlm);
  };
  mdlSel.onchange = saveAgentLlm;
  row.appendChild(srcSel);
  row.appendChild(mdlSel);
  box.appendChild(row);
  var hint = el('div', 'muted agent-llm-hint', '');
  hint.id = 'agentLlmHint';
  if (a.llm) {
    hint.textContent = 'Effective: ' + a.llm.provider + (a.llm.model ? '/' + a.llm.model : '') + ' (' + a.llm.source + ')';
  }
  box.appendChild(hint);
  fillModels(overrideModel);
  return box;
}

function planningChatDisplayContent(m) {
  if (m.role !== 'assistant') return m.content;
  try {
    var parsed = JSON.parse(m.content);
    if (parsed && typeof parsed.reply === 'string') return parsed.reply;
  } catch (e) {}
  return m.content;
}

function renderChiefChat(body) {
  var chief = chiefOf();
  body.innerHTML = '';
  body.className = 'side-inner agent-body chat-mode';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.overflowY = 'hidden';

  var box = el('div', 'chatbox');
  var log = el('div', 'setup-chat-sidebar-log');
  log.id = 'chiefChatLog';

  var planning = (state && Array.isArray(state.planningChat)) ? state.planningChat : [];
  if (planning.length) {
    var archive = el('div', 'setup-chat-archive');
    archive.appendChild(el('p', 'setup-chat-archive-label', 'Planning'));
    planning.forEach(function (m) {
      appendSetupChatMessage(
        archive,
        m.role === 'user' ? 'user' : 'assistant',
        planningChatDisplayContent(m),
        m.reasoning
      );
    });
    log.appendChild(archive);
  }

  var hist = chatHistories[companySlug] || [];
  if (!hist.length) {
    log.appendChild(el('p', 'setup-chat-status', 'Talk to ' + chief.name + ' \\u2014 ask about progress or hand over new work. New tasks land in the queue; run them with "ai-company-os run".'));
  }
  hist.forEach(function (m) {
    appendSetupChatMessage(
      log,
      m.role === 'user' ? 'user' : 'assistant',
      m.content,
      m.reasoning,
      m.role === 'assistant' ? createdFromMessage(m) : null
    );
  });
  if (chiefSending) {
    appendChiefStreamMessage(log);
  }

  var anchor = el('div');
  anchor.id = 'chiefChatEnd';
  log.appendChild(anchor);
  box.appendChild(log);

  var composer = buildChatComposer({
    textareaId: 'chiefInput',
    sendId: 'chiefSend',
    hintId: 'chiefChatHint',
    attachChipsId: 'chiefAttachChips',
    placeholder: 'Message ' + chief.name + '\\u2026',
    sending: chiefSending,
    thinkingLabel: (chiefStream && chiefStream.status) || 'Working\\u2026',
    onSend: sendChiefMsg,
    onAttach: uploadToChief,
    hasPendingAttachments: function () { return chiefPendingAttachments.length > 0; },
    renderAttachments: renderChiefAttachChips
  });
  box.appendChild(composer.dock);
  body.appendChild(box);

  anchor.scrollIntoView({ behavior: 'smooth' });
}

function finishChiefStream(hist, reply, reasoning, created) {
  chiefSending = false;
  if (reply != null) {
    var msg = { role: 'assistant', content: reply, reasoning: reasoning || undefined };
    if (created && created.length) msg.created = created;
    hist.push(msg);
  }
  // Finalize the live bubble in place so the answer doesn't "pop" after streaming.
  var streamMsg = document.getElementById('chiefStreamMsg');
  if (streamMsg && reply != null) {
    streamMsg.id = '';
    streamMsg.innerHTML = '';
    var body = el('div', 'setup-chat-msg-body');
    if (reasoning) {
      var details = el('details', 'setup-chat-reasoning');
      details.appendChild(el('summary', null, 'Reasoning'));
      details.appendChild(document.createTextNode(reasoning));
      body.appendChild(details);
    }
    fillChatMessageBody(body, reply, created);
    streamMsg.appendChild(body);
    var ta = document.getElementById('chiefInput');
    var btn = document.getElementById('chiefSend');
    var hint = document.getElementById('chiefChatHint');
    if (ta) { ta.disabled = false; resizeChatTextarea(ta); }
    if (btn) syncChatSendBtn(btn, false, false);
    if (hint) syncChatComposerHint(hint, false);
  } else {
    renderAgentPanel();
  }
  chiefStream = null;
  refresh({ paintChat: !!(created && created.length) });
}

`;
