/** SQLite browser and refresh */
export const DB = `// ---------- sqlite browser (read-only): overview → table explorer ----------

var dbState = { list: [], view: 'overview', db: null, table: null, columns: [],
  page: 0, pageSize: 50, pages: 1, total: 0, sort: '', dir: 'asc', q: '', filters: {}, back: null };

function openDbBrowser() {
  markDataFresh(false);
  dbState.view = 'overview';
  dbState.back = null;
  fetch('/api/db/list?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (list) { dbState.list = list; renderDb(); });
}

function renderDb() {
  showModal({
    eyebrow: 'Data \\u00b7 read-only',
    title: (state ? state.meta.name : '') + ' \\u2014 databases',
    accent: '#fbbf24',
    back: dbState.back || undefined,
    body: function (body) {
      if (dbState.view === 'table') return renderDbTable(body);
      renderDbOverview(body);
    }
  });
}

// ── level 1: every DB file and its tables ──
function renderDbOverview(body) {
  if (!dbState.list.length) {
    body.appendChild(el('div', 'muted', 'No SQLite databases in data/ yet. Agents create them with the sqlite/discover tools.'));
    return;
  }
  dbState.list.forEach(function (d) {
    var file = el('div', 'db-file');
    var head = el('div', 'db-file-head');
    head.appendChild(el('span', 'db-file-name', '\\ud83d\\uddc4 ' + d.db));
    head.appendChild(el('span', 'db-file-size', fmtBytes(d.bytes) + ' \\u00b7 ' + d.tables.length + ' table' + (d.tables.length === 1 ? '' : 's')));
    file.appendChild(head);
    if (!d.tables.length) { file.appendChild(el('div', 'muted', '(no tables)')); }
    else {
      var grid = el('div', 'db-tables');
      d.tables.forEach(function (t) {
        var card = el('div', 'db-tcard');
        card.appendChild(el('div', 't', t.name));
        card.appendChild(el('div', 'n', t.rows.toLocaleString() + ' rows \\u00b7 ' + t.columns.length + ' cols'));
        card.appendChild(el('div', 'c', t.columns.join(', ')));
        card.onclick = function () { openDbTable(d.db, t.name, t.columns); };
        grid.appendChild(card);
      });
      file.appendChild(grid);
    }
    body.appendChild(file);
  });
}

function openDbTable(db, table, columns) {
  dbState.view = 'table';
  dbState.db = db; dbState.table = table; dbState.columns = columns || [];
  dbState.page = 0; dbState.sort = ''; dbState.dir = 'asc'; dbState.q = ''; dbState.filters = {};
  renderDb();
  loadDbPage();
}

function loadDbPage() {
  var qs = new URLSearchParams({ company: companySlug, db: dbState.db, table: dbState.table,
    page: String(dbState.page), pageSize: String(dbState.pageSize), dir: dbState.dir });
  if (dbState.sort) qs.set('sort', dbState.sort);
  if (dbState.q) qs.set('q', dbState.q);
  Object.keys(dbState.filters).forEach(function (c) { if (dbState.filters[c]) qs.set('f_' + c, dbState.filters[c]); });
  var host = document.getElementById('dbGrid');
  if (host) host.style.opacity = '0.5';
  fetch('/api/db/table?' + qs.toString())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { if (host) host.innerHTML = '<div class="muted">error: ' + d.error + '</div>'; return; }
      dbState.columns = d.columns; dbState.pages = d.pages; dbState.total = d.total;
      renderDbGrid(d);
    })
    .catch(function (e) { if (host) host.innerHTML = '<div class="muted">failed: ' + e + '</div>'; });
}

// ── level 2: paginated / sortable / filterable table explorer ──
function renderDbTable(body) {
  var crumb = el('div', 'db-crumb');
  var back = el('a', null, '\\u2190 databases'); back.onclick = function () { dbState.view = 'overview'; renderDb(); };
  crumb.appendChild(back);
  crumb.appendChild(document.createTextNode(' / ' + dbState.db + ' / '));
  crumb.appendChild(el('strong', null, dbState.table));
  body.appendChild(crumb);

  var bar = el('div', 'dbx-bar');
  var search = el('input'); search.type = 'text'; search.placeholder = 'search all columns\\u2026'; search.value = dbState.q;
  var deb;
  search.oninput = function () { clearTimeout(deb); deb = setTimeout(function () { dbState.q = search.value.trim(); dbState.page = 0; loadDbPage(); }, 350); };
  bar.appendChild(search);
  var psl = el('select');
  [25, 50, 100, 200].forEach(function (n) { var o = document.createElement('option'); o.value = String(n); o.textContent = n + ' / page'; if (n === dbState.pageSize) o.selected = true; psl.appendChild(o); });
  psl.onchange = function () { dbState.pageSize = Number(psl.value); dbState.page = 0; loadDbPage(); };
  bar.appendChild(psl);
  var sqlBtn = el('button', 'pgbtn', 'SQL'); sqlBtn.title = 'raw read-only query'; sqlBtn.onclick = function () { openDbSql(); };
  bar.appendChild(sqlBtn);
  body.appendChild(bar);

  var grid = el('div'); grid.id = 'dbGrid'; body.appendChild(grid);
}

function renderDbGrid(d) {
  var host = document.getElementById('dbGrid');
  if (!host) return;
  var prevWrap = host.querySelector('.dbtablewrap');
  var keepLeft = prevWrap ? prevWrap.scrollLeft : 0;
  var keepTop = prevWrap ? prevWrap.scrollTop : 0;
  host.style.opacity = '1';
  host.innerHTML = '';
  var wrap = el('div', 'dbtablewrap');
  var table = el('table', 'dbt');
  var thead = el('tr');
  d.columns.forEach(function (c) {
    var th = el('th', null, c);
    if (dbState.sort === c) th.appendChild(el('span', 'arr', dbState.dir === 'asc' ? '\\u2191' : '\\u2193'));
    th.onclick = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (dbState.sort === c) dbState.dir = dbState.dir === 'asc' ? 'desc' : 'asc';
      else { dbState.sort = c; dbState.dir = 'asc'; }
      dbState.page = 0; loadDbPage();
    };
    thead.appendChild(th);
  });
  table.appendChild(thead);
  d.rows.forEach(function (row) {
    var tr = el('tr');
    row.forEach(function (v) {
      var td = el('td', v === null ? 'null' : null, v === null ? 'NULL' : String(v));
      if (v !== null) td.title = String(v);
      tr.appendChild(td);
    });
    tr.onclick = function () { showRowDetail(d.columns, row); };
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  host.appendChild(wrap);
  // Restore viewport after sort/filter/page reload — otherwise the wrap jumps to 0,0
  requestAnimationFrame(function () {
    wrap.scrollLeft = keepLeft;
    wrap.scrollTop = keepTop;
  });

  var foot = el('div', 'dbx-foot');
  var from = dbState.total ? dbState.page * dbState.pageSize + 1 : 0;
  var to = Math.min(dbState.total, (dbState.page + 1) * dbState.pageSize);
  foot.appendChild(el('span', null, from.toLocaleString() + '\\u2013' + to.toLocaleString() + ' of ' + dbState.total.toLocaleString()
    + (dbState.q || Object.keys(dbState.filters).some(function (k) { return dbState.filters[k]; }) ? ' (filtered)' : '')));
  foot.appendChild(el('span', 'sp'));
  var prev = el('button', 'pgbtn', '\\u2039 prev'); prev.disabled = dbState.page <= 0;
  prev.onclick = function () { if (dbState.page > 0) { dbState.page--; loadDbPage(); } };
  var ind = el('span', null, 'page ' + (dbState.page + 1) + ' / ' + dbState.pages);
  var next = el('button', 'pgbtn', 'next \\u203a'); next.disabled = dbState.page + 1 >= dbState.pages;
  next.onclick = function () { if (dbState.page + 1 < dbState.pages) { dbState.page++; loadDbPage(); } };
  foot.appendChild(prev); foot.appendChild(ind); foot.appendChild(next);
  host.appendChild(foot);

  var det = el('div'); det.id = 'dbRowDetail'; host.appendChild(det);
}

function showRowDetail(columns, row) {
  var det = document.getElementById('dbRowDetail');
  if (!det) return;
  det.innerHTML = '';
  var box = el('div', 'rowdetail');
  box.appendChild(el('h4', null, 'Row detail'));
  var kv = el('div', 'kv');
  columns.forEach(function (c, i) {
    kv.appendChild(el('div', 'k', c));
    var v = row[i];
    var vd = el('div', 'v');
    if (v === null || v === '') vd.appendChild(el('span', 'muted', v === null ? 'NULL' : '(empty)'));
    else if (/^https?:\\/\\//.test(String(v))) { var a = el('a', null, String(v)); a.href = String(v); a.target = '_blank'; vd.appendChild(a); }
    else vd.textContent = String(v);
    kv.appendChild(vd);
  });
  box.appendChild(kv);
  det.appendChild(box);
  det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// raw read-only SQL escape hatch (kept from the old browser)
function openDbSql() {
  showModal({
    eyebrow: 'Data \\u00b7 read-only SQL',
    title: dbState.db,
    accent: '#fbbf24',
    body: function (body) {
      var b = el('a', null, '\\u2190 back to ' + dbState.table); b.style.cssText = 'color:#60a5fa;cursor:pointer;font-size:0.78rem';
      b.onclick = function () { renderDb(); loadDbPage(); };
      body.appendChild(b);

      var promptBox = el('div', 'dbsql-prompt');
      promptBox.appendChild(el('div', 'dbsql-label', 'Prompt'));
      var prompt = el('textarea', 'dbsql-ask'); prompt.id = 'dbSqlPrompt';
      prompt.placeholder = 'Describe what you want to see\\u2026';
      prompt.rows = 2;
      prompt.onkeydown = function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); promptDbSql(); }
      };
      promptBox.appendChild(prompt);
      var promptRow = el('div', 'dbsql-actions');
      var ask = el('button', 'btn', 'Write SQL'); ask.id = 'dbSqlAskBtn';
      ask.title = 'Generate a read-only query with the execution (or agents) model';
      ask.onclick = promptDbSql;
      promptRow.appendChild(ask);
      promptRow.appendChild(el('span', 'muted', 'execution / agents model \\u00b7 \\u2318\\u21a9'));
      promptBox.appendChild(promptRow);
      var promptStatus = el('div', 'muted'); promptStatus.id = 'dbSqlPromptStatus';
      promptStatus.style.marginTop = '0.35rem';
      promptBox.appendChild(promptStatus);
      body.appendChild(promptBox);

      body.appendChild(el('div', 'dbsql-label', 'SQL'));
      var ta = el('textarea', 'dbsql'); ta.id = 'dbSql';
      ta.value = 'SELECT * FROM "' + dbState.table + '" LIMIT 50';
      ta.onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runDbSql(); } };
      body.appendChild(ta);
      var runRow = el('div', 'dbsql-actions');
      var run = el('button', 'btn', 'Run (\\u2318\\u21a9)'); run.onclick = runDbSql;
      runRow.appendChild(run);
      runRow.appendChild(el('span', 'muted', 'SELECT / PRAGMA / WITH only'));
      body.appendChild(runRow);
      var out = el('div'); out.id = 'dbSqlOut'; body.appendChild(out);
    }
  });
}

function promptDbSql() {
  var promptEl = document.getElementById('dbSqlPrompt');
  var status = document.getElementById('dbSqlPromptStatus');
  var askBtn = document.getElementById('dbSqlAskBtn');
  var ta = document.getElementById('dbSql');
  if (!promptEl || !ta) return;
  var text = (promptEl.value || '').trim();
  if (!text) {
    if (status) status.textContent = 'Describe what you want first.';
    promptEl.focus();
    return;
  }
  if (askBtn) askBtn.disabled = true;
  if (status) status.textContent = 'Writing SQL\\u2026';
  fetch('/api/db/prompt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      company: companySlug,
      db: dbState.db,
      table: dbState.table,
      prompt: text
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (askBtn) askBtn.disabled = false;
    if (d.error) {
      if (status) status.textContent = 'error: ' + d.error;
      return;
    }
    ta.value = d.sql;
    if (status) {
      status.textContent = 'filled via ' + (d.role || 'model')
        + (d.provider ? ' \\u00b7 ' + d.provider : '')
        + (d.model ? '/' + d.model : '')
        + ' \\u2014 review, then Run';
    }
    ta.focus();
  }).catch(function (e) {
    if (askBtn) askBtn.disabled = false;
    if (status) status.textContent = 'failed: ' + e;
  });
}

function runDbSql() {
  var out = document.getElementById('dbSqlOut'); var sql = document.getElementById('dbSql').value;
  out.innerHTML = ''; out.appendChild(el('div', 'muted', 'running\\u2026'));
  fetch('/api/db/query', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, db: dbState.db, sql: sql }) })
    .then(function (r) { return r.json(); }).then(function (d) {
      out.innerHTML = '';
      if (d.error) { out.appendChild(el('div', 'muted', 'error: ' + d.error)); return; }
      if (!d.rows.length) { out.appendChild(el('div', 'muted', '(no rows)')); return; }
      var wrap = el('div', 'dbtablewrap'); var t = el('table', 'dbt'); var h = el('tr');
      d.columns.forEach(function (c) { h.appendChild(el('th', null, c)); }); t.appendChild(h);
      d.rows.forEach(function (row) { var tr = el('tr'); row.forEach(function (v) { tr.appendChild(el('td', v === null ? 'null' : null, v === null ? 'NULL' : String(v))); }); t.appendChild(tr); });
      wrap.appendChild(t); out.appendChild(wrap);
      out.appendChild(el('div', 'muted', d.total + ' row(s)' + (d.truncated ? ' \\u2014 first 200' : '')));
    }).catch(function (e) { out.innerHTML = ''; out.appendChild(el('div', 'muted', 'failed: ' + e)); });
}

function refresh(opts) {
  opts = opts || {};
  if (view !== 'company' || !companySlug) return;
  fetch('/api/state?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s.error) return;
      state = s;
      document.getElementById('coName').textContent = s.meta.name;
      document.getElementById('coGoal').textContent = s.meta.goal;
      // hydrate chief chat once from disk (plans already persist via /api/plan)
      var chatJustLoaded = false;
      if (!chatLoaded[companySlug] && !chiefSending) {
        chatHistories[companySlug] = Array.isArray(s.chat) ? s.chat : [];
        chatLoaded[companySlug] = true;
        chatJustLoaded = true;
      }
      renderTasks(s.tasks);
      renderOrg(s.agents);
      if (selectedTab !== 'chat' || chatJustLoaded || opts.paintChat) renderAgentPanel();
      renderBudget(s.spent.tokens, s.meta.budget.tokens);
      renderLiveStrip();
      noteDataSig(s.dataSig);
      var apprLabel = s.pendingApprovals ? '\\u2713 Approvals (' + s.pendingApprovals + ')' : '\\u2713 Approvals';
      var apprColor = s.pendingApprovals ? '#e879f9' : '';
      var apprBorder = s.pendingApprovals ? 'rgba(217,70,239,0.5)' : '';
      coToolButtons('approvals').forEach(function (ab) {
        ab.textContent = apprLabel;
        ab.style.color = apprColor;
        ab.style.borderColor = apprBorder;
      });
      var pb = document.getElementById('pauseBtn');
      if (pb) {
        var paused = !!s.meta.paused;
        pb.className = 'runtime-tool' + (paused ? ' alert' : '');
        var ico = document.getElementById('pauseBtnIco');
        var lab = document.getElementById('pauseBtnLabel');
        if (ico) ico.textContent = paused ? '\\u25b6' : '\\u23f8';
        if (lab) lab.textContent = paused ? 'Resume' : 'Pause';
        pb.title = paused ? 'Resume the company' : 'Pause the company';
      }
    })
    .catch(function () {});
  refreshRunner();
}

`;
