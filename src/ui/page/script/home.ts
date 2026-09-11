/** Home portfolio, workspace picker, company/plan list */
export const HOME = `// ---------- home ----------

function companyNeedsAttention(co) {
  return !!(co.running || co.queue || co.tasksFailed);
}

function companyStatus(co) {
  if (co.running) return { cls: 'running', label: 'working' };
  if (co.queue) return { cls: 'queued', label: 'queued' };
  if (co.tasksFailed) return { cls: 'failed', label: 'failed' };
  return { cls: 'done', label: 'idle' };
}

function appendRankDots(parent, ranks) {
  if (!ranks || !ranks.length) return;
  var dots = el('div', 'corow-ranks');
  ranks.forEach(function (r) {
    var dot = el('span', 'adot');
    dot.style.background = RANK_ACCENT[r] || RANK_ACCENT.worker;
    dots.appendChild(dot);
  });
  parent.appendChild(dots);
}

function appendTokenBar(parent, co, force) {
  var remaining = Math.max(0, co.budgetTokens - co.spentTokens);
  var low = co.budgetTokens > 0 && remaining / co.budgetTokens < 0.15;
  if (!force && !low && !companyNeedsAttention(co)) return;
  var track = el('div', 'bar' + (!remaining && co.budgetTokens ? ' depleted' : ''));
  var lbl = el('div', 'lbl');
  lbl.appendChild(el('span', null, 'tokens remaining'));
  var num = el('span', 'mono', remaining.toLocaleString());
  if (!remaining && co.budgetTokens) num.style.color = '#f87171';
  lbl.appendChild(num);
  track.appendChild(lbl);
  var t2 = el('div', 'track');
  var fill = el('div', 'fill');
  fill.style.width = co.budgetTokens ? (remaining / co.budgetTokens * 100) + '%' : '0%';
  if (!remaining && co.budgetTokens) fill.style.background = '#ef4444';
  t2.appendChild(fill);
  track.appendChild(t2);
  parent.appendChild(track);
}

function renderCompanyRow(co) {
  var st = companyStatus(co);
  var row = el('div', 'corow ' + st.cls);
  row.appendChild(el('div', 'corow-signal'));

  var main = el('div', 'corow-main');
  var top = el('div', 'corow-top');
  top.appendChild(el('div', 'corow-name', co.name));
  top.appendChild(el('div', 'corow-status', st.label));
  main.appendChild(top);
  if (co.goal) main.appendChild(el('div', 'corow-goal', co.goal));

  var meta = el('div', 'corow-meta');
  appendRankDots(meta, co.agentRanks);
  meta.appendChild(el('span', null, co.agents + ' agents'));
  meta.appendChild(el('span', null, co.tasksDone + '/' + co.tasksTotal + ' done'));
  if (co.tasksOpen) meta.appendChild(el('span', null, co.tasksOpen + ' open'));
  if (co.tasksFailed) meta.appendChild(el('span', null, co.tasksFailed + ' failed'));
  if (co.queue) meta.appendChild(el('span', null, co.queue + ' queued'));
  if (!companyNeedsAttention(co) && co.updatedAt) {
    meta.appendChild(el('span', null, 'updated ' + String(co.updatedAt).replace('T', ' ').slice(5, 16)));
  }
  main.appendChild(meta);
  row.appendChild(main);

  var side = el('div', 'corow-side');
  appendTokenBar(side, co, true);
  var actions = el('div', 'corow-top-actions');
  var exp = el('button', 'row-export', 'Export');
  exp.type = 'button';
  exp.title = 'Export company as .zip';
  exp.setAttribute('aria-label', 'Export ' + co.name);
  exp.onclick = function (e) {
    e.stopPropagation();
    openCompanyExport(co.slug, co.name);
  };
  actions.appendChild(exp);
  var del = el('button', 'row-del', '\\u00d7');
  del.type = 'button';
  del.title = 'Delete company';
  del.setAttribute('aria-label', 'Delete ' + co.name);
  del.onclick = function (e) {
    e.stopPropagation();
    deleteCompany(co.slug, co.name);
  };
  actions.appendChild(del);
  side.appendChild(actions);
  row.appendChild(side);

  row.onclick = function () { openCompany(co.slug); };
  return row;
}

function homeMetric(label, value, cls) {
  var m = el('div', 'home-metric' + (cls ? ' ' + cls : ''));
  m.appendChild(el('div', 'k', label));
  m.appendChild(el('div', 'v', value));
  return m;
}

var HOME_PORTFOLIO_PAGE_SIZE = 3;
var homePortfolioPage = 0;
var homePortfolioList = [];

function renderHomePortfolio() {
  var box = document.getElementById('companyRows');
  var pager = document.getElementById('homeCompanyPager');
  var meta = document.getElementById('homeCompanyPagerMeta');
  var prev = document.getElementById('homeCompanyPrev');
  var next = document.getElementById('homeCompanyNext');
  var coCount = document.getElementById('homeCompanyCount');
  if (!box) return;

  var total = homePortfolioList.length;
  var pages = Math.max(1, Math.ceil(total / HOME_PORTFOLIO_PAGE_SIZE));
  if (homePortfolioPage >= pages) homePortfolioPage = pages - 1;
  if (homePortfolioPage < 0) homePortfolioPage = 0;

  var start = homePortfolioPage * HOME_PORTFOLIO_PAGE_SIZE;
  var slice = homePortfolioList.slice(start, start + HOME_PORTFOLIO_PAGE_SIZE);
  box.innerHTML = '';
  slice.forEach(function (co) {
    box.appendChild(renderCompanyRow(co));
  });

  if (coCount) {
    coCount.textContent = total
      ? total + ' compan' + (total === 1 ? 'y' : 'ies')
      : '';
  }

  if (pager) {
    if (total <= HOME_PORTFOLIO_PAGE_SIZE) {
      pager.hidden = true;
    } else {
      pager.hidden = false;
      var from = start + 1;
      var to = start + slice.length;
      if (meta) meta.textContent = from + '\\u2013' + to + ' of ' + total;
      if (prev) prev.disabled = homePortfolioPage <= 0;
      if (next) next.disabled = homePortfolioPage >= pages - 1;
    }
  }
}

function homePortfolioPageDelta(delta) {
  homePortfolioPage += delta;
  renderHomePortfolio();
}

var workspaceRoot = '';
var workspaceBrowsePath = '';

function setHomeMode(mode) {
  var view = document.getElementById('viewHome');
  var welcome = document.getElementById('homeWelcome');
  var directory = document.getElementById('homeDirectory');
  if (!view) return;
  var welcomeMode = mode === 'welcome';
  view.classList.toggle('home-welcome', welcomeMode);
  view.classList.toggle('home-directory', !welcomeMode);
  if (welcome) welcome.hidden = !welcomeMode;
  if (directory) directory.hidden = welcomeMode;
}

function shortWorkspacePath(p) {
  if (!p) return '';
  var home = '';
  try {
    /* show ~ when path is under a typical home prefix */
    var m = p.match(/^(\\/Users\\/[^\\/]+|\\/home\\/[^\\/]+)/);
    if (m) home = m[1];
  } catch (e) {}
  if (home && p.indexOf(home) === 0) return '~' + p.slice(home.length);
  return p;
}

function setWorkspacePathLabels(root) {
  workspaceRoot = root || '';
  var label = shortWorkspacePath(workspaceRoot) || workspaceRoot || '—';
  ['homeWorkspacePathWelcome', 'homeWorkspacePathDir'].forEach(function (id) {
    var n = document.getElementById(id);
    if (n) {
      n.textContent = label;
      n.title = workspaceRoot;
    }
  });
}

function refreshWorkspacePath() {
  return fetch('/api/workspace').then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.root) setWorkspacePathLabels(d.root);
    return d;
  }).catch(function () { return null; });
}

function resetClientWorkspaceState() {
  companySlug = null;
  state = null;
  selectedAgent = null;
  planHistory = [];
  planDraft = null;
  planSlug = null;
  try {
    var planBar = document.getElementById('planBar');
    if (planBar) planBar.style.display = 'none';
    var planDoc = document.getElementById('planDoc');
    if (planDoc) planDoc.innerHTML = '<div class="plan-empty"><div class="plan-empty-title">Start in the conversation</div><div class="plan-empty-body">Tell the planner what you want accomplished. The living plan and org preview will appear here.</div></div>';
    var planTitle = document.getElementById('planTitle');
    if (planTitle) planTitle.textContent = 'New plan';
    var planLog = document.getElementById('planLog');
    if (planLog) planLog.innerHTML = '';
  } catch (e) {}
}

function switchWorkspace(root, init) {
  return fetch('/api/workspace', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ root: root, init: !!init })
  }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
    if (!res.ok || res.d.error) throw new Error(res.d.error || 'Failed to switch workspace');
    setWorkspacePathLabels(res.d.root);
    resetClientWorkspaceState();
    closeModal();
    nav('home');
    return res.d;
  });
}

function openWorkspacePicker() {
  var browsePath = workspaceRoot || '';
  showModal({
    eyebrow: 'Workspace',
    title: 'Choose folder',
    body: function (body) {
      var wrap = el('div', 'ws-picker');
      var pathRow = el('div', 'ws-picker-path');
      var pathInput = document.createElement('input');
      pathInput.type = 'text';
      pathInput.placeholder = '/path/to/workspace';
      pathInput.value = browsePath;
      pathInput.setAttribute('aria-label', 'Workspace path');
      var goBtn = el('button', 'btn ghost', 'Go');
      goBtn.type = 'button';
      pathRow.appendChild(pathInput);
      pathRow.appendChild(goBtn);
      wrap.appendChild(pathRow);

      var navRow = el('div', 'ws-picker-nav');
      wrap.appendChild(navRow);

      var list = el('div', 'ws-picker-list');
      wrap.appendChild(list);

      var status = el('div', 'ws-picker-status');
      wrap.appendChild(status);

      var err = el('div', 'ws-picker-err');
      wrap.appendChild(err);

      var actions = el('div', 'ws-picker-actions');
      var cancel = el('button', 'btn ghost', 'Cancel');
      cancel.type = 'button';
      cancel.onclick = closeModal;
      var initBtn = el('button', 'btn ghost', 'Initialize & use');
      initBtn.type = 'button';
      initBtn.title = 'Create ai-company-os.json, companies/, plans/, skills/ in this folder';
      var useBtn = el('button', 'btn', 'Use this folder');
      useBtn.type = 'button';
      actions.appendChild(cancel);
      actions.appendChild(initBtn);
      actions.appendChild(useBtn);
      wrap.appendChild(actions);
      body.appendChild(wrap);

      function setBusy(on) {
        useBtn.disabled = !!on;
        initBtn.disabled = !!on;
        goBtn.disabled = !!on;
        if (on) useBtn.textContent = 'Switching…';
        else useBtn.textContent = 'Use this folder';
      }

      function renderBrowse(data) {
        browsePath = data.path;
        workspaceBrowsePath = data.path;
        pathInput.value = data.path;
        navRow.innerHTML = '';
        if (data.parent) {
          var up = el('button', 'ws-picker-crumb', '↑ Parent');
          up.type = 'button';
          up.onclick = function () { loadBrowse(data.parent); };
          navRow.appendChild(up);
        }
        if (data.home) {
          var home = el('button', 'ws-picker-crumb', 'Home');
          home.type = 'button';
          home.onclick = function () { loadBrowse(data.home); };
          navRow.appendChild(home);
        }
        list.innerHTML = '';
        if (!data.entries || !data.entries.length) {
          list.appendChild(el('div', 'ws-picker-empty', 'No subfolders'));
        } else {
          data.entries.forEach(function (entry) {
            var item = el('button', 'ws-picker-item');
            item.type = 'button';
            item.appendChild(el('span', 'ico', '▸'));
            item.appendChild(document.createTextNode(entry.name));
            item.onclick = function () { loadBrowse(entry.path); };
            list.appendChild(item);
          });
        }
        status.textContent = data.initialized
          ? 'Initialized workspace'
          : 'Not initialized — use Initialize & use to scaffold';
        status.className = 'ws-picker-status' + (data.initialized ? ' ready' : '');
        initBtn.style.display = data.initialized ? 'none' : '';
        err.textContent = '';
      }

      function loadBrowse(p) {
        err.textContent = '';
        var q = '/api/workspace/browse' + (p ? '?path=' + encodeURIComponent(p) : '');
        fetch(q).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
          if (!res.ok || res.d.error) throw new Error(res.d.error || 'Cannot browse');
          renderBrowse(res.d);
        }).catch(function (e) {
          err.textContent = (e && e.message) || 'Cannot browse folder';
        });
      }

      goBtn.onclick = function () { loadBrowse(pathInput.value.trim()); };
      pathInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); loadBrowse(pathInput.value.trim()); }
      });
      useBtn.onclick = function () {
        var target = pathInput.value.trim() || browsePath;
        if (!target) return;
        err.textContent = '';
        setBusy(true);
        switchWorkspace(target, false).catch(function (e) {
          setBusy(false);
          err.textContent = (e && e.message) || 'Failed to switch';
        });
      };
      initBtn.onclick = function () {
        var target = pathInput.value.trim() || browsePath;
        if (!target) return;
        err.textContent = '';
        setBusy(true);
        switchWorkspace(target, true).catch(function (e) {
          setBusy(false);
          err.textContent = (e && e.message) || 'Failed to initialize';
        });
      };

      loadBrowse(browsePath || undefined);
      setTimeout(function () { pathInput.focus(); pathInput.select(); }, 0);
    }
  });
}

function renderPlanCards(list) {
  var box = document.getElementById('planCards');
  if (!box) return;
  box.innerHTML = '';
  list.forEach(function (p) {
    var chip = el('div', 'plan-chip');
    var name = el('div', 'name');
    name.appendChild(document.createTextNode(p.name));
    name.appendChild(el('span', 'badge', 'PLAN'));
    chip.appendChild(name);
    if (p.goal) chip.appendChild(el('div', 'goal', p.goal));
    chip.appendChild(el('div', 'meta', p.agents + ' proposed agents'));
    var actions = el('div', 'plan-chip-actions');
    var del = el('button', 'row-del', '\\u00d7');
    del.type = 'button';
    del.title = 'Delete plan';
    del.setAttribute('aria-label', 'Delete ' + p.name);
    del.onclick = function (e) {
      e.stopPropagation();
      deletePlan(p.slug, p.name);
    };
    actions.appendChild(del);
    chip.appendChild(actions);
    chip.onclick = function () { openPlan(p.slug); };
    box.appendChild(chip);
  });
  var add = el('div', 'plan-chip new', '\\uff0b New plan');
  add.onclick = function () { openPlan(null); };
  box.appendChild(add);
}

function loadHome() {
  refreshWorkspacePath();
  Promise.all([
    fetch('/api/companies').then(function (r) { return r.json(); }),
    fetch('/api/plans').then(function (r) { return r.json(); })
  ]).then(function (results) {
    var list = Array.isArray(results[0]) ? results[0] : [];
    var plans = Array.isArray(results[1]) ? results[1] : [];
    var empty = !list.length && !plans.length;
    setHomeMode(empty ? 'welcome' : 'directory');

    if (empty) {
      loadHomeSkills('skillCardsWelcome');
      return;
    }

    var totAgents = 0, totOpen = 0, totFailed = 0, totRemaining = 0, working = 0, attention = 0;
    list.forEach(function (co) {
      totAgents += co.agents;
      totOpen += co.tasksOpen;
      totFailed += co.tasksFailed || 0;
      totRemaining += Math.max(0, co.budgetTokens - co.spentTokens);
      if (co.running) working++;
      if (companyNeedsAttention(co)) attention++;
    });

    var sorted = list.slice().sort(function (a, b) {
      var score = function (co) {
        if (co.running) return 0;
        if (co.tasksFailed) return 1;
        if (co.queue) return 2;
        return 3;
      };
      var d = score(a) - score(b);
      if (d) return d;
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });

    var title = document.getElementById('homeTitle');
    if (title) {
      if (working === 1) title.textContent = '1 company working';
      else if (working > 1) title.textContent = working + ' companies working';
      else if (attention) title.textContent = attention === 1 ? '1 company needs you' : attention + ' companies need you';
      else if (list.length) title.textContent = 'All quiet across the portfolio';
      else title.textContent = 'Plans ready to launch';
    }

    var metrics = document.getElementById('homeMetrics');
    if (metrics) {
      metrics.innerHTML = '';
      if (list.length) {
        metrics.appendChild(homeMetric('Companies', String(list.length)));
        metrics.appendChild(homeMetric('Agents', String(totAgents)));
        metrics.appendChild(homeMetric('Open tasks', String(totOpen), totOpen ? 'live' : ''));
        if (totFailed) metrics.appendChild(homeMetric('Failed', String(totFailed), 'depleted'));
        metrics.appendChild(homeMetric('Tokens left', totRemaining.toLocaleString(),
          !totRemaining ? 'depleted' : ''));
      } else if (plans.length) {
        metrics.appendChild(homeMetric('Plans', String(plans.length)));
      }
    }

    var coBlock = document.getElementById('companiesBlock');
    homePortfolioList = sorted;
    if (homePortfolioPage * HOME_PORTFOLIO_PAGE_SIZE >= sorted.length) homePortfolioPage = 0;
    renderHomePortfolio();
    if (coBlock) coBlock.hidden = !list.length;

    var plansBlock = document.getElementById('plansBlock');
    var planCount = document.getElementById('homePlanCount');
    if (plansBlock) plansBlock.hidden = false;
    if (planCount) {
      planCount.textContent = plans.length
        ? plans.length + ' draft' + (plans.length === 1 ? '' : 's')
        : '';
    }
    renderPlanCards(plans);
    loadHomeSkills('skillCards');
  }).catch(function () {
    setHomeMode('welcome');
    loadHomeSkills('skillCardsWelcome');
  });
}

function deleteCompany(slug, name) {
  if (!slug) return;
  var label = name || slug;
  confirmModal({
    title: 'Delete company?',
    message: 'Really delete "' + label + '"? This removes all agents, tasks, and data. This cannot be undone.',
    confirmLabel: 'Delete company',
    busyLabel: 'Deleting\\u2026',
    onConfirm: function () {
      return fetch('/api/company/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company: slug })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
        if (!res.ok || res.d.error) throw new Error(res.d.error || 'Failed to delete company');
        if (companySlug === slug) {
          companySlug = null;
          state = null;
          nav('home');
        } else {
          loadHome();
        }
      });
    }
  });
}

function deleteCurrentCompany() {
  if (!companySlug) return;
  var name = state && state.meta ? state.meta.name : companySlug;
  deleteCompany(companySlug, name);
}

function openCompanyExport(slug, name) {
  slug = slug || companySlug;
  if (!slug) return;
  name = name || (state && state.meta && companySlug === slug ? state.meta.name : slug);
  showModal({
    eyebrow: 'Share',
    title: 'Export company',
    accent: '#34d399',
    body: function (body) {
      var callout = el('div', 'modal-callout');
      var copy = el('div', 'modal-callout-copy');
      copy.appendChild(el('div', 'modal-callout-title', name));
      copy.appendChild(el('div', 'modal-callout-sub',
        'Download a .zip you can hand to someone else. Layout is the reusable shape; full includes tasks and data.'));
      callout.appendChild(copy);
      body.appendChild(callout);

      var grid = el('div', 'conn-grid cols-2');
      function card(mode, title, desc, cta) {
        var btn = el('button', 'conn-card');
        btn.type = 'button';
        btn.setAttribute('data-export-mode', mode);
        var top = el('div', 'conn-card-top');
        top.appendChild(el('div', 'conn-card-name', title));
        top.appendChild(el('span', 'pill ' + (mode === 'full' ? 'done' : 'neutral'), mode));
        btn.appendChild(top);
        btn.appendChild(el('div', 'conn-card-desc', desc));
        var ctaEl = el('div', 'conn-card-cta', cta);
        btn.appendChild(ctaEl);
        btn.onclick = function () { downloadCompanyExport(mode, slug, btn, cta); };
        grid.appendChild(btn);
      }
      card(
        'layout',
        'Layout only',
        'Plan, org chart (agent profiles), skills, and company settings. No tasks, chat, audit, or data.',
        'Download layout.zip \\u2192'
      );
      card(
        'full',
        'Full company',
        'Everything in the company folder: layout plus tasks, queue, data (databases/uploads), chat, and audit.',
        'Download full.zip \\u2192'
      );
      body.appendChild(grid);

      var filesWrap = el('div', 'export-files');
      var filesHead = el('div', 'export-files-head');
      filesHead.appendChild(document.createTextNode('data/exports'));
      filesHead.appendChild(el('span', null, 'Loading\\u2026'));
      filesWrap.appendChild(filesHead);
      body.appendChild(filesWrap);

      fetch('/api/company/data-exports?company=' + encodeURIComponent(slug))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          filesHead.querySelector('span').textContent = '';
          var files = (d && d.files) || [];
          if (d && d.error) {
            filesHead.querySelector('span').textContent = d.error;
            return;
          }
          filesHead.querySelector('span').textContent = files.length
            ? (files.length + ' file' + (files.length === 1 ? '' : 's'))
            : 'empty';
          if (!files.length) {
            var empty = el('div', 'export-file-row');
            empty.appendChild(el('div', 'muted',
              'No deliverables yet. Agents can write packs here (CSV, MD, SQL, \\u2026).'));
            filesWrap.appendChild(empty);
            return;
          }
          files.forEach(function (f) {
            var row = el('div', 'export-file-row');
            var meta = el('div', 'export-file-meta');
            meta.appendChild(el('div', 'export-file-name', f.name));
            meta.appendChild(el('div', 'export-file-sub',
              formatBytes(f.bytes) + ' \\u00b7 ' + fmtTs(f.mtime)));
            row.appendChild(meta);
            var actions = el('div', 'export-file-actions');
            var viewBtn = el('button', 'btn', 'View');
            viewBtn.type = 'button';
            viewBtn.onclick = function () {
              openCompanyFileModal(f.path, {
                eyebrow: 'data/exports',
                accent: '#34d399',
                back: {
                  label: 'Export',
                  go: function () { openCompanyExport(slug, name); }
                }
              });
            };
            actions.appendChild(viewBtn);
            var dlBtn = el('button', 'btn', 'Download');
            dlBtn.type = 'button';
            dlBtn.onclick = function () {
              window.location.href =
                '/api/company/data-exports/download?company=' + encodeURIComponent(slug) +
                '&file=' + encodeURIComponent(f.name);
            };
            actions.appendChild(dlBtn);
            row.appendChild(actions);
            filesWrap.appendChild(row);
          });
        })
        .catch(function (e) {
          filesHead.querySelector('span').textContent = e.message || String(e);
        });

      body.appendChild(el('div', 'muted',
        'CLI: ai-company-os export ' + slug + ' --mode layout|full'));
    }
  });
}

function formatBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1).replace(/\\.0$/, '') + ' KB';
  return (n / (1024 * 1024)).toFixed(1).replace(/\\.0$/, '') + ' MB';
}

function downloadCompanyExport(mode, slug, btn, ctaLabel) {
  slug = slug || companySlug;
  if (!slug) return;
  var cta = btn ? btn.querySelector('.conn-card-cta') : null;
  if (btn) {
    btn.disabled = true;
    if (cta) cta.textContent = 'Preparing\\u2026';
  }
  var url = '/api/company/export?company=' + encodeURIComponent(slug)
    + '&mode=' + encodeURIComponent(mode);
  fetch(url)
    .then(function (r) {
      if (!r.ok) {
        return r.json().then(function (d) {
          throw new Error((d && d.error) || ('export failed (' + r.status + ')'));
        });
      }
      var disp = r.headers.get('content-disposition') || '';
      var m = /filename="([^"]+)"/.exec(disp);
      var filename = (m && m[1]) || (slug + '-' + mode + '.zip');
      return r.blob().then(function (blob) { return { blob: blob, filename: filename }; });
    })
    .then(function (out) {
      var href = URL.createObjectURL(out.blob);
      var a = document.createElement('a');
      a.href = href;
      a.download = out.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 1500);
      showToast('Exported ' + out.filename, 'ok');
      closeModal();
    })
    .catch(function (e) {
      showToast(e.message || String(e), 'err');
      if (btn) {
        btn.disabled = false;
        if (cta) cta.textContent = ctaLabel || ('Download ' + mode + '.zip \\u2192');
      }
    });
}

function deletePlan(slug, name) {
  if (!slug) return;
  var label = name || slug;
  confirmModal({
    title: 'Delete plan?',
    message: 'Really delete plan "' + label + '"? This cannot be undone.',
    confirmLabel: 'Delete plan',
    busyLabel: 'Deleting\\u2026',
    onConfirm: function () {
      return fetch('/api/plan/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: slug })
      }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (res) {
        if (!res.ok || res.d.error) throw new Error(res.d.error || 'Failed to delete plan');
        if (planSlug === slug) {
          planHistory = [];
          planDraft = null;
          planSlug = null;
          document.getElementById('planBar').style.display = 'none';
          document.getElementById('planDoc').innerHTML = '<div class="plan-empty"><div class="plan-empty-title">Start in the conversation</div><div class="plan-empty-body">Tell the planner what you want accomplished. The living plan and org preview will appear here.</div></div>';
          document.getElementById('planTitle').textContent = 'New plan';
          document.getElementById('planLog').innerHTML = '';
          nav('home');
        } else {
          loadHome();
        }
      });
    }
  });
}

function deleteCurrentPlan() {
  if (!planSlug) return;
  var name = planDraft && planDraft.name ? planDraft.name : planSlug;
  deletePlan(planSlug, name);
}

function loadHomeSkills(targetId) {
  var box = document.getElementById(targetId || 'skillCards');
  if (!box) return;
  fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
    box.innerHTML = '';
    var limit = targetId === 'skillCardsWelcome' ? 5 : 4;
    var shown = list.slice(0, limit);
    shown.forEach(function (s) {
      var preview = skillPreview(s.content, s.name);
      var row = el('div', 'home-skill');
      var main = el('div', 'home-skill-main');
      main.appendChild(el('div', 'home-skill-name', preview.title || s.name));
      var bits = [];
      if (preview.title && preview.title !== s.name) bits.push(s.name);
      if (s.files > 1) bits.push(s.files + ' files');
      if (s.hasScripts) bits.push('scripts');
      if (bits.length) main.appendChild(el('div', 'home-skill-meta', bits.join(' \\u00b7 ')));
      row.appendChild(main);
      row.appendChild(el('span', 'src ' + s.source, s.source));
      row.onclick = function () { openSkill(s.name); };
      box.appendChild(row);
    });
    var more = el('div', 'home-skill more', list.length > shown.length
      ? 'Browse all \\u00b7 ' + list.length
      : '\\uff0b Browse library');
    more.onclick = function () { nav('skills'); };
    box.appendChild(more);
  }).catch(function () {});
}

function openCompany(slug) {
  companySlug = slug;
  state = null;
  selectedAgent = null;
  agentSidebarOpen = true;
  chiefPendingAttachments = [];
  markDataFresh(false);
  // reload chief chat from disk on each company open
  delete chatLoaded[slug];
  delete chatHistories[slug];
  routeTo('/company/' + encodeURIComponent(slug));
  document.title = 'ai-company-os \\u00b7 ' + slug;
  syncCompanyLayout();
  nav('company');
}

function syncCompanyLayout() {
  var root = document.getElementById('viewCompany');
  if (!root) return;
  if (agentSidebarOpen) root.classList.add('agent-open');
  else root.classList.remove('agent-open');
}

function closeAgentSidebar() {
  agentSidebarOpen = false;
  selectedAgent = null;
  syncCompanyLayout();
  if (state) renderOrg(state.agents);
}

`;
