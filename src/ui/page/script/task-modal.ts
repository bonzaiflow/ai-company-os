/** Task detail modal */
export const TASK_MODAL = `// ---------- task detail modal ----------

function openTaskModal(id, opts) {
  opts = opts || {};
  if (modalPoll) { clearInterval(modalPoll); modalPoll = null; }
  fetch('/api/task?company=' + encodeURIComponent(companySlug) + '&id=' + encodeURIComponent(id))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) return;
      taskModalLive = { id: id, opts: opts, latest: d, viewingAudit: false, dirty: false };
      renderTaskModal(d, false, opts);
      // running tasks stream: re-fetch while the modal session is open
      if (d.task.status === 'running') {
        modalPoll = setInterval(function () {
          fetch('/api/task?company=' + encodeURIComponent(companySlug) + '&id=' + encodeURIComponent(id))
            .then(function (r) { return r.json(); })
            .then(function (d2) {
              if (d2.error) return;
              if (!taskModalLive || taskModalLive.id !== id) return;
              taskModalLive.latest = d2;
              if (taskModalLive.viewingAudit) {
                taskModalLive.dirty = true;
                syncModalBackDot();
              } else {
                renderTaskModal(d2, true, taskModalLive.opts || opts);
              }
              if (d2.task.status !== 'running' && modalPoll) { clearInterval(modalPoll); modalPoll = null; }
            })
            .catch(function () {});
        }, 1500);
      }
    });
}

function renderTaskModal(d, isUpdate, opts) {
  opts = opts || {};
  var t = d.task;
  var sub = el('div');
  sub.appendChild(el('span', 'id mono', t.id + '  '));
  sub.appendChild(el('span', 'pill ' + t.status, t.status));
  if (t.status === 'running') {
    sub.appendChild(document.createTextNode(' '));
    sub.appendChild(el('span', 'spinner'));
    sub.appendChild(el('span', 'muted', ' live'));
  }
  if (t.status === 'queued' && d.queuePos >= 0) {
    sub.appendChild(el('span', 'muted', '  position ' + (d.queuePos + 1) + ' of ' + d.queueLen + ' in queue'));
  }

  // preserve scroll positions across live re-renders
  var prevBody = document.querySelector('.modal-body');
  var prevScroll = prevBody ? prevBody.scrollTop : 0;
  var prevLog = document.getElementById('modalLog');
  var logPinned = !prevLog || (prevLog.scrollTop + prevLog.clientHeight >= prevLog.scrollHeight - 30);
  var prevLogScroll = prevLog ? prevLog.scrollTop : 0;

  var h = showModal({
    title: t.title,
    subNode: sub,
    accent: STATUS_ACCENT[t.status] || 'var(--blue)',
    back: opts.back,
    body: function (body) {
      var grid = el('div', 'meta-grid');
      grid.appendChild(metaCell('assignee', t.assignee, t.assignee));
      grid.appendChild(metaCell('created by', t.createdBy, agentNamed(t.createdBy) ? t.createdBy : null));
      var prioCell = el('div', 'meta-cell');
      prioCell.appendChild(el('div', 'k', 'priority'));
      var prioVal = el('div', 'v');
      prioVal.style.display = 'flex';
      prioVal.style.alignItems = 'center';
      prioVal.style.gap = '0.45rem';
      prioVal.style.flexWrap = 'wrap';
      prioVal.appendChild(el('span', 'pill neutral', t.priority || 'normal'));
      if (t.status === 'queued' || t.status === 'waiting') {
        var raiseBtn = el('button', 'btn ghost', t.priority === 'high' ? '\\u2191 Front of queue' : '\\u2191 Raise priority');
        raiseBtn.type = 'button';
        raiseBtn.title = 'Raise priority and move ahead in the queue (unfinished dependencies first)';
        raiseBtn.style.padding = '0.2rem 0.55rem';
        raiseBtn.style.fontSize = '0.72rem';
        raiseBtn.onclick = function () {
          raiseBtn.disabled = true;
          raisePriorityRequest(t.id, {
            onDone: function () { openTaskModal(t.id, opts); }
          }).then(function (res) {
            if (res && res.error) {
              raiseBtn.disabled = false;
              raiseBtn.textContent = t.priority === 'high' ? '\\u2191 Front of queue' : '\\u2191 Raise priority';
            }
          }).catch(function () {
            raiseBtn.disabled = false;
            showToast('Priority update failed', 'err');
          });
        };
        prioVal.appendChild(raiseBtn);
      }
      prioCell.appendChild(prioVal);
      grid.appendChild(prioCell);
      grid.appendChild(metaCell('created', fmtTs(t.createdAt)));
      grid.appendChild(metaCell('updated', fmtTs(t.updatedAt)));
      if (t.attempts) grid.appendChild(metaCell('attempts', t.attempts + ' / ' + (t.maxAttempts || 3)));
      body.appendChild(grid);

      if (d.parent || (d.children && d.children.length)) {
        body.appendChild(el('h2', 'sec', 'Task tree'));
        if (d.parent) {
          var pc = el('button', 'linkchip', '\\u2191 ' + d.parent.id + ' ' + d.parent.title);
          pc.onclick = function () { openTaskModal(d.parent.id, opts); };
          body.appendChild(pc);
          body.appendChild(el('span', 'pill ' + d.parent.status, d.parent.status));
          body.appendChild(el('div'));
        }
        (d.children || []).forEach(function (ch) {
          var row = el('div');
          row.style.margin = '0.2rem 0';
          var cc = el('button', 'linkchip', '\\u2193 ' + ch.id + ' ' + ch.title + ' \\u00b7 ' + ch.assignee);
          cc.onclick = function () { openTaskModal(ch.id, opts); };
          row.appendChild(cc);
          row.appendChild(el('span', 'pill ' + ch.status, ch.status));
          body.appendChild(row);
        });
      }

      body.appendChild(el('h2', 'sec', 'Description'));
      var desc = el('div');
      desc.style.whiteSpace = 'pre-wrap';
      desc.style.fontSize = '0.85rem';
      desc.textContent = t.description || '(none)';
      body.appendChild(desc);

      if (t.result) {
        body.appendChild(el('h2', 'sec', t.status === 'failed' ? 'Why it failed' : 'Result'));
        body.appendChild(el('div', 'result-box ' + (t.status === 'failed' ? 'failed' : 'done'), t.result));
      }

      if (t.status === 'failed') {
        var retryRow = el('div');
        retryRow.style.marginTop = '0.6rem';
        var rbtn = el('button', 'btn', '\\u21bb Retry task');
        rbtn.onclick = function () {
          rbtn.disabled = true;
          fetch('/api/task/retry', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ company: companySlug, id: t.id })
          }).then(function () { openTaskModal(t.id, opts); refresh(); });
        };
        retryRow.appendChild(rbtn);
        retryRow.appendChild(el('span', 'muted', '  re-queues with the failure context so the next attempt starts smarter'));
        body.appendChild(retryRow);
      }

      body.appendChild(el('h2', 'sec', t.status === 'running' ? 'Live execution log' : 'Execution log'));
      if (d.thoughts) {
        var logScroll = el('div', 'md-preview-scroll');
        logScroll.id = 'modalLog';
        logScroll.style.maxHeight = '260px';
        var logArticle = el('div', 'md-preview');
        logArticle.innerHTML = parseMarkdownPreview(d.thoughts).html || '<p class="muted">(empty)</p>';
        logScroll.appendChild(logArticle);
        body.appendChild(logScroll);
      } else {
        body.appendChild(el('div', 'muted',
          t.status === 'queued' ? 'not started yet \\u2014 no execution log' : 'no execution log recorded'));
      }

      if (d.messages && d.messages.length) {
        body.appendChild(el('h2', 'sec', 'Messages'));
        d.messages.forEach(function (m) {
          var box = el('div', 'msg-item');
          box.appendChild(el('div', 'route',
            m.from + ' \\u2192 ' + m.to + ' \\u00b7 ' + m.subject + (m.sentAt ? ' \\u00b7 ' + fmtTs(m.sentAt) : '')));
          box.appendChild(el('div', 'content', m.content));
          body.appendChild(box);
        });
      }

      if (d.audit && d.audit.length) {
        body.appendChild(el('h2', 'sec', 'Timeline (' + d.audit.length + ' events)'));
        d.audit.slice().reverse().forEach(function (e) { body.appendChild(evtRow(e, true)); });
      }
    }
  });

  if (isUpdate) {
    h.body.scrollTop = prevScroll;
    var log = document.getElementById('modalLog');
    if (log) log.scrollTop = logPinned ? log.scrollHeight : prevLogScroll;
  } else {
    var log2 = document.getElementById('modalLog');
    if (log2 && t.status === 'running') log2.scrollTop = log2.scrollHeight;
  }
}

`;
