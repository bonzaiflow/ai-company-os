/** Light/dark theme toggle */
export const THEME = `// ---------- theme (matches ai-company-os-site light/dark tokens) ----------

function currentDark() {
  var t = document.documentElement.getAttribute('data-theme');
  if (t) return t === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function syncThemeIcon() {
  var b = document.getElementById('themeBtn');
  if (b) b.textContent = currentDark() ? '\\u263e' : '\\u2600';
}

function clampThemeBtnPos(left, top, btn) {
  var pad = 8;
  var maxL = Math.max(pad, window.innerWidth - btn.offsetWidth - pad);
  var maxT = Math.max(pad, window.innerHeight - btn.offsetHeight - pad);
  return {
    left: Math.min(maxL, Math.max(pad, left)),
    top: Math.min(maxT, Math.max(pad, top))
  };
}

function applyThemeBtnPos(btn, left, top) {
  var pos = clampThemeBtnPos(left, top, btn);
  btn.classList.add('theme-pos');
  btn.style.left = pos.left + 'px';
  btn.style.top = pos.top + 'px';
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
  return pos;
}

function saveThemeBtnPos(left, top) {
  try { localStorage.setItem('aiCompanyOsThemeBtnPos', JSON.stringify({ left: left, top: top })); } catch (e) {}
}

function restoreThemeBtnPos() {
  var btn = document.getElementById('themeBtn');
  if (!btn) return;
  var raw = null;
  try { raw = localStorage.getItem('aiCompanyOsThemeBtnPos'); } catch (e) {}
  if (!raw) return;
  try {
    var p = JSON.parse(raw);
    if (typeof p.left === 'number' && typeof p.top === 'number') applyThemeBtnPos(btn, p.left, p.top);
  } catch (e) {}
}

function initThemeBtnDrag() {
  var btn = document.getElementById('themeBtn');
  if (!btn || btn._themeDragBound) return;
  btn._themeDragBound = true;
  var drag = null;

  btn.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: btn.getBoundingClientRect().left,
      origTop: btn.getBoundingClientRect().top,
      moved: false
    };
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });

  btn.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      drag.moved = true;
      btn.classList.add('dragging');
    }
    if (!drag.moved) return;
    applyThemeBtnPos(btn, drag.origLeft + dx, drag.origTop + dy);
  });

  function endDrag(e) {
    if (!drag || (e.pointerId != null && e.pointerId !== drag.pointerId)) return;
    var wasDrag = drag.moved;
    var left = btn.getBoundingClientRect().left;
    var top = btn.getBoundingClientRect().top;
    btn.classList.remove('dragging');
    try { btn.releasePointerCapture(drag.pointerId); } catch (err) {}
    drag = null;
    if (wasDrag) {
      var pos = applyThemeBtnPos(btn, left, top);
      saveThemeBtnPos(pos.left, pos.top);
    } else {
      toggleTheme();
    }
  }

  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);

  window.addEventListener('resize', function () {
    if (!btn.classList.contains('theme-pos')) return;
    var r = btn.getBoundingClientRect();
    var pos = applyThemeBtnPos(btn, r.left, r.top);
    saveThemeBtnPos(pos.left, pos.top);
  });
}

function applyMermaidTheme() {
  if (typeof mermaid === 'undefined') return;
  var dark = currentDark();
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    themeVariables: dark ? {
      darkMode: true, background: '#141a22', primaryColor: '#141a22',
      primaryBorderColor: '#4a6178', primaryTextColor: '#e8edf4', lineColor: '#4a6178',
      fontFamily: 'DM Sans, sans-serif'
    } : {
      darkMode: false, background: '#ffffff', primaryColor: '#ffffff',
      primaryBorderColor: '#dbe1ea', primaryTextColor: '#0c0f14', lineColor: '#8b9cb3',
      fontFamily: 'DM Sans, sans-serif'
    }
  });
}

function toggleTheme() {
  var next = currentDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('aiCompanyOsTheme', next);
  syncThemeIcon();
  applyMermaidTheme();
}

(function initTheme() {
  var saved = localStorage.getItem('aiCompanyOsTheme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.setAttribute('data-theme', saved);
  }
  syncThemeIcon();
  restoreThemeBtnPos();
  initThemeBtnDrag();
  applyMermaidTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (!localStorage.getItem('aiCompanyOsTheme')) syncThemeIcon();
  });
})();

`;
