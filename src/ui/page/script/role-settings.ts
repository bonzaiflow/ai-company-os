/** Role model settings */
export const ROLE_SETTINGS = `// ---------- role model settings ----------

var modelCache = {};

function fetchModels(source) {
  if (modelCache[source]) return Promise.resolve(modelCache[source]);
  return fetch('/api/models?provider=' + encodeURIComponent(source))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      modelCache[source] = d;
      return d;
    })
    .catch(function () { return { models: [], default: '' }; });
}

function saveRoleConfig(key, source, model) {
  var roles = {}; roles[key] = source;
  var models = {}; models[key] = model;
  fetch('/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roles: roles, models: models })
  });
  cfg.roles[key] = source;
  cfg.models = cfg.models || {};
  cfg.models[key] = model;
  if (key === 'planning') {
    var psel = document.getElementById('providerSel');
    if (psel && source) psel.value = source;
  }
}

function fillProviderOptions(sel, selected) {
  sel.innerHTML = '';
  (cfg.providers || []).forEach(function (p) {
    var o = document.createElement('option');
    o.value = p; o.textContent = p;
    sel.appendChild(o);
  });
  if (selected && (cfg.providers || []).indexOf(selected) !== -1) sel.value = selected;
}

function bindRoleRow(key, srcSel, mdlSel) {
  fillProviderOptions(srcSel, (cfg.roles && cfg.roles[key]) || cfg.defaultProvider);

  function loadModelList(save) {
    mdlSel.innerHTML = '<option>\\u2026</option>';
    fetchModels(srcSel.value).then(function (d) {
      mdlSel.innerHTML = '';
      (d.models || []).forEach(function (m) {
        var o = document.createElement('option');
        o.value = m; o.textContent = m;
        mdlSel.appendChild(o);
      });
      var want = (cfg.models && cfg.models[key]) || d.default;
      if (want && (d.models || []).indexOf(want) !== -1) mdlSel.value = want;
      else if (d.default && (d.models || []).indexOf(d.default) !== -1) mdlSel.value = d.default;
      if (save) saveRoleConfig(key, srcSel.value, mdlSel.value);
    });
  }

  srcSel.onchange = function () { loadModelList(true); };
  mdlSel.onchange = function () { saveRoleConfig(key, srcSel.value, mdlSel.value); };
  loadModelList(false);
}

/** Modal: per role pick a SOURCE (provider), then a MODEL on that source. */
function openRoleSettings() {
  showModal({
    className: 'roles',
    eyebrow: 'Configuration',
    title: 'Model settings',
    body: function (body) {
      var wrap = el('div', 'role-settings');
      ['planning', 'agents', 'execution'].forEach(function (key) {
        var row = el('div', 'role-row');
        row.appendChild(el('div', 'role-name', key));
        var srcSel = document.createElement('select');
        srcSel.setAttribute('aria-label', key + ' source');
        var mdlSel = document.createElement('select');
        mdlSel.setAttribute('aria-label', key + ' model');
        row.appendChild(srcSel);
        row.appendChild(mdlSel);
        wrap.appendChild(row);
        bindRoleRow(key, srcSel, mdlSel);
      });
      body.appendChild(wrap);
    }
  });
}

/** Plan sidebar planning source/model; launch bar agents default; role models in settings modal. */
function initRoles() {
  function fillProvider(sel, selected) {
    if (!sel) return;
    sel.innerHTML = '';
    (cfg.providers || []).forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p;
      if (p === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  function bindModel(srcSel, mdlSel, preferred) {
    if (!srcSel || !mdlSel) return;
    function load() {
      mdlSel.innerHTML = '<option>\\u2026</option>';
      fetchModels(srcSel.value).then(function (d) {
        mdlSel.innerHTML = '';
        var def = document.createElement('option');
        def.value = ''; def.textContent = '(provider default)';
        mdlSel.appendChild(def);
        (d.models || []).forEach(function (m) {
          var o = document.createElement('option');
          o.value = m; o.textContent = m;
          mdlSel.appendChild(o);
        });
        var want = preferred || d.default || '';
        if (want && (d.models || []).indexOf(want) !== -1) mdlSel.value = want;
      });
    }
    srcSel.onchange = load;
    load();
  }
  var psel = document.getElementById('providerSel');
  var pmdl = document.getElementById('planningModelSel');
  fillProvider(psel, (cfg.roles && cfg.roles.planning) || cfg.defaultProvider);
  bindModel(psel, pmdl, (cfg.models && cfg.models.planning) || '');

  var asel = document.getElementById('agentsProviderSel');
  var amdl = document.getElementById('agentsModelSel');
  fillProvider(asel, (cfg.roles && cfg.roles.agents) || cfg.defaultProvider);
  bindModel(asel, amdl, (cfg.models && cfg.models.agents) || '');
}

`;
