/** Company queue, task cards, task graph */
export const COMPANY = `// ---------- company ----------

function setLeftTab(t) {
  leftTab = t;
  if (state) renderTasks(state.tasks);
}

function renderTasks(tasks) {
  var open = tasks.filter(function (t) { return ['running', 'queued', 'waiting'].indexOf(t.status) !== -1; });
  var closed = tasks.filter(function (t) { return t.status === 'done' || t.status === 'failed'; });
  document.getElementById('cntQueue').textContent = open.length;
  document.getElementById('cntHistory').textContent = closed.length;
  document.getElementById('ltQueue').className = 'tab' + (leftTab === 'queue' ? ' on' : '');
  document.getElementById('ltHistory').className = 'tab' + (leftTab === 'history' ? ' on' : '');
  var box = document.getElementById('tasks');
  box.innerHTML = '';
  var shown;
  if (leftTab === 'queue') {
    var order = { running: 0, queued: 1, waiting: 2 };
    var prioRank = { high: 0, normal: 1, low: 2 };
    var q = (state && state.queue) || [];
    shown = open.sort(function (a, b) {
      if (a.status === 'running' && b.status !== 'running') return -1;
      if (b.status === 'running' && a.status !== 'running') return 1;
      var ai = q.indexOf(a.id); var bi = q.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0 !== bi >= 0) return ai >= 0 ? -1 : 1;
      var byStatus = (order[a.status] - order[b.status]);
      if (byStatus) return byStatus;
      var byPrio = (prioRank[a.priority] ?? 1) - (prioRank[b.priority] ?? 1);
      if (byPrio) return byPrio;
      return a.id.localeCompare(b.id);
    });
  } else {
    shown = closed.sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
  }
  shown.forEach(function (t) { box.appendChild(taskCard(t)); });
  if (!shown.length) box.appendChild(el('div', 'muted', leftTab === 'queue' ? 'queue is empty' : 'nothing finished yet'));
  var flushBtn = document.getElementById('flushBtn');
  if (flushBtn) {
    var pending = open.filter(function (t) { return t.status === 'queued' || t.status === 'waiting'; }).length;
    flushBtn.disabled = pending === 0;
    flushBtn.title = pending
      ? 'Clear ' + pending + ' queued/waiting task' + (pending === 1 ? '' : 's') + ' (running keep going)'
      : 'Nothing queued to clear';
  }
}

function taskCard(t, opts) {
  opts = opts || {};
  var runningN = state ? state.tasks.filter(function (x) { return x.status === 'running'; }).length : 0;
  var d = el('div', 'task' + (t.status === 'running' && runningN > 1 ? ' parallel' : '') + (opts.extraClass ? ' ' + opts.extraClass : ''));
  d.style.cursor = 'pointer';
  var head = el('div');
  head.style.display = 'flex';
  head.style.justifyContent = 'space-between';
  head.style.gap = '0.5rem';
  head.style.alignItems = 'center';
  head.appendChild(el('span', 'id', t.id + (t.parent ? ' \\u2190 ' + t.parent : '')));
  var right = el('span');
  right.style.display = 'inline-flex';
  right.style.alignItems = 'center';
  right.style.gap = '0.4rem';
  if (t.priority === 'high') right.appendChild(el('span', 'pill neutral', 'high'));
  if (t.status === 'running' && runningN > 1) right.appendChild(el('span', 'parallel-tag', 'parallel'));
  if (t.status === 'running') right.appendChild(el('span', 'spinner'));
  right.appendChild(el('span', 'pill ' + t.status, t.status));
  head.appendChild(right);
  d.appendChild(head);
  d.appendChild(el('div', 'title', t.title));
  var who = el('div', 'id');
  var dot = el('span', 'adot');
  dot.style.background = agentColor(t.assignee);
  who.appendChild(dot);
  who.appendChild(document.createTextNode(t.assignee));
  d.appendChild(who);
  if (!opts.hidePriority && (t.status === 'queued' || t.status === 'waiting')) {
    var up = el('button', 'task-prio-up', '\\u2191');
    up.type = 'button';
    up.title = 'Raise priority (deps first)';
    up.onclick = function (e) {
      e.stopPropagation();
      up.disabled = true;
      raisePriorityRequest(t.id)
        .then(function (res) {
          if (res && res.error) up.disabled = false;
        })
        .catch(function () {
          up.disabled = false;
          showToast('Priority update failed', 'err');
        });
    };
    d.appendChild(up);
  }
  d.onclick = function () {
    if (opts.onOpen) opts.onOpen(t.id);
    else openTaskModal(t.id);
  };
  return d;
}

function isOpenTaskStatus(status) {
  return status === 'running' || status === 'queued' || status === 'waiting';
}

/** Remember filter when drilling into a task and returning. Default: active queue only. */
var taskGraphShowHistory = false;

function openTaskGraph(opts) {
  if (!state) return;
  opts = opts || {};
  if (typeof opts.showHistory === 'boolean') taskGraphShowHistory = opts.showHistory;
  var allTasks = state.tasks || [];
  showModal({
    eyebrow: 'Dependencies',
    title: 'Task graph',
    accent: '#60a5fa',
    body: function (body) {
      if (!allTasks.length) {
        body.appendChild(el('div', 'muted', 'No tasks yet.'));
        return;
      }

      var toolbar = el('div', 'graph-toolbar');
      var meta = el('div', 'csv-preview-meta');
      meta.style.margin = '0';
      toolbar.appendChild(meta);

      var filter = el('div', 'graph-filter');
      filter.setAttribute('role', 'group');
      filter.setAttribute('aria-label', 'Graph scope');
      var btnActive = el('button', 'graph-filter-btn', 'Active');
      btnActive.type = 'button';
      btnActive.title = 'Queued, waiting, and running only';
      var btnAll = el('button', 'graph-filter-btn', '+ History');
      btnAll.type = 'button';
      btnAll.title = 'Include done and failed tasks';
      filter.appendChild(btnActive);
      filter.appendChild(btnAll);
      toolbar.appendChild(filter);
      body.appendChild(toolbar);

      body.appendChild(el('div', 'muted',
        'Edges are parent \\u2192 child. Click a node to open the task.'));

      if (typeof cytoscape === 'undefined') {
        body.appendChild(el('div', 'muted', 'Graph library unavailable.'));
        return;
      }

      var holder = el('div', 'dagbox');
      body.appendChild(holder);
      var cy = null;

      function syncFilterButtons() {
        btnActive.className = 'graph-filter-btn' + (taskGraphShowHistory ? '' : ' on');
        btnAll.className = 'graph-filter-btn' + (taskGraphShowHistory ? ' on' : '');
      }

      function visibleTasks() {
        if (taskGraphShowHistory) return allTasks.slice();
        return allTasks.filter(function (t) { return isOpenTaskStatus(t.status); });
      }

      function paintMeta(tasks) {
        meta.innerHTML = '';
        var running = tasks.filter(function (t) { return t.status === 'running'; });
        var ready = tasks.filter(function (t) {
          if (t.status !== 'queued') return false;
          var kids = allTasks.filter(function (c) { return c.parent === t.id; });
          return !kids.some(function (c) { return c.status !== 'done' && c.status !== 'failed'; });
        });
        var hist = allTasks.filter(function (t) { return t.status === 'done' || t.status === 'failed'; }).length;
        meta.appendChild(el('span', 'pill neutral', tasks.length + ' shown'));
        if (!taskGraphShowHistory && hist) {
          meta.appendChild(el('span', 'pill neutral', hist + ' in history hidden'));
        }
        if (running.length > 1) meta.appendChild(el('span', 'pill queued', running.length + ' parallel'));
        else if (running.length === 1) meta.appendChild(el('span', 'pill running', '1 running'));
        if (ready.length) meta.appendChild(el('span', 'pill done', ready.length + ' ready'));
      }

      function paintGraph() {
        var tasks = visibleTasks();
        syncFilterButtons();
        paintMeta(tasks);
        if (cy) { cy.destroy(); cy = null; }
        holder.innerHTML = '';
        if (!tasks.length) {
          var empty = el('div', 'dagbox-empty muted', taskGraphShowHistory
            ? 'No tasks yet.'
            : 'Queue is empty \\u2014 toggle + History to see finished work.');
          holder.appendChild(empty);
          return;
        }

        var CARD_W = 260;
        var CARD_H = 96;
        var cyHost = el('div', 'dagbox-cy');
        var overlay = el('div', 'dagbox-overlay');
        holder.appendChild(cyHost);
        holder.appendChild(overlay);

        var cs = getComputedStyle(document.documentElement);
        var line = (cs.getPropertyValue('--line') || '#4a6178').trim();
        var ids = {};
        tasks.forEach(function (t) { ids[t.id] = true; });

        var elements = [];
        tasks.forEach(function (t) {
          elements.push({
            data: { id: t.id, status: t.status || '' },
            style: { width: CARD_W, height: CARD_H }
          });
        });
        tasks.forEach(function (t) {
          if (!t.parent || !ids[t.parent]) return;
          elements.push({
            data: { id: t.parent + '->' + t.id, source: t.parent, target: t.id }
          });
        });

        var cardMap = {};
        tasks.forEach(function (t) {
          var hist = t.status === 'done' || t.status === 'failed';
          var card = taskCard(t, {
            extraClass: hist ? 'graph-hist' : '',
            onOpen: function (id) {
              openTaskModal(id, {
                back: {
                  label: 'Task graph',
                  go: function () { openTaskGraph({ showHistory: taskGraphShowHistory }); }
                }
              });
            }
          });
          overlay.appendChild(card);
          cardMap[t.id] = card;
          card.addEventListener('wheel', function (e) {
            e.preventDefault();
            if (!cy) return;
            var rect = cyHost.getBoundingClientRect();
            var factor = e.deltaY > 0 ? 0.92 : 1.08;
            cy.zoom({
              level: Math.min(2.4, Math.max(0.28, cy.zoom() * factor)),
              renderedPosition: { x: e.clientX - rect.left, y: e.clientY - rect.top }
            });
          }, { passive: false });
        });

        function syncCards() {
          if (!cy) return;
          var zoom = cy.zoom();
          var pan = cy.pan();
          tasks.forEach(function (t) {
            var card = cardMap[t.id];
            var node = cy.getElementById(t.id);
            if (!card || !node.nonempty()) return;
            var pos = node.position();
            var x = pos.x * zoom + pan.x - (CARD_W * zoom) / 2;
            var y = pos.y * zoom + pan.y - (CARD_H * zoom) / 2;
            card.style.transform = 'translate(' + x + 'px, ' + y + 'px) scale(' + zoom + ')';
          });
        }

        cy = cytoscape({
          container: cyHost,
          elements: elements,
          style: [
            {
              selector: 'node',
              style: {
                'background-opacity': 0,
                'border-opacity': 0,
                'label': '',
                'width': CARD_W,
                'height': CARD_H,
                'shape': 'round-rectangle',
                'events': 'yes'
              }
            },
            {
              selector: 'edge',
              style: {
                'width': 1.5,
                'line-color': line,
                'target-arrow-color': line,
                'target-arrow-shape': 'triangle',
                'curve-style': 'bezier',
                'arrow-scale': 0.9,
                'z-index': 0
              }
            }
          ],
          layout: {
            name: 'dagre',
            rankDir: 'TB',
            nodeSep: 48,
            rankSep: 72,
            padding: 36,
            animate: false
          },
          userZoomingEnabled: true,
          userPanningEnabled: true,
          boxSelectionEnabled: false,
          autoungrabify: true,
          pixelRatio: 'auto'
        });
        cy.fit(undefined, 36);
        syncCards();
        cy.on('render pan zoom resize', syncCards);
        // Invisible nodes still catch taps under cards if overlay misses; keep as fallback
        cy.on('tap', 'node', function (evt) {
          var id = evt.target.id();
          if (!cardMap[id]) return;
          openTaskModal(id, {
            back: {
              label: 'Task graph',
              go: function () { openTaskGraph({ showHistory: taskGraphShowHistory }); }
            }
          });
        });
      }

      btnActive.onclick = function () {
        if (!taskGraphShowHistory) return;
        taskGraphShowHistory = false;
        paintGraph();
      };
      btnAll.onclick = function () {
        if (taskGraphShowHistory) return;
        taskGraphShowHistory = true;
        paintGraph();
      };
      paintGraph();
    }
  });
}

`;
