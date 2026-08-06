/** Pause, approvals, check-ins, schedule, connectors */
export const GOVERNANCE = `// ---------- governance: pause / approvals / check-ins / schedule / connectors ----------

function togglePause() {
  if (!state) return;
  fetch('/api/company/pause', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, paused: !state.meta.paused })
  }).then(function () { refresh(); });
}

function flushQueue() {
  if (!state || !companySlug) return;
  var pending = state.tasks.filter(function (t) {
    return t.status === 'queued' || t.status === 'waiting';
  });
  if (!pending.length) {
    showToast('Queue is already empty', 'ok');
    return;
  }
  var running = state.tasks.filter(function (t) { return t.status === 'running'; }).length;
  confirmModal({
    title: 'Clear the queue?',
    message:
      'Remove ' + pending.length + ' queued/waiting task' + (pending.length === 1 ? '' : 's') +
      ' from the queue. They will be marked failed.' +
      (running ? ' ' + running + ' running task' + (running === 1 ? '' : 's') + ' will keep going.' : ''),
    confirmLabel: 'Clear queue',
    busyLabel: 'Clearing\\u2026',
    onConfirm: function () {
      return fetch('/api/task/flush', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: companySlug })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) throw new Error(d.error);
        showToast(
          'Cleared ' + d.flushed + ' task' + (d.flushed === 1 ? '' : 's') +
            (d.leftRunning ? ' \\u00b7 ' + d.leftRunning + ' still running' : ''),
          'ok'
        );
        refresh();
      });
    }
  });
}

function openApprovals() {
  fetch('/api/approvals?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (list) {
      showModal({
        eyebrow: 'Governance',
        title: 'Approval requests',
        accent: '#e879f9',
        body: function (body) {
          var pending = list.filter(function (a) { return a.status === 'pending'; });
          var past = list.filter(function (a) { return a.status !== 'pending'; });
          if (!list.length) {
            body.appendChild(el('div', 'muted', 'No approval requests. Gate tools via company.json → policies.approveTools, e.g. ["fetch"] — agents then park the task until you decide.'));
            return;
          }
          if (pending.length) body.appendChild(el('h2', 'sec', 'Waiting for you (' + pending.length + ')'));
          pending.forEach(function (a) {
            var card = el('div', 'task');
            card.style.cursor = 'default';
            var head = el('div');
            head.appendChild(el('span', 'id', a.id + ' \\u00b7 ' + a.taskId + ' \\u00b7 ' + fmtTs(a.ts)));
            card.appendChild(head);
            card.appendChild(el('div', 'title', a.agent + ' wants to use ' + a.tool));
            card.appendChild(el('pre', 'doc', JSON.stringify(a.args, null, 1)));
            var row = el('div');
            row.style.cssText = 'display:flex;gap:0.5rem;margin-top:0.5rem';
            var ok = el('button', 'btn', 'Approve');
            ok.onclick = function () { decideApproval(a.id, true); };
            var no = el('button', 'btn danger', 'Deny');
            no.onclick = function () { decideApproval(a.id, false); };
            row.appendChild(ok);
            row.appendChild(no);
            card.appendChild(row);
            body.appendChild(card);
          });
          if (past.length) {
            body.appendChild(el('h2', 'sec', 'Decided'));
            past.slice(-10).reverse().forEach(function (a) {
              var d = el('div', 'evt');
              d.appendChild(el('span', 'type', a.id + ' ' + a.tool));
              d.appendChild(el('span', a.status === 'denied' ? 'err' : 'ok', ' ' + a.status.toUpperCase()));
              d.appendChild(el('div', 'detail', a.agent + ' \\u00b7 ' + a.taskId));
              body.appendChild(d);
            });
          }
        }
      });
    });
}

function decideApproval(id, approve) {
  fetch('/api/approvals/decide', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, id: id, approve: approve })
  }).then(function () { openApprovals(); refresh(); });
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function openCheckinTable(db, table) {
  dbState.back = { label: 'Check-ins', go: function () { dbState.back = null; openCheckins(); } };
  openDbTable(db, table, []);
}

function backToCheckins() {
  return { label: 'Check-ins', go: openCheckins };
}

function detectCsvDelim(headerLine) {
  var semi = (headerLine.match(/;/g) || []).length;
  var comma = (headerLine.match(/,/g) || []).length;
  var tab = (headerLine.match(/\\t/g) || []).length;
  if (tab > 0 && tab >= semi && tab >= comma) return '\\t';
  if (semi >= comma && semi > 0) return ';';
  return ',';
}

function splitCsvRow(line, delim) {
  var out = [];
  var cur = '';
  var inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsvPreview(text, maxRows) {
  var raw = String(text || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  var lines = raw.split('\\n');
  while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
  if (!lines.length) return null;
  // file API truncates mid-line — drop a partial last row when content is capped
  if (raw.length >= 99000 && lines.length > 2) lines.pop();
  var delim = detectCsvDelim(lines[0]);
  var headers = splitCsvRow(lines[0], delim).map(function (h) { return h.trim(); });
  if (!headers.length || (headers.length === 1 && !headers[0])) return null;
  var rows = [];
  for (var r = 1; r < lines.length && rows.length < maxRows; r++) {
    if (!String(lines[r]).trim()) continue;
    var cells = splitCsvRow(lines[r], delim);
    while (cells.length < headers.length) cells.push('');
    rows.push(cells);
  }
  return {
    delim: delim === '\\t' ? 'tab' : delim,
    headers: headers,
    rows: rows,
    scanned: Math.max(0, lines.length - 1),
  };
}

function renderCsvPreview(body, name, rel, content) {
  var parsed = parseCsvPreview(content, 200);
  if (!parsed) {
    body.appendChild(el('div', 'muted', 'Could not parse as CSV.'));
    var pre = el('pre', 'doc', content || '(empty)');
    pre.style.maxHeight = '28rem';
    body.appendChild(pre);
    return;
  }

  var meta = el('div', 'csv-preview-meta');
  meta.appendChild(el('span', 'pill neutral', parsed.headers.length + ' columns'));
  meta.appendChild(el('span', 'pill neutral', parsed.rows.length + ' preview rows'));
  meta.appendChild(el('span', 'pill neutral', 'delim ' + parsed.delim));
  if (parsed.scanned > parsed.rows.length) {
    meta.appendChild(el('span', 'pill waiting', 'showing first ' + parsed.rows.length));
  }
  meta.appendChild(el('span', 'muted', rel));
  body.appendChild(meta);

  var bar = el('div', 'dbx-bar');
  var search = el('input');
  search.type = 'text';
  search.placeholder = 'Filter preview rows\\u2026';
  bar.appendChild(search);
  body.appendChild(bar);

  var scroll = el('div', 'csv-preview-scroll');
  var tableHost = el('div');
  scroll.appendChild(tableHost);
  body.appendChild(scroll);

  function paint(filter) {
    tableHost.innerHTML = '';
    var table = document.createElement('table');
    table.className = 'dbt';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    parsed.headers.forEach(function (h) {
      var th = document.createElement('th');
      th.textContent = h || '(empty)';
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);
    var tbody = document.createElement('tbody');
    var q = (filter || '').toLowerCase();
    var shown = 0;
    parsed.rows.forEach(function (row) {
      if (q) {
        var hit = row.some(function (c) { return String(c).toLowerCase().indexOf(q) >= 0; });
        if (!hit) return;
      }
      shown++;
      var tr = document.createElement('tr');
      for (var i = 0; i < parsed.headers.length; i++) {
        var td = document.createElement('td');
        var val = row[i] == null ? '' : String(row[i]);
        if (!val) { td.className = 'null'; td.textContent = '\\u2014'; }
        else { td.textContent = val; td.title = val; }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableHost.appendChild(table);
    if (!shown) tableHost.appendChild(el('div', 'muted', 'No rows match.'));
  }

  var deb;
  search.oninput = function () {
    clearTimeout(deb);
    deb = setTimeout(function () { paint(search.value.trim()); }, 180);
  };
  paint('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdInline(s) {
  var tick = String.fromCharCode(96);
  s = escapeHtml(s);
  s = s.replace(new RegExp(tick + '([^' + tick + ']+)' + tick, 'g'), '<code>$1</code>');
  s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
  s = s.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
  return s;
}

function parseMarkdownPreview(src) {
  var fence = String.fromCharCode(96, 96, 96);
  var text = String(src || '').replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  var frontmatter = null;
  if (text.indexOf('---\\n') === 0) {
    var end = text.indexOf('\\n---\\n', 4);
    if (end > 0) {
      frontmatter = text.slice(4, end);
      text = text.slice(end + 5).replace(/^\\n+/, '');
    }
  }
  var lines = text.split('\\n');
  var html = [];
  var inCode = false;
  var inList = false;
  function closeList() {
    if (inList) { html.push('</ul>'); inList = false; }
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.indexOf(fence) === 0) {
      closeList();
      if (inCode) { html.push('</code></pre>'); inCode = false; }
      else { html.push('<pre class="md-code"><code>'); inCode = true; }
      continue;
    }
    if (inCode) {
      html.push(escapeHtml(line) + '\\n');
      continue;
    }
    if (/^###\\s+/.test(line)) { closeList(); html.push('<h3>' + mdInline(line.replace(/^###\\s+/, '')) + '</h3>'); continue; }
    if (/^##\\s+/.test(line)) { closeList(); html.push('<h2>' + mdInline(line.replace(/^##\\s+/, '')) + '</h2>'); continue; }
    if (/^#\\s+/.test(line)) { closeList(); html.push('<h1>' + mdInline(line.replace(/^#\\s+/, '')) + '</h1>'); continue; }
    if (/^[-*]\\s+/.test(line)) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push('<li>' + mdInline(line.replace(/^[-*]\\s+/, '')) + '</li>');
      continue;
    }
    if (/^---+\\s*$/.test(line)) { closeList(); html.push('<hr>'); continue; }
    if (!line.trim()) { closeList(); html.push('<div class="md-gap"></div>'); continue; }
    closeList();
    html.push('<p>' + mdInline(line) + '</p>');
  }
  closeList();
  if (inCode) html.push('</code></pre>');
  return { html: html.join(''), frontmatter: frontmatter };
}

function renderMdPreview(body, name, rel, content) {
  var parsed = parseMarkdownPreview(content);
  var meta = el('div', 'md-preview-meta');
  meta.appendChild(el('span', 'pill neutral', 'markdown'));
  if (parsed.frontmatter) meta.appendChild(el('span', 'pill done', 'frontmatter'));
  meta.appendChild(el('span', 'muted', rel));
  body.appendChild(meta);

  var scroll = el('div', 'md-preview-scroll');
  var article = el('div', 'md-preview');
  article.innerHTML = parsed.html || '<p class="muted">(empty)</p>';
  scroll.appendChild(article);
  body.appendChild(scroll);
}

function openCompanyFileModal(relPath, opts) {
  opts = opts || {};
  var rel = String(relPath || '');
  var base = rel.split('/').pop() || rel;
  var isCsv = /\\.(csv|tsv)$/i.test(base);
  var isMd = /\\.(md|markdown)$/i.test(base);
  var eyebrow = opts.eyebrow || (isCsv ? 'CSV preview' : (isMd ? 'Markdown' : 'File'));
  showModal({
    eyebrow: eyebrow,
    title: base,
    accent: opts.accent || '#60a5fa',
    back: opts.back,
    body: function (body) {
      body.appendChild(el('div', 'muted', 'Loading preview\\u2026'));
      fetch('/api/file?company=' + encodeURIComponent(companySlug) + '&path=' + encodeURIComponent(rel))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          body.innerHTML = '';
          if (d.error) {
            body.appendChild(el('div', 'muted', d.error));
            return;
          }
          if (isCsv) {
            renderCsvPreview(body, base, rel, d.content || '');
            return;
          }
          if (isMd) {
            renderMdPreview(body, base, rel, d.content || '');
            return;
          }
          var head = el('div', 'modal-callout');
          var copy = el('div', 'modal-callout-copy');
          copy.appendChild(el('div', 'modal-callout-title', rel));
          copy.appendChild(el('div', 'modal-callout-sub',
            opts.subtitle || 'Preview of the first ~100 KB.'));
          head.appendChild(copy);
          body.appendChild(head);
          var pre = el('pre', 'doc', d.content || '(empty)');
          pre.style.maxHeight = '28rem';
          body.appendChild(pre);
        })
        .catch(function (e) {
          body.innerHTML = '';
          body.appendChild(el('div', 'muted', 'failed: ' + e));
        });
    }
  });
}

function openCheckinUpload(name) {
  openCompanyFileModal('data/uploads/' + name, {
    eyebrow: /\\.(csv|tsv)$/i.test(name) ? 'CSV preview' : 'Upload',
    back: backToCheckins(),
    subtitle: 'Preview of the first ~100 KB. Full file stays on disk for agents to import.',
  });
}

function checkinStat(k, v, sub, tone) {
  var cell = el('div', 'checkin-stat' + (tone ? ' ' + tone : ''));
  cell.appendChild(el('div', 'k', k));
  cell.appendChild(el('div', 'v', String(v)));
  if (sub) cell.appendChild(el('div', 's', sub));
  return cell;
}

function checkinBar(label, have, total, cls) {
  var row = el('div', 'checkin-bar-row');
  row.appendChild(el('div', 'lab', label));
  var track = el('div', 'checkin-track');
  var pct = total > 0 ? Math.min(100, Math.round((have / total) * 100)) : 0;
  var fill = el('div', 'checkin-fill' + (cls ? ' ' + cls : ''));
  fill.style.width = pct + '%';
  track.appendChild(fill);
  row.appendChild(track);
  row.appendChild(el('div', 'num', have + (total ? '/' + total : '')));
  return row;
}

function renderCheckinCard(ci) {
  var card = el('div', 'checkin-card');
  var meta = el('div', 'checkin-meta');
  meta.appendChild(el('span', null, fmtTs(ci.ts)));
  if (ci.stats) meta.appendChild(el('span', 'pill done', 'snapshot'));
  else meta.appendChild(el('span', 'pill neutral', 'legacy'));
  if (ci.stats && ci.stats.paused) meta.appendChild(el('span', 'pill waiting', 'paused'));
  if (ci.stats && ci.stats.pendingApprovals) {
    meta.appendChild(el('span', 'pill waiting', ci.stats.pendingApprovals + ' approval' + (ci.stats.pendingApprovals === 1 ? '' : 's')));
  }
  if (ci.questions && ci.questions.length) {
    meta.appendChild(el('span', 'pill waiting', ci.questions.length + ' question' + (ci.questions.length === 1 ? '' : 's')));
  }
  card.appendChild(meta);

  var s = ci.stats;
  if (s) {
    var alerts = [];
    if (s.paused) alerts.push('Paused');
    if (s.budget.pctLeft <= 5) alerts.push('Budget low');
    if (s.pendingApprovals) alerts.push(s.pendingApprovals + ' approval(s)');
    if (s.tasks.failed) alerts.push(s.tasks.failed + ' failed');
    if (alerts.length) {
      var alist = el('div', 'checkin-alerts');
      alerts.forEach(function (a) {
        alist.appendChild(el('span', 'pill ' + (a === 'Paused' || a.indexOf('failed') >= 0 || a.indexOf('Budget') >= 0 ? 'failed' : 'waiting'), a));
      });
      card.appendChild(alist);
    }

    var grid = el('div', 'checkin-grid');
    var budgetTone = s.budget.pctLeft <= 5 ? 'bad' : (s.budget.pctLeft <= 20 ? 'warn' : 'ok');
    grid.appendChild(checkinStat('Budget left', s.budget.pctLeft + '%', s.budget.remaining.toLocaleString() + ' tok', budgetTone));
    grid.appendChild(checkinStat('Spent', s.budget.spent.toLocaleString(), s.budget.toolCalls + ' tool calls'));
    grid.appendChild(checkinStat('Queue', s.queue, s.tasks.total + ' tasks total'));
    grid.appendChild(checkinStat('Running', s.tasks.running, s.tasks.done + ' done · ' + s.tasks.failed + ' failed', s.tasks.running ? 'warn' : ''));
    card.appendChild(grid);

    var taskTotal = Math.max(1, s.tasks.total);
    var bars = el('div', 'checkin-bars');
    [['done', s.tasks.done], ['running', s.tasks.running], ['waiting', s.tasks.waiting], ['queued', s.tasks.queued], ['failed', s.tasks.failed]].forEach(function (pair) {
      if (!pair[1] && pair[0] !== 'done') return;
      bars.appendChild(checkinBar(pair[0], pair[1], taskTotal, pair[0]));
    });
    if (s.targets && s.targets.length) {
      s.targets.forEach(function (t) {
        bars.appendChild(checkinBar(t.label, t.have, t.count, t.pct >= 100 ? 'done' : 'queued'));
      });
    }
    card.appendChild(bars);

    if (s.agents && s.agents.length) {
      var agents = el('div', 'checkin-agents');
      s.agents.forEach(function (a) {
        var chip = el('div', 'checkin-agent' + (a.status === 'working' ? ' working' : ''));
        chip.appendChild(el('span', 'dot'));
        chip.appendChild(el('span', 'who', a.name));
        chip.appendChild(el('span', 'meta', a.status === 'working' ? (a.taskId || 'working') : 'idle'));
        if (a.unread) chip.appendChild(el('span', 'meta', a.unread + ' unread'));
        agents.appendChild(chip);
      });
      card.appendChild(agents);
    }

    var dataBits = el('div', 'checkin-tables');
    (s.databases || []).forEach(function (db) {
      if (!db.tables.length) {
        var emptyChip = el('span', 'checkin-chip action', db.file + ' (empty)');
        emptyChip.title = 'Open databases';
        emptyChip.onclick = function () {
          dbState.back = { label: 'Check-ins', go: function () { dbState.back = null; openCheckins(); } };
          dbState.view = 'overview';
          fetch('/api/db/list?company=' + encodeURIComponent(companySlug))
            .then(function (r) { return r.json(); })
            .then(function (list) { dbState.list = list; renderDb(); });
        };
        dataBits.appendChild(emptyChip);
        return;
      }
      db.tables.forEach(function (t) {
        var chip = el('span', 'checkin-chip action');
        chip.title = 'Open ' + db.file + ' / ' + t.name;
        chip.appendChild(el('b', null, t.name));
        chip.appendChild(el('span', 'muted', t.rows.toLocaleString() + ' \\u00b7 ' + db.file));
        chip.onclick = function () { openCheckinTable(db.file, t.name); };
        dataBits.appendChild(chip);
      });
    });
    (s.uploads || []).forEach(function (u) {
      var chip = el('span', 'checkin-chip action');
      chip.title = 'Preview data/uploads/' + u.name;
      chip.appendChild(el('b', null, u.name));
      chip.appendChild(el('span', 'muted', fmtBytes(u.bytes)));
      chip.onclick = function () { openCheckinUpload(u.name); };
      dataBits.appendChild(chip);
    });
    if (dataBits.childNodes.length) card.appendChild(dataBits);
  } else if (ci.report) {
    card.appendChild(el('div', 'muted', 'Legacy prose check-in — new snapshots are statistical.'));
  }

  if (ci.questions && ci.questions.length) {
    var qbox = el('div', 'checkin-q');
    ci.questions.forEach(function (q) {
      var row = el('div', 'todoitem');
      row.appendChild(el('span', 'box', '?'));
      row.appendChild(el('span', null, q));
      qbox.appendChild(row);
    });
    var chief = chiefOf();
    qbox.appendChild(el('div', 'muted', 'Answer in Chat with ' + (chief ? chief.name : 'the chief')));
    card.appendChild(qbox);
  }
  return card;
}

function openCheckins() {
  fetch('/api/checkins?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (list) {
      showModal({
        eyebrow: 'Company pulse',
        title: 'Check-ins',
        accent: '#4ade80',
        body: function (body) {
          var callout = el('div', 'modal-callout');
          var copy = el('div', 'modal-callout-copy');
          copy.appendChild(el('div', 'modal-callout-title', 'Capture a snapshot'));
          copy.appendChild(el('div', 'modal-callout-sub',
            'Records budget, task pipeline, agent activity, and data totals — no narrative.'));
          callout.appendChild(copy);
          var btn = el('button', 'btn', 'Snapshot now');
          btn.onclick = function () {
            btn.disabled = true;
            btn.textContent = 'Capturing\\u2026';
            fetch('/api/checkin', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ company: companySlug })
            }).then(function (r) { return r.json(); }).then(function () { openCheckins(); refresh(); })
              .catch(function () { btn.disabled = false; btn.textContent = 'Snapshot now'; });
          };
          callout.appendChild(btn);
          body.appendChild(callout);

          if (!list.length) {
            var empty = el('div', 'modal-empty');
            empty.appendChild(el('div', 'modal-empty-title', 'No snapshots yet'));
            empty.appendChild(el('div', 'modal-empty-sub',
              'Capture one now, or enable a wake schedule for periodic snapshots.'));
            body.appendChild(empty);
            return;
          }

          body.appendChild(el('h2', 'sec', 'History'));
          list.forEach(function (ci) { body.appendChild(renderCheckinCard(ci)); });
        }
      });
    });
}

function openSchedule() {
  if (!state) return;
  var s = state.meta.schedule || { everyMinutes: 30, maxTicks: 5, active: false };
  showModal({
    eyebrow: 'Perpetuity',
    title: 'Wake schedule',
    accent: '#60a5fa',
    body: function (body) {
      var callout = el('div', 'modal-callout');
      var copy = el('div', 'modal-callout-copy');
      copy.appendChild(el('div', 'modal-callout-title', s.active ? 'Schedule is on' : 'Keep the company moving'));
      copy.appendChild(el('div', 'modal-callout-sub',
        'On each wake, due recurring work is queued, the company runs a bounded number of ticks, and check-ins land on their own cadence.'));
      callout.appendChild(copy);
      callout.appendChild(el('span', 'pill ' + (s.active ? 'done' : 'neutral'), s.active ? 'active' : 'idle'));
      body.appendChild(callout);

      var form = el('div', 'schedule-form');
      var status = el('div', 'schedule-status');
      if (s.lastWakeAt) {
        status.appendChild(el('span', 'muted', 'Last wake ' + fmtTs(s.lastWakeAt)));
      } else {
        status.appendChild(el('span', 'muted', 'No wakes yet'));
      }
      form.appendChild(status);

      var fields = el('div', 'schedule-fields');
      var everyField = el('div', 'schedule-field');
      everyField.appendChild(el('div', 'k', 'Every'));
      var mins = el('input');
      mins.type = 'text';
      mins.className = 'mono';
      mins.value = String(s.everyMinutes);
      mins.setAttribute('aria-label', 'Minutes between wakes');
      everyField.appendChild(mins);
      everyField.appendChild(el('div', 'hint', 'minutes between wakes'));
      fields.appendChild(everyField);

      var ticksField = el('div', 'schedule-field');
      ticksField.appendChild(el('div', 'k', 'Max ticks'));
      var ticks = el('input');
      ticks.type = 'text';
      ticks.className = 'mono';
      ticks.value = String(s.maxTicks || 5);
      ticks.setAttribute('aria-label', 'Ticks per wake');
      ticksField.appendChild(ticks);
      ticksField.appendChild(el('div', 'hint', 'queue steps per wake'));
      fields.appendChild(ticksField);
      form.appendChild(fields);

      var save = function (active) {
        fetch('/api/company/schedule', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            company: companySlug,
            everyMinutes: Number(mins.value) || 30,
            maxTicks: Number(ticks.value) || 5,
            active: active
          })
        }).then(function () { closeModal(); refresh(); });
      };
      var actions = el('div', 'schedule-actions');
      var on = el('button', 'btn', s.active ? 'Update schedule' : 'Enable schedule');
      on.onclick = function () { save(true); };
      actions.appendChild(on);
      if (s.active) {
        var off = el('button', 'btn danger', 'Disable');
        off.onclick = function () { save(false); };
        actions.appendChild(off);
      }
      form.appendChild(actions);
      body.appendChild(form);
    }
  });
}

function fieldInput(label, value, opts) {
  opts = opts || {};
  var wrap = el('div', 'schedule-field');
  wrap.appendChild(el('div', 'k', label));
  var inp = el('input');
  inp.type = opts.type || 'text';
  inp.className = 'mono';
  inp.value = value == null ? '' : String(value);
  if (opts.placeholder) inp.placeholder = opts.placeholder;
  if (opts.aria) inp.setAttribute('aria-label', opts.aria);
  wrap.appendChild(inp);
  if (opts.hint) wrap.appendChild(el('div', 'hint', opts.hint));
  wrap._input = inp;
  return wrap;
}

function openConnectors() {
  if (!companySlug) return;
  fetch('/api/connectors?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) { showToast(data.error, 'err'); return; }
      var c = data.connectors || {};
      var email = c.email || {};
      var smtp = email.smtp || {};
      var imap = email.imap || {};
      var tg = c.telegram || {};
      var wh = c.webhook || {};
      var secrets = data.secrets || {};
      var st = data.state || {};

      showModal({
        eyebrow: 'Channels',
        title: 'Connectors',
        accent: '#38bdf8',
        body: function (body) {
          var callout = el('div', 'modal-callout');
          var copy = el('div', 'modal-callout-copy');
          copy.appendChild(el('div', 'modal-callout-title', 'External messaging'));
          copy.appendChild(el('div', 'modal-callout-sub',
            'Secrets stay in env vars (names below). Inbound mail/Telegram are polled by the daemon; webhooks hit the URL below.'));
          callout.appendChild(copy);
          if (st.lastPollAt) {
            callout.appendChild(el('span', 'pill neutral', 'polled ' + fmtTs(st.lastPollAt)));
          }
          if (st.lastError) {
            callout.appendChild(el('span', 'pill failed', 'error'));
          }
          body.appendChild(callout);
          if (st.lastError) {
            body.appendChild(el('div', 'muted', st.lastError));
          }

          var form = el('div', 'schedule-form');

          body.appendChild(el('h2', 'sec', 'Email (SMTP + IMAP)'));
          var emailFields = el('div', 'schedule-fields');
          var fromF = fieldInput('From', email.from || '', { placeholder: 'bot@example.com' });
          var smtpHost = fieldInput('SMTP host', smtp.host || '', { placeholder: 'smtp.example.com' });
          var smtpPort = fieldInput('SMTP port', smtp.port || 587, { hint: '587 or 465' });
          var smtpUser = fieldInput('SMTP user', smtp.user || '', {});
          var smtpPass = fieldInput('SMTP pass env', smtp.passEnv || '', {
            placeholder: 'SMTP_PASS',
            hint: secrets.emailSmtp ? 'env is set' : 'env name for the password'
          });
          var smtpSecure = fieldInput('SMTP secure', smtp.secure ? 'true' : 'false', {
            hint: 'true for port 465'
          });
          var imapHost = fieldInput('IMAP host', imap.host || '', { placeholder: 'optional for read' });
          var imapPort = fieldInput('IMAP port', imap.port || 993, {});
          var imapUser = fieldInput('IMAP user', imap.user || '', {});
          var imapPass = fieldInput('IMAP pass env', imap.passEnv || smtp.passEnv || 'SMTP_PASS', {
            hint: secrets.emailImap ? 'env is set' : 'env not set yet'
          });
          var emailRoute = fieldInput('Route inbound to', email.routeTo || '', {
            placeholder: '(chief)',
            hint: 'agent name; blank = chief'
          });
          [fromF, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, imapHost, imapPort, imapUser, imapPass, emailRoute]
            .forEach(function (f) { emailFields.appendChild(f); });
          form.appendChild(emailFields);

          body.appendChild(el('h2', 'sec', 'Telegram (bot)'));
          var tgFields = el('div', 'schedule-fields');
          var tgToken = fieldInput('Bot token env', tg.botTokenEnv || '', {
            placeholder: 'TELEGRAM_BOT_TOKEN',
            hint: (tg.botTokenEnv ? (secrets.telegram ? 'env is set' : 'env not set yet') : 'leave blank to disable')
          });
          var tgChats = fieldInput('Allowed chat ids', (tg.allowedChatIds || []).join(', '), {
            hint: 'comma-separated; empty = any (dev only)'
          });
          var tgRoute = fieldInput('Route inbound to', tg.routeTo || '', {
            placeholder: '(chief)'
          });
          [tgToken, tgChats, tgRoute].forEach(function (f) { tgFields.appendChild(f); });
          form.appendChild(tgFields);

          body.appendChild(el('h2', 'sec', 'Webhook'));
          var whFields = el('div', 'schedule-fields');
          var whSecret = fieldInput('Inbound secret env', wh.inboundSecretEnv || '', {
            placeholder: 'WEBHOOK_SECRET',
            hint: (wh.inboundSecretEnv ? (secrets.webhook ? 'env is set' : 'env not set yet') : 'leave blank to disable')
          });
          var whHosts = fieldInput('Outbound allowed hosts', (wh.allowedHosts || []).join(', '), {
            hint: 'optional allowlist, e.g. hooks.example.com'
          });
          var whRoute = fieldInput('Route inbound to', wh.routeTo || '', { placeholder: '(chief)' });
          [whSecret, whHosts, whRoute].forEach(function (f) { whFields.appendChild(f); });
          form.appendChild(whFields);

          var hookBox = el('div', 'modal-callout');
          var hookCopy = el('div', 'modal-callout-copy');
          hookCopy.appendChild(el('div', 'modal-callout-title', 'Inbound URL'));
          var hookUrl = location.origin + (data.hookPath || ('/api/hooks/' + companySlug));
          hookCopy.appendChild(el('div', 'modal-callout-sub',
            'POST JSON { text, subject?, from? } with header x-connector-secret (or ?secret=)'));
          hookBox.appendChild(hookCopy);
          var hookCode = el('code', 'mono', hookUrl);
          hookCode.style.cssText = 'display:block;font-size:0.72rem;word-break:break-all;margin-top:0.4rem';
          hookBox.appendChild(hookCode);
          form.appendChild(hookBox);

          var gateRow = el('div', 'schedule-field');
          var gateLab = el('label');
          gateLab.style.cssText = 'display:flex;gap:0.5rem;align-items:center;font-size:0.8rem';
          var gate = document.createElement('input');
          gate.type = 'checkbox';
          gate.checked = (data.approveTools || []).some(function (t) {
            return t === 'email' || t === 'telegram' || t === 'webhook';
          });
          gateLab.appendChild(gate);
          gateLab.appendChild(document.createTextNode('Gate outbound email/telegram/webhook via Approvals'));
          gateRow.appendChild(gateLab);
          form.appendChild(gateRow);

          var status = el('div', 'muted');
          form.appendChild(status);

          function collect() {
            var chats = tgChats._input.value.split(/[,\\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var hosts = whHosts._input.value.split(/[,\\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
            var connectors = {};
            if (smtpHost._input.value.trim() && smtpUser._input.value.trim()) {
              var passEnvName = smtpPass._input.value.trim() || 'SMTP_PASS';
              connectors.email = {
                from: fromF._input.value.trim() || smtpUser._input.value.trim(),
                smtp: {
                  host: smtpHost._input.value.trim(),
                  port: Number(smtpPort._input.value) || 587,
                  secure: String(smtpSecure._input.value).toLowerCase() === 'true',
                  user: smtpUser._input.value.trim(),
                  passEnv: passEnvName
                },
                routeTo: emailRoute._input.value.trim() || undefined
              };
              if (imapHost._input.value.trim()) {
                connectors.email.imap = {
                  host: imapHost._input.value.trim(),
                  port: Number(imapPort._input.value) || 993,
                  secure: true,
                  user: imapUser._input.value.trim() || smtpUser._input.value.trim(),
                  passEnv: imapPass._input.value.trim() || passEnvName
                };
              }
            }
            if (tgToken._input.value.trim()) {
              connectors.telegram = {
                botTokenEnv: tgToken._input.value.trim(),
                allowedChatIds: chats.length ? chats : undefined,
                routeTo: tgRoute._input.value.trim() || undefined
              };
            }
            if (whSecret._input.value.trim()) {
              connectors.webhook = {
                inboundSecretEnv: whSecret._input.value.trim(),
                allowedHosts: hosts.length ? hosts : undefined,
                routeTo: whRoute._input.value.trim() || undefined
              };
            }
            return connectors;
          }

          var actions = el('div', 'schedule-actions');
          var save = el('button', 'btn', 'Save connectors');
          save.onclick = function () {
            save.disabled = true;
            status.textContent = 'Saving\\u2026';
            fetch('/api/connectors', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                company: companySlug,
                connectors: collect(),
                gateOutbound: gate.checked
              })
            }).then(function (r) { return r.json(); }).then(function (d) {
              if (d.error) throw new Error(d.error);
              showToast('Connectors saved', 'ok');
              openConnectors();
              refresh();
            }).catch(function (e) {
              status.textContent = e.message || String(e);
              save.disabled = false;
            });
          };
          actions.appendChild(save);

          var pollBtn = el('button', 'btn', 'Poll now');
          pollBtn.onclick = function () {
            pollBtn.disabled = true;
            fetch('/api/connectors/poll', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ company: companySlug })
            }).then(function (r) { return r.json(); }).then(function (d) {
              showToast('Ingested ' + (d.ingested || 0) + ' message(s)', d.errors && d.errors.length ? 'err' : 'ok');
              openConnectors();
              refresh();
            }).catch(function (e) {
              showToast(String(e), 'err');
              pollBtn.disabled = false;
            });
          };
          actions.appendChild(pollBtn);

          function testKind(kind, extra) {
            return function () {
              status.textContent = 'Testing ' + kind + '\\u2026';
              fetch('/api/connectors/test', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(Object.assign({ company: companySlug, kind: kind }, extra || {}))
              }).then(function (r) { return r.json(); }).then(function (d) {
                if (d.error) throw new Error(d.error);
                status.textContent = d.detail || 'ok';
                showToast(kind + ' test ok', 'ok');
              }).catch(function (e) {
                status.textContent = e.message || String(e);
                showToast(e.message || String(e), 'err');
              });
            };
          }
          var testEmail = el('button', 'btn', 'Test email');
          testEmail.onclick = testKind('email');
          actions.appendChild(testEmail);
          var testTg = el('button', 'btn', 'Test telegram');
          testTg.onclick = function () {
            var chatId = (tgChats._input.value.split(/[,\\s]+/).filter(Boolean)[0]) || '';
            testKind('telegram', { chatId: chatId })();
          };
          actions.appendChild(testTg);

          form.appendChild(actions);
          body.appendChild(form);
        }
      });
    })
    .catch(function (e) { showToast(String(e), 'err'); });
}

`;
