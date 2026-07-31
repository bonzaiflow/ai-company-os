/** Skills library and editor */
export const SKILLS = `// ---------- skills ----------

var KNOWN_SKILL_TOOLS = ['sqlite', 'fetch', 'search', 'filesystem', 'shell', 'browser'];

function skillPreview(content, fallbackName) {
  var text = String(content || '').replace(/\\r\\n/g, '\\n');
  var lines = text.split('\\n');
  var title = '';
  var lead = '';
  var firstStep = '';
  var steps = 0;
  var tools = [];
  var toolSeen = {};

  function addTool(name) {
    var n = String(name || '').toLowerCase();
    if (!n || toolSeen[n]) return;
    if (KNOWN_SKILL_TOOLS.indexOf(n) < 0) return;
    toolSeen[n] = true;
    tools.push(n);
  }

  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].trim();
    if (!t) continue;

    var heading = t.match(/^#+\\s+(.+)$/);
    if (heading) {
      if (!title) title = heading[1].trim();
      continue;
    }
    if (/^---$/.test(t)) continue;
    if (/^(name|description)\\s*:/i.test(t)) continue;

    var numbered = t.match(/^(\\d+)[.)]\\s+(.+)$/);
    var bulleted = t.match(/^[-*]\\s+(.+)$/);
    if (numbered || bulleted) {
      steps++;
      if (!firstStep) firstStep = ((numbered && numbered[2]) || (bulleted && bulleted[1]) || '').trim();
      continue;
    }
    if (!lead) lead = t;
  }

  var tickRe = /\`([a-z][a-z0-9-]*)\`/gi;
  var m;
  while ((m = tickRe.exec(text))) addTool(m[1]);
  var jsonRe = /"tool"\\s*:\\s*"([a-z][a-z0-9-]*)"/gi;
  while ((m = jsonRe.exec(text))) addTool(m[1]);

  if (!title) title = fallbackName || 'Untitled skill';

  var summary = firstStep || lead;
  if (!firstStep && lead) {
    var how = lead.match(/^How to\\s+(.+?)(?:\\s+with\\s+.+)?\\s*:?\\s*$/i);
    if (how) summary = how[1].charAt(0).toUpperCase() + how[1].slice(1);
  }
  // Prefer prose before an inline code/JSON example.
  var cut = summary.search(/\\s+[\\\`{]/);
  var clipped = false;
  if (cut > 12) {
    summary = summary.slice(0, cut).replace(/[:\\s]+$/, '');
    clipped = true;
  }
  if (/\\s+(a|an|the|by|with|to|for|of|in|on|from)\\s*$/i.test(summary)) {
    summary = summary.replace(/\\s+(a|an|the|by|with|to|for|of|in|on|from)\\s*$/i, '');
    clipped = true;
  }
  if (summary.length > 160) {
    summary = summary.slice(0, 157);
    clipped = true;
  }
  if (clipped) summary = summary.replace(/[\\s:;,.\\-]+$/, '') + '\\u2026';

  return { title: title, summary: summary, steps: steps, tools: tools };
}

var SKILLS_PAGE_SIZE = 10;
var skillsPage = 0;
var skillsList = [];

function renderSkillItem(s) {
  var preview = skillPreview(s.content, s.name);
  var card = el('div', 'skillitem');
  var top = el('div', 'skillitem-top');
  top.appendChild(el('div', 'skillitem-name', preview.title));
  card.appendChild(top);
  card.appendChild(el('span', 'src ' + s.source, s.source));
  if (preview.title !== s.name) card.appendChild(el('div', 'skillitem-slug', s.name));
  if (preview.summary) card.appendChild(el('div', 'skillitem-desc', preview.summary));

  var meta = el('div', 'skillitem-meta');
  preview.tools.forEach(function (tool) {
    meta.appendChild(el('span', 'chip', tool));
  });
  if (s.files > 1) meta.appendChild(el('span', null, s.files + ' files'));
  else if (preview.steps) meta.appendChild(el('span', null, preview.steps + ' steps'));
  if (s.hasScripts) meta.appendChild(el('span', 'chip', 'scripts'));
  if (meta.childNodes.length) card.appendChild(meta);

  card.onclick = function () { openSkill(s.name); };
  return card;
}

function renderSkillsPage() {
  var box = document.getElementById('skillItems');
  var pager = document.getElementById('skillsPager');
  var meta = document.getElementById('skillsPagerMeta');
  var prev = document.getElementById('skillsPrev');
  var next = document.getElementById('skillsNext');
  var count = document.getElementById('skillsLibraryCount');
  if (!box) return;

  var total = skillsList.length;
  var pages = Math.max(1, Math.ceil(total / SKILLS_PAGE_SIZE));
  if (skillsPage >= pages) skillsPage = pages - 1;
  if (skillsPage < 0) skillsPage = 0;

  var start = skillsPage * SKILLS_PAGE_SIZE;
  var slice = skillsList.slice(start, start + SKILLS_PAGE_SIZE);
  box.innerHTML = '';
  slice.forEach(function (s) {
    box.appendChild(renderSkillItem(s));
  });

  if (count) {
    count.textContent = total
      ? total + ' skill' + (total === 1 ? '' : 's')
      : '';
  }

  if (pager) {
    if (total <= SKILLS_PAGE_SIZE) {
      pager.hidden = true;
    } else {
      pager.hidden = false;
      var from = start + 1;
      var to = start + slice.length;
      if (meta) meta.textContent = from + '\\u2013' + to + ' of ' + total;
      if (prev) prev.disabled = skillsPage <= 0;
      if (next) next.disabled = skillsPage >= pages - 1;
    }
  }
}

function skillsPageDelta(delta) {
  skillsPage += delta;
  renderSkillsPage();
  var list = document.querySelector('#viewSkills .skilllist');
  if (list && list.scrollIntoView) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadSkills() {
  fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
    skills = list;
    skillsList = Array.isArray(list) ? list : [];
    if (skillsPage * SKILLS_PAGE_SIZE >= skillsList.length) skillsPage = 0;
    renderSkillsPage();
  });
}

function onSkillUpload(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    var b64 = String(reader.result).split(',')[1];
    fetch('/api/skills/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: file.name, dataBase64: b64 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) {
        openSkill(null);
        document.getElementById('skillMsg').textContent = d.error;
        return;
      }
      var imported = d.imported || [];
      var first = imported[0];
      if (first) openSkill(first);
      else {
        loadSkills();
        nav('skills');
      }
      if (imported.length) {
        var msg = document.getElementById('skillMsg');
        if (msg) msg.textContent = 'imported: ' + imported.join(', ');
      }
    });
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function fillSkillMeta(s) {
  var content = (s && s.content) || document.getElementById('skillContent').value || '';
  var name = (s && s.name) || document.getElementById('skillName').value.trim() || '';
  var source = (s && s.source) || 'new';
  var preview = skillPreview(content, name || 'New skill');
  var titleEl = document.getElementById('skillTitle');
  if (titleEl) titleEl.textContent = name ? preview.title : 'New skill';

  var meta = document.getElementById('skillMeta');
  if (!meta) return;
  meta.innerHTML = '';
  if (name) meta.appendChild(el('span', 'mono', name));
  meta.appendChild(el('span', 'src ' + source, source));
  preview.tools.forEach(function (tool) {
    meta.appendChild(el('span', 'chip', tool));
  });
  if (s && s.files) meta.appendChild(el('span', null, s.files + (s.files === 1 ? ' file' : ' files')));
  if (s && s.hasScripts) meta.appendChild(el('span', 'chip', 'scripts'));
  if (preview.steps) meta.appendChild(el('span', null, preview.steps + ' steps'));
}

function renderSkillTree(tree) {
  var box = document.getElementById('skillTree');
  if (!box) return;
  box.innerHTML = '';
  var entries = tree && tree.length ? tree : [{ path: 'SKILL.md', kind: 'file', editable: true }];
  var hasFile = false;
  entries.forEach(function (entry) {
    if (entry.kind === 'dir') {
      var depth = entry.path.split('/').length - 1;
      var row = el('div', 'skill-tree-item dir');
      row.style.paddingLeft = (0.55 + depth * 0.75) + 'rem';
      row.appendChild(el('span', 'ico', '\\u25be'));
      row.appendChild(el('span', 'name', entry.path.split('/').pop()));
      box.appendChild(row);
      return;
    }
    hasFile = true;
    var depthF = entry.path.split('/').length - 1;
    var btn = el('button', 'skill-tree-item' + (entry.path === skillFilePath ? ' on' : ''));
    btn.type = 'button';
    btn.style.paddingLeft = (0.55 + depthF * 0.75) + 'rem';
    btn.appendChild(el('span', 'ico', entry.editable ? '\\u25a1' : '\\u25a0'));
    btn.appendChild(el('span', 'name', entry.path.split('/').pop()));
    btn.title = entry.path;
    btn.onclick = function () { selectSkillFile(entry.path, entry.editable !== false); };
    box.appendChild(btn);
  });
  if (!hasFile) box.appendChild(el('div', 'skill-tree-empty', 'No files yet'));
}

function setSkillEditorMode(editable) {
  var ta = document.getElementById('skillContent');
  var note = document.getElementById('skillBinaryNote');
  if (editable) {
    ta.classList.remove('hidden');
    ta.disabled = false;
    note.classList.remove('on');
  } else {
    ta.classList.add('hidden');
    note.classList.add('on');
  }
}

function selectSkillFile(relPath, editable) {
  if (skillDirty && !confirm('Discard unsaved changes?')) return;
  skillFilePath = relPath || 'SKILL.md';
  skillDirty = false;
  document.getElementById('skillFileLabel').textContent = skillFilePath;
  renderSkillTree((skills.filter(function (x) { return x.name === selectedSkill; })[0] || {}).tree);

  if (editable === false) {
    setSkillEditorMode(false);
    document.getElementById('skillMsg').textContent = 'Binary / unsupported file \\u2014 packaged with the skill for agents to use.';
    return;
  }
  setSkillEditorMode(true);

  var name = selectedSkill || document.getElementById('skillName').value.trim();
  if (!name) {
    document.getElementById('skillContent').value = skillFilePath === 'SKILL.md' ? '' : '';
    return;
  }
  if (skillFilePath === 'SKILL.md') {
    var cached = skills.filter(function (x) { return x.name === name; })[0];
    if (cached) {
      document.getElementById('skillContent').value = cached.content;
      document.getElementById('skillMsg').textContent =
        cached.source === 'bundled' ? 'Bundled skill \\u2014 saving creates a workspace copy that overrides it.' : '';
      return;
    }
  }
  document.getElementById('skillMsg').textContent = 'Loading\\u2026';
  fetch('/api/skills/file?name=' + encodeURIComponent(name) + '&path=' + encodeURIComponent(skillFilePath))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) {
        document.getElementById('skillMsg').textContent = d.error;
        setSkillEditorMode(false);
        return;
      }
      document.getElementById('skillContent').value = d.content || '';
      document.getElementById('skillMsg').textContent =
        d.source === 'bundled' ? 'Bundled skill \\u2014 saving creates a workspace copy that overrides it.' : '';
      skillDirty = false;
    });
}

function showSkillEditor(s) {
  selectedSkill = s ? s.name : null;
  skillFilePath = 'SKILL.md';
  skillDirty = false;
  var name = s ? s.name : '';
  var content = s ? s.content : '';
  var source = s ? s.source : 'new';

  document.getElementById('skillName').value = name;
  document.getElementById('skillName').disabled = !!name;
  document.getElementById('skillContent').value = content;
  document.getElementById('skillSrc').textContent = source;
  document.getElementById('skillSrc').className = 'src ' + source;
  document.getElementById('skillDelete').style.display = source === 'workspace' ? '' : 'none';
  document.getElementById('skillAddFile').style.display = name ? '' : 'none';
  document.getElementById('skillFileLabel').textContent = 'SKILL.md';
  document.getElementById('skillMsg').textContent =
    source === 'bundled' ? 'Bundled skill \\u2014 saving creates a workspace copy that overrides it.'
      : (source === 'new' ? 'Create SKILL.md first; then you can add scripts and subfolders.' : '');
  setSkillEditorMode(true);
  fillSkillMeta(s || { name: name, source: source, content: content, files: 1, hasScripts: false, tree: [{ path: 'SKILL.md', kind: 'file', editable: true }] });
  renderSkillTree(s && s.tree ? s.tree : [{ path: 'SKILL.md', kind: 'file', editable: true }]);
}

function openSkill(name) {
  view = 'skill';
  ['home', 'company', 'plan', 'skills', 'skill'].forEach(function (x) {
    var m = document.getElementById('view' + x.charAt(0).toUpperCase() + x.slice(1));
    if (m) m.className = x === 'skill' ? 'on' : '';
  });
  syncFooterVisibility();

  if (!name) {
    selectedSkill = null;
    routeTo('/skills/new');
    document.title = 'ai-company-os \\u00b7 new skill';
    showSkillEditor(null);
    return;
  }

  function apply(s) {
    if (!s) {
      routeTo('/skills/' + encodeURIComponent(name));
      document.title = 'ai-company-os \\u00b7 skill: ' + name;
      showSkillEditor({ name: name, source: 'workspace', content: '', files: 0, hasScripts: false, tree: [] });
      document.getElementById('skillMsg').textContent = 'Skill not found';
      return;
    }
    routeTo('/skills/' + encodeURIComponent(s.name));
    document.title = 'ai-company-os \\u00b7 skill: ' + s.name;
    showSkillEditor(s);
  }

  var cached = skills.filter(function (x) { return x.name === name; })[0];
  if (cached) {
    apply(cached);
    return;
  }
  showSkillEditor({ name: name, source: 'bundled', content: '', files: 1, hasScripts: false, tree: [{ path: 'SKILL.md', kind: 'file', editable: true }] });
  document.getElementById('skillMsg').textContent = 'Loading\\u2026';
  fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
    skills = list;
    apply(list.filter(function (x) { return x.name === name; })[0]);
  });
}

function addSkillFile() {
  var name = selectedSkill || document.getElementById('skillName').value.trim();
  if (!name) {
    document.getElementById('skillMsg').textContent = 'Save SKILL.md first to create the skill folder';
    return;
  }
  var rel = prompt('New file path (e.g. scripts/verify.py or templates/report.md)', 'scripts/helper.py');
  if (!rel) return;
  rel = String(rel).replace(/^\\/+/, '').replace(/\\\\/g, '/');
  if (!rel || rel.indexOf('..') >= 0) {
    document.getElementById('skillMsg').textContent = 'invalid path';
    return;
  }
  var stub = /\\.py$/i.test(rel) ? '# ' + rel + '\\n\\n' : (/\\.md$/i.test(rel) ? '# ' + rel + '\\n\\n' : '');
  fetch('/api/skills/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: name, path: rel, content: stub })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { document.getElementById('skillMsg').textContent = d.error; return; }
    selectedSkill = d.name;
    document.getElementById('skillSrc').textContent = 'workspace';
    document.getElementById('skillSrc').className = 'src workspace';
    document.getElementById('skillDelete').style.display = '';
    document.getElementById('skillName').disabled = true;
    fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
      skills = list;
      var s = list.filter(function (x) { return x.name === d.name; })[0];
      if (s) fillSkillMeta(s);
      renderSkillTree(s ? s.tree : []);
      skillFilePath = d.path || rel;
      skillDirty = false;
      selectSkillFile(skillFilePath, true);
      document.getElementById('skillMsg').textContent = 'created ' + skillFilePath;
    });
  });
}

function saveSkillEdit() {
  var name = document.getElementById('skillName').value.trim();
  var content = document.getElementById('skillContent').value;
  if (!name) return;
  if (document.getElementById('skillContent').classList.contains('hidden')) {
    document.getElementById('skillMsg').textContent = 'This file is not editable';
    return;
  }
  var path = skillFilePath || 'SKILL.md';
  fetch('/api/skills/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: name, path: path, content: content })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { document.getElementById('skillMsg').textContent = d.error; return; }
    selectedSkill = d.name;
    skillDirty = false;
    routeTo('/skills/' + encodeURIComponent(d.name));
    document.title = 'ai-company-os \\u00b7 skill: ' + d.name;
    document.getElementById('skillMsg').textContent = 'saved ' + (d.path || path) + ' \\u2713';
    document.getElementById('skillSrc').textContent = 'workspace';
    document.getElementById('skillSrc').className = 'src workspace';
    document.getElementById('skillDelete').style.display = '';
    document.getElementById('skillName').disabled = true;
    document.getElementById('skillAddFile').style.display = '';
    fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
      skills = list;
      var s = list.filter(function (x) { return x.name === d.name; })[0];
      if (s) {
        if (path === 'SKILL.md') s.content = content;
        fillSkillMeta(s);
        renderSkillTree(s.tree);
      }
    });
  });
}

function deleteSkillEdit() {
  var name = document.getElementById('skillName').value.trim();
  if (!confirm('Delete workspace skill "' + name + '" and all of its files?')) return;
  fetch('/api/skills/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: name })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) { document.getElementById('skillMsg').textContent = d.error; return; }
    selectedSkill = null;
    skillFilePath = 'SKILL.md';
    nav('skills');
  });
}

document.getElementById('skillContent').addEventListener('input', function () {
  skillDirty = true;
});

`;
