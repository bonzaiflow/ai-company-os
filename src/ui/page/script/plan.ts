/** Plan view, diagram, launch */
export const PLAN = `// ---------- plan view ----------

function planBotMsg(text) {
  return appendSetupChatMessage(document.getElementById('planLog'), 'assistant', text);
}

function planUserMsg(text) {
  return appendSetupChatMessage(document.getElementById('planLog'), 'user', text);
}

function openPlan(slug) {
  planSlug = slug;
  planPendingAttachments = [];
  routeTo(slug ? '/plan/' + encodeURIComponent(slug) : '/plan/new');
  document.title = 'ai-company-os \\u00b7 ' + (slug || 'new plan');
  planHistory = [];
  planDraft = null;
  document.getElementById('planLog').innerHTML = '';
  document.getElementById('planDoc').innerHTML = '<div class="plan-empty"><div class="plan-empty-title">Start in the conversation</div><div class="plan-empty-body">Tell the planner what you want accomplished. The living plan and org preview will appear here.</div></div>';
  document.getElementById('planBar').style.display = 'none';
  document.getElementById('planName').value = '';
  document.getElementById('planTitle').textContent = 'New plan';
  var chips = document.getElementById('planAttachChips');
  if (chips) { chips.innerHTML = ''; chips.hidden = true; }
  var planTa = document.getElementById('planInput');
  if (planTa) planTa.value = '';
  if (slug) {
    fetch('/api/plan?slug=' + encodeURIComponent(slug)).then(function (r) { return r.json(); }).then(function (d) {
      planDraft = d.plan;
      planHistory = d.history || [];
      planHistory.forEach(function (m) {
        if (m.role === 'user') planUserMsg(m.content);
        else {
          try { planBotMsg(JSON.parse(m.content).reply); } catch (e) { planBotMsg(m.content); }
        }
      });
      renderPlanDoc();
      nav('plan');
    });
  } else {
    nav('plan');
  }
}

function sendPlanMsg() {
  var ta = document.getElementById('planInput');
  if (!ta) return;
  var text = ta.value.trim();
  var notes = planPendingAttachments.map(function (a) { return a.note; });
  if ((!text && !notes.length) || planSending) return;
  var message = notes.length
    ? (notes.join('\\n') + (text ? '\\n\\n' + text : '')).trim()
    : text;
  planPendingAttachments = [];
  renderPlanAttachChips();
  ta.value = '';
  resizeChatTextarea(ta);
  planSending = true;
  syncPlanComposer();
  planUserMsg(message);
  var thinking = appendChatThinking(document.getElementById('planLog'), getPlanThinkingLabel(), 'planThinking');
  startPlanPhaseTimer();
  planHistory.push({ role: 'user', content: message });
  fetch('/api/plan/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: document.getElementById('providerSel').value,
      history: planHistory,
      slug: planSlug
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    planSending = false;
    stopPlanPhaseTimer();
    if (d.error) { setChatMessageContent(thinking, '(error: ' + d.error + ')'); }
    else {
      setChatMessageContent(thinking, d.reply);
      planDraft = d.plan;
      planSlug = d.slug;
      // a fresh plan just got its identity — give it its permanent URL
      if (planSlug && location.pathname !== '/plan/' + encodeURIComponent(planSlug)) {
        history.replaceState({}, '', '/plan/' + encodeURIComponent(planSlug));
        document.title = 'ai-company-os \\u00b7 ' + planSlug;
      }
      planHistory.push({ role: 'assistant', content: JSON.stringify({ reply: d.reply, plan: d.plan }) });
      renderPlanDoc();
    }
    syncPlanComposer();
  }).catch(function (e) {
    planSending = false;
    stopPlanPhaseTimer();
    setChatMessageContent(thinking, '(request failed: ' + e + ')');
    syncPlanComposer();
  });
}

var mermaidSeq = 0;

function mmEsc(s) {
  return String(s || '').replace(/["\\[\\]{}()<>#;]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 60);
}

/** Deterministic mermaid of the process (root tasks) — the model never writes
 * mermaid itself, so the diagram always renders. */
function renderPlanDiagram(box, p) {
  if (typeof mermaid === 'undefined') return;
  var tasks = p.rootTasks || [];
  if (!tasks.length) return;
  var lines = ['flowchart LR'];
  tasks.forEach(function (t, i) {
    lines.push('  T' + i + '["' + mmEsc(t.title) + '"]');
    if (i > 0) lines.push('  T' + (i - 1) + ' --> T' + i);
  });
  var holder = el('div', 'mermaidbox');
  box.appendChild(holder);
  var id = 'mm' + (++mermaidSeq);
  try {
    mermaid.render(id, lines.join('\\n')).then(function (out) {
      holder.innerHTML = out.svg;
    }).catch(function () { holder.remove(); });
  } catch (e) { holder.remove(); }
}

/** Same org-chart UI as the live Agents view, for the proposed roster. */
function renderPlanOrg(box, p) {
  var agents = p.agents || [];
  if (!agents.length) return;
  var holder = el('div', 'org plan-org');
  box.appendChild(holder);
  renderOrgInto(holder, agents, {
    static: true,
    showTools: true,
    colors: agentColors(agents),
  });
}

function renderPlanDoc() {
  var box = document.getElementById('planDoc');
  box.innerHTML = '';
  if (!planDraft) return;
  var p = planDraft;
  var planColors = agentColors(p.agents || []);
  document.getElementById('planTitle').textContent = 'Plan: ' + p.name;

  var goalEl = el('div', 'plan-seg plan-seg-item', p.goal);
  makePlanDraggable(goalEl, function () {
    return '--- Goal ---\\n' + (p.goal || '');
  });
  box.appendChild(goalEl);

  appendPlanSegment(box, 'Process', function (body) {
    renderPlanDiagram(body, p);
  }, function () {
    var titles = (p.rootTasks || []).map(function (t) { return t.title; });
    return '--- Process ---\\n' + (titles.length ? titles.join(' \\u2192 ') : '(no root tasks)');
  });

  appendPlanSegment(box, 'Approach', function (body) {
    body.appendChild(el('div', 'muted', p.approach));
  }, function () {
    return '--- Approach ---\\n' + (p.approach || '');
  });

  appendPlanSegment(box, 'Proposed agents', function (body) {
    renderPlanOrg(body, p);
    (p.agents || []).forEach(function (a) {
      var card = el('div', 'agentcard');
      card.style.setProperty('--accent', planColors[a.name] || RANK_ACCENT.worker);
      var top = el('div');
      top.appendChild(el('span', 'org-rank ' + a.rank, a.rank));
      top.appendChild(el('strong', null, ' ' + a.name + ' '));
      top.appendChild(el('span', 'muted', a.role + (a.manager ? ' \\u00b7 reports to ' + a.manager : '')));
      card.appendChild(top);
      var chips = el('div');
      chips.style.margin = '0.35rem 0';
      (a.tools || []).forEach(function (t) { chips.appendChild(el('span', 'chip', t)); });
      (a.skills || []).forEach(function (s) { chips.appendChild(el('span', 'chip skill', s)); });
      card.appendChild(chips);
      (a.responsibilities || []).forEach(function (r) { card.appendChild(el('div', 'muted', '\\u2022 ' + r)); });
      var wrap = el('div', 'plan-seg plan-seg-item');
      wrap.appendChild(card);
      makePlanDraggable(wrap, function () { return agentContextText(a); });
      body.appendChild(wrap);
    });
  }, function () {
    var lines = ['--- Proposed agents ---'];
    (p.agents || []).forEach(function (a) {
      lines.push(a.rank + ' ' + a.name + ' \\u2014 ' + a.role + (a.manager ? ' (reports to ' + a.manager + ')' : ''));
    });
    return lines.join('\\n');
  });

  appendPlanSegment(box, 'Root tasks', function (body) {
    (p.rootTasks || []).forEach(function (t) {
      var row = el('div', 'plan-seg plan-seg-item', '\\u2022 ' + t.title);
      makePlanDraggable(row, function () {
        return '--- Root task ---\\n' + t.title;
      });
      body.appendChild(row);
    });
  }, function () {
    return '--- Root tasks ---\\n' + (p.rootTasks || []).map(function (t) { return '- ' + t.title; }).join('\\n');
  });

  if (p.deliverables && p.deliverables.length) {
    appendPlanSegment(box, 'Expected output files', function (body) {
      var dl = el('div');
      p.deliverables.forEach(function (d) {
        var chip = el('span', 'dlv');
        chip.appendChild(el('span', 'kind ' + (d.kind || '').toLowerCase(), d.kind || 'file'));
        chip.appendChild(el('span', null, d.file));
        if (d.description) chip.title = d.description;
        var wrap = el('span', 'plan-seg plan-seg-item');
        wrap.style.display = 'inline-block';
        wrap.appendChild(chip);
        makePlanDraggable(wrap, function () {
          return '--- Deliverable ---\\n' + (d.kind || 'file') + ': ' + d.file + (d.description ? '\\n' + d.description : '');
        });
        dl.appendChild(wrap);
      });
      body.appendChild(dl);
    }, function () {
      return '--- Expected output files ---\\n' + p.deliverables.map(function (d) {
        return '- [' + (d.kind || 'file') + '] ' + d.file + (d.description ? ' \\u2014 ' + d.description : '');
      }).join('\\n');
    });
  }

  if (p.storage && p.storage.length) {
    appendPlanSegment(box, 'Storage (SQLite)', function (body) {
      var st = el('div');
      p.storage.forEach(function (s) {
        var chip = el('span', 'dlv');
        chip.appendChild(el('span', 'kind db', s.db || 'main.db'));
        chip.appendChild(el('span', null, s.table + (s.purpose ? ' \\u2014 ' + s.purpose : '')));
        var wrap = el('span', 'plan-seg plan-seg-item');
        wrap.style.display = 'inline-block';
        wrap.appendChild(chip);
        makePlanDraggable(wrap, function () {
          return '--- Storage ---\\n' + (s.db || 'main.db') + ' / ' + s.table + (s.purpose ? '\\n' + s.purpose : '');
        });
        st.appendChild(wrap);
      });
      body.appendChild(st);
    }, function () {
      return '--- Storage (SQLite) ---\\n' + p.storage.map(function (s) {
        return '- ' + (s.db || 'main.db') + ' / ' + s.table + (s.purpose ? ' \\u2014 ' + s.purpose : '');
      }).join('\\n');
    });
  }

  if (p.todos && p.todos.length) {
    appendPlanSegment(box, 'Todos & requirements to stay on track', function (body) {
      p.todos.forEach(function (t) {
        var row = el('div', 'todoitem plan-seg plan-seg-item');
        row.appendChild(el('span', 'box', '\\u2610'));
        row.appendChild(el('span', null, t));
        makePlanDraggable(row, function () {
          return '--- Todo ---\\n' + t;
        });
        body.appendChild(row);
      });
    }, function () {
      return '--- Todos & requirements ---\\n' + p.todos.map(function (t) { return '- [ ] ' + t; }).join('\\n');
    });
  }

  renderPlanBar();
  var nameInput = document.getElementById('planName');
  if (!nameInput.value) nameInput.value = p.name;
}

function formatPlanBudget(tokens) {
  return tokens.toLocaleString() + ' tokens';
}

function showPlanBudgetDisplay() {
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  if (!display || !inp || !planDraft) return;
  display.textContent = formatPlanBudget(planDraft.budget.tokens);
  display.style.display = '';
  inp.style.display = 'none';
}

function editPlanBudget() {
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  if (!display || !inp || !planDraft) return;
  inp.value = String(planDraft.budget.tokens);
  display.style.display = 'none';
  inp.style.display = '';
  inp.focus();
  inp.select();
}

function commitPlanBudgetEdit() {
  var inp = document.getElementById('planBudgetTokens');
  if (!inp || !planDraft) return;
  var n = parseInt(inp.value, 10);
  if (!isNaN(n) && n > 0) planDraft.budget.tokens = n;
  showPlanBudgetDisplay();
}

function initPlanBar() {
  var bar = document.getElementById('planBar');
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = '1';
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  display.onclick = function () { editPlanBudget(); };
  display.onkeydown = function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editPlanBudget(); }
  };
  inp.onblur = function () { commitPlanBudgetEdit(); };
  inp.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = String(planDraft ? planDraft.budget.tokens : ''); inp.blur(); }
  };
}

function renderPlanBar() {
  if (!planDraft) return;
  document.getElementById('planBar').style.display = 'flex';
  showPlanBudgetDisplay();
  var delBtn = document.getElementById('planDeleteBtn');
  if (delBtn) delBtn.style.display = planSlug ? '' : 'none';
}

function syncPlanBudgetFromInput() {
  var inp = document.getElementById('planBudgetTokens');
  if (!inp || !planDraft) return;
  if (inp.style.display !== 'none') {
    var n = parseInt(inp.value, 10);
    if (!isNaN(n) && n > 0) planDraft.budget.tokens = n;
  }
  showPlanBudgetDisplay();
}

function launchPlan() {
  if (!planDraft) return;
  syncPlanBudgetFromInput();
  var btn = document.getElementById('launchBtn');
  btn.disabled = true;
  fetch('/api/plan/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      plan: planDraft,
      name: document.getElementById('planName').value,
      provider: document.getElementById('providerSel').value,
      slug: planSlug
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    btn.disabled = false;
    if (d.error) { planBotMsg('(launch failed: ' + d.error + ')'); return; }
    planHistory = []; planDraft = null; planSlug = null;
    document.getElementById('planLog').innerHTML = '';
    document.getElementById('planDoc').innerHTML = '';
    document.getElementById('planBar').style.display = 'none';
    document.getElementById('planName').value = '';
    openCompany(d.slug);
  }).catch(function () { btn.disabled = false; });
}

`;
