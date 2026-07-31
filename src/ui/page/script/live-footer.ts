/** Live tools status footer */
export const LIVE_FOOTER = `// ---------- live tools footer ----------

function toggleLive() {
  liveTools = !liveTools;
  localStorage.setItem('liveTools', liveTools ? '1' : '0');
  renderFooter();
  if (state) { renderOrg(state.agents); renderLiveStrip(); }
}

function renderFooter() {
  document.getElementById('liveSw').className = 'sw' + (liveTools ? ' on' : '');
  if (!liveTools) document.getElementById('liveStrip').textContent = '';
}

function liveToolFor(agent) {
  if (!state) return null;
  var now = Date.now();
  for (var i = state.audit.length - 1; i >= 0; i--) {
    var e = state.audit[i];
    if (e.agent !== agent) continue;
    if (now - Date.parse(e.ts) > 20000) return null;
    if (e.type.indexOf('tool.') === 0) return e.type.slice(5);
  }
  return null;
}

function renderLiveStrip() {
  if (!liveTools || view !== 'company' || !state) return;
  var strip = document.getElementById('liveStrip');
  strip.innerHTML = '';
  var running = state.tasks.filter(function (t) { return t.status === 'running'; });
  if (!running.length) {
    strip.appendChild(el('span', null, 'idle \\u2014 queue: ' + state.queue.length));
    return;
  }
  if (running.length > 1) {
    strip.appendChild(el('span', 'parallel', '\\u21c9 parallel \\u00d7' + running.length + '  '));
  }
  running.forEach(function (t) {
    strip.appendChild(el('span', 'hot', '\\u25b6 ' + t.id + ' ' + t.assignee + ' '));
    var tool = liveToolFor(t.assignee);
    if (tool) strip.appendChild(el('span', null, 'using ' + tool + ' '));
    var now = Date.now();
    for (var i = state.audit.length - 1; i >= 0; i--) {
      var e = state.audit[i];
      if (e.taskId === t.id && e.type.indexOf('tool.') === 0 && now - Date.parse(e.ts) < 20000) {
        strip.appendChild(el('span', null, (e.detail || '').slice(0, 80) + '  '));
        break;
      }
    }
  });
}

`;
