/** Initial boot / polling */
export const BOOT = `// ---------- boot ----------

fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
  cfg = c;
  initRoles();
  if (view === 'home') updateHomeSkillsLink();
});
initPlanChatComposer();
initPlanBar();
renderFooter();
renderCoPinnedTools();
applyRoute(location.pathname || '/');
setInterval(refresh, 2500);`;
