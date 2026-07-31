/** URL router and view navigation */
export const ROUTER = `// ---------- router: every view has a real, deep-linkable URL ----------
// /  /company/<slug>  /plan/new  /plan/<slug>  /skills  /skills/new  /skills/<name>

var routing = false;

function routeTo(path) {
  if (!routing && location.pathname !== path) history.pushState({}, '', path);
}

function applyRoute(path) {
  routing = true;
  try {
    var m;
    if ((m = path.match(/^\\/company\\/([^\\/]+)/))) openCompany(decodeURIComponent(m[1]));
    else if (path === '/plan/new' || path === '/plan') openPlan(null);
    else if ((m = path.match(/^\\/plan\\/([^\\/]+)/))) openPlan(decodeURIComponent(m[1]));
    else if (path === '/skills/new') openSkill(null);
    else if ((m = path.match(/^\\/skills\\/([^\\/]+)/))) openSkill(decodeURIComponent(m[1]));
    else if (path === '/skills' || path.indexOf('/skills') === 0) nav('skills');
    else nav('home');
  } finally { routing = false; }
}

window.addEventListener('popstate', function () { applyRoute(location.pathname); });

function syncFooterVisibility() {
  document.body.classList.toggle('footer-on', view === 'company' || view === 'plan');
}

function nav(v) {
  view = v;
  ['home', 'company', 'plan', 'skills', 'skill'].forEach(function (x) {
    var m = document.getElementById('view' + x.charAt(0).toUpperCase() + x.slice(1));
    if (m) m.className = x === v ? 'on' : '';
  });
  syncFooterVisibility();
  if (v === 'home') { routeTo('/'); document.title = 'AI Company OS'; loadHome(); }
  if (v === 'skills') { routeTo('/skills'); document.title = 'ai-company-os \\u00b7 skills'; loadSkills(); }
  if (v === 'plan') {
    var log = document.getElementById('planLog');
    if (!log.children.length) {
      planBotMsg('Welcome \\u2014 let\\u2019s plan your team. Describe what you want to accomplish: the outcome, any constraints, and what success looks like. When the plan is ready, you\\u2019ll launch a company with the proposed agent roster.');
    }
  }
  if (v === 'company') refresh();
}

`;
