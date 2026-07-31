/** Single-page dashboard, embedded so packaging stays trivial.
 * Design system mirrors the BonzaiSoft "AI Company OS" app (ai-company-os/web):
 * same tokens (#0c0f14 bg, #141a22 surface), DM Sans + JetBrains Mono,
 * accent-barred cards, tinted rank/status pills, pill tabs, glow gradients.
 * Client JS deliberately avoids template literals so this file can wrap it
 * in one. */
export const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Company OS</title>
<script>(function(){var t=localStorage.getItem('aiCompanyOsTheme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);})();</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script src="/vendor/cytoscape.min.js"></script>
<script src="/vendor/cytoscape-dagre.js"></script>
<style>
:root {
  /* dark is the default (matches ai-company-os-site) */
  --bg: #0c0f14;
  --surface: #141a22;
  --border: #252d3a;
  --text: #e8edf4;
  --muted: #8b9cb3;
  --line: #4a6178;
  --blue: #2563eb;
  --blue-bright: #60a5fa;
  --chief: #eab308;
  --mgr: #d946ef;
  --wkr: #3b82f6;
  --ok: #4ade80;
  --glow: rgba(96, 165, 250, 0.14);
  --link-strong: #93c5fd;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    --bg: #f4f6fa;
    --surface: #ffffff;
    --border: #dbe1ea;
    --text: #0c0f14;
    --muted: #55627a;
    --line: #8b9cb3;
    --glow: rgba(37, 99, 235, 0.10);
    --link-strong: #1d4ed8;
    color-scheme: light;
  }
}
:root[data-theme="light"] {
  --bg: #f4f6fa;
  --surface: #ffffff;
  --border: #dbe1ea;
  --text: #0c0f14;
  --muted: #55627a;
  --line: #8b9cb3;
  --glow: rgba(37, 99, 235, 0.10);
  --link-strong: #1d4ed8;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --bg: #0c0f14;
  --surface: #141a22;
  --border: #252d3a;
  --text: #e8edf4;
  --muted: #8b9cb3;
  --line: #4a6178;
  --glow: rgba(96, 165, 250, 0.14);
  --link-strong: #93c5fd;
  color-scheme: dark;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "DM Sans", system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.45;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -20%, var(--glow), transparent),
    radial-gradient(ellipse 60% 40% at 100% 100%, rgba(34, 197, 94, 0.06), transparent);
  transition: background-color 0.3s, color 0.3s;
}
button { font: inherit; cursor: pointer; }
.backlink {
  display: inline-block; background: none; border: 0; color: var(--muted);
  font-size: 0.78rem; padding: 0; margin-bottom: 0.35rem; cursor: pointer;
}
.backlink:hover { color: var(--text); }
select, input[type=text], textarea {
  font: inherit; background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.6rem;
}
select:focus, input:focus, textarea:focus { outline: none; border-color: var(--muted); }
.mono { font-family: "JetBrains Mono", monospace; }

.bars { display: flex; gap: 0.7rem; font-size: 0.72rem; color: var(--muted); flex-shrink: 0; align-items: flex-start; }
.bar { width: 200px; }
.bar .num { font-family: "JetBrains Mono", monospace; color: var(--text); font-size: 0.8rem; }
.bar .track { height: 4px; background: var(--bg); border: 1px solid var(--border); border-radius: 3px; margin-top: 4px; }
.bar .fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, #2563eb, #60a5fa); max-width: 100%; transition: width 0.5s ease; }
.bar.depleted .num { color: #f87171; }
.bar.depleted .fill { background: #ef4444; }
.grant-btn {
  font-size: 0.7rem; padding: 0.24rem 0.65rem; border-radius: 999px;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted); margin-top: 0.15rem;
  position: relative; transition: color 0.15s, border-color 0.15s, box-shadow 0.15s, background 0.15s;
}
.grant-btn:hover { color: #4ade80; border-color: rgba(34, 197, 94, 0.5); }
.grant-btn.data-fresh {
  color: #4ade80; border-color: color-mix(in srgb, #4ade80 55%, var(--border));
  background: color-mix(in srgb, #4ade80 10%, var(--bg));
  animation: data-btn-pulse 1.6s ease-in-out infinite;
}
.grant-btn.data-fresh::after {
  content: ""; position: absolute; top: -2px; right: -2px;
  width: 0.45rem; height: 0.45rem; border-radius: 50%; background: #4ade80;
  box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.5);
  animation: data-btn-dot 1.6s ease-in-out infinite;
}
@keyframes data-btn-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  50% { box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.18); }
}
@keyframes data-btn-dot {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.45); }
  50% { transform: scale(1.15); box-shadow: 0 0 0 5px rgba(74, 222, 128, 0); }
}
.statsrow { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.85rem; }
.statchip {
  background: var(--surface); border: 1px solid var(--border); border-radius: 999px;
  padding: 0.35rem 0.85rem; font-size: 0.78rem; color: var(--muted);
}
.statchip b { color: var(--text); font-weight: 600; font-family: "JetBrains Mono", monospace; }

/* Home hierarchy */
#viewSkills > section,
#viewSkill > section { max-width: 1200px; margin: 0 auto; width: 100%; }
#viewHome { position: relative; }
#viewHome > section { width: 100%; margin: 0 auto; }
#viewHome.home-directory > #homeDirectory { max-width: none; padding: 0; }
#viewHome.home-welcome > #homeWelcome { max-width: none; padding: 0; }
#viewHome.home-welcome > #homeDirectory,
#viewHome.home-directory > #homeWelcome { display: none !important; }

.sec-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem;
  margin: 1.25rem 0 0.7rem;
}
.sec-row .sec { margin: 0; }
.sec-link {
  border: 0; background: none; padding: 0; cursor: pointer; font-family: inherit;
  color: var(--muted); font-size: 0.72rem;
}
.sec-link:hover { color: var(--text); }

.home-lane[hidden], .home-block[hidden], .home-dir-section[hidden] { display: none !important; }

/* Directory — holding portfolio */
#homeDirectory {
  min-height: 100%;
  position: relative;
  overflow-x: hidden;
  background: transparent;
}
#homeDirectory::before {
  content: ""; position: absolute; inset: -15% 20% auto -10%; height: 42%;
  background: radial-gradient(ellipse 60% 50% at 30% 40%, var(--glow), transparent 72%);
  pointer-events: none; z-index: 0;
}
#homeDirectory::after {
  content: ""; position: absolute; inset: auto -10% -20% 40%; height: 40%;
  background: radial-gradient(ellipse 50% 45% at 70% 50%, rgba(34, 197, 94, 0.06), transparent 70%);
  pointer-events: none; z-index: 0;
}
.home-dir-shell {
  position: relative; z-index: 1;
  max-width: 1080px; margin: 0 auto;
  padding: 1.75rem clamp(1.25rem, 3.5vw, 2.5rem) 3.5rem;
}

.home-dir-mast {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 1rem 1.5rem; flex-wrap: wrap; margin-bottom: 2.25rem;
}
.home-dir-mast-main { min-width: 0; display: flex; flex-direction: column; gap: 0.65rem; }
.home-dir-brand {
  font-size: clamp(1.85rem, 3.6vw, 2.55rem); font-weight: 700;
  letter-spacing: -0.045em; line-height: 1.05; color: var(--text);
}
.home-dir-mast-actions {
  display: flex; align-items: center; gap: 1rem; flex-shrink: 0; padding-top: 0.35rem;
}
.home-workspace.home-workspace-inline {
  align-self: flex-start; max-width: min(100%, 36rem);
}
.home-workspace.home-workspace-inline .home-workspace-path { max-width: 22rem; }

.home-dir-pulse {
  margin-bottom: 2.5rem;
  animation: home-lane-in 0.4s ease;
}
@keyframes home-lane-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}
.home-dir-title {
  font-size: clamp(1.35rem, 2.4vw, 1.75rem); font-weight: 500;
  letter-spacing: -0.03em; line-height: 1.2; color: var(--text);
}
.home-dir-metrics {
  display: flex; flex-wrap: wrap; gap: 1.25rem 2rem; margin-top: 1.1rem;
  padding-top: 1.1rem; border-top: 1px solid var(--border);
}
.home-metric { min-width: 0; }
.home-metric .k {
  font-family: "JetBrains Mono", monospace; font-size: 0.62rem; font-weight: 600;
  letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted);
}
.home-metric .v {
  margin-top: 0.25rem; font-family: "JetBrains Mono", monospace;
  font-size: 1.15rem; font-weight: 500; color: var(--text); letter-spacing: -0.02em;
}
.home-metric.depleted .v { color: #f87171; }
.home-metric.live .v { color: #fbbf24; }

.home-dir-section { margin-top: 2.75rem; }
.home-dir-section-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 0.75rem; margin-bottom: 0.85rem;
}
.home-dir-section-label {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
.home-dir-section-count {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
}

/* Workspace path control */
.home-workspace {
  display: inline-flex; align-items: center; gap: 0.55rem; max-width: 100%;
  border: 1px solid var(--border); background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--muted); border-radius: 999px; padding: 0.35rem 0.75rem 0.35rem 0.85rem;
  cursor: pointer; font: inherit; text-align: left; transition: border-color 0.18s, background 0.18s, color 0.18s;
}
.home-workspace:hover {
  border-color: color-mix(in srgb, var(--blue) 45%, var(--border));
  color: var(--text); background: color-mix(in srgb, var(--blue) 8%, var(--surface));
}
.home-workspace-label {
  font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--blue-bright); flex-shrink: 0;
}
.home-workspace-path {
  font-family: "JetBrains Mono", monospace; font-size: 0.72rem; color: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 28rem;
}
.home-workspace-change {
  font-size: 0.68rem; font-weight: 600; color: var(--blue-bright); flex-shrink: 0;
  border-left: 1px solid var(--border); padding-left: 0.55rem;
}
#viewHome .page-head-actions .home-workspace { max-width: min(100%, 22rem); }

/* Welcome hero */
#homeWelcome {
  min-height: 100%;
  position: relative;
  overflow: hidden;
  background: transparent;
}
#homeWelcome::before {
  content: ""; position: absolute; inset: -20% -10% auto -10%; height: 70%;
  background: radial-gradient(ellipse 70% 55% at 70% 40%, var(--glow), transparent 70%);
  pointer-events: none; z-index: 0;
  animation: home-glow-drift 16s ease-in-out infinite alternate;
}
#homeWelcome::after {
  content: ""; position: absolute; inset: auto -10% -15% -10%; height: 55%;
  background: radial-gradient(ellipse 50% 45% at 15% 60%, rgba(34, 197, 94, 0.08), transparent 70%);
  pointer-events: none; z-index: 0;
  animation: home-glow-drift 18s ease-in-out infinite alternate-reverse;
}
#homeWelcome > * { position: relative; z-index: 1; }
@keyframes home-glow-drift {
  from { transform: translate3d(0, 0, 0) scale(1); opacity: 0.85; }
  to { transform: translate3d(-2%, 3%, 0) scale(1.06); opacity: 1; }
}
.home-hero {
  display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: 2rem 3rem; align-items: center;
  min-height: min(88vh, 720px); padding: 3.5rem clamp(1.25rem, 4vw, 4rem) 2.5rem;
  max-width: 1180px; margin: 0 auto;
}
.home-hero-copy { min-width: 0; }
.home-brand {
  font-size: clamp(2.4rem, 5.2vw, 3.75rem); font-weight: 700; letter-spacing: -0.045em;
  line-height: 1.05; color: var(--text);
  opacity: 0; transform: translateY(14px); animation: home-rise 0.7s ease forwards;
}
.home-headline {
  margin-top: 1.1rem; font-size: clamp(1.35rem, 2.6vw, 1.85rem); font-weight: 500;
  letter-spacing: -0.03em; line-height: 1.25; color: var(--text);
  opacity: 0; transform: translateY(14px); animation: home-rise 0.7s ease 0.1s forwards;
}
.home-lead {
  margin-top: 0.85rem; font-size: 1.02rem; line-height: 1.55; color: var(--muted); max-width: 34rem;
  opacity: 0; transform: translateY(14px); animation: home-rise 0.7s ease 0.18s forwards;
}
.home-cta-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.85rem 1.25rem; margin-top: 1.75rem;
  opacity: 0; transform: translateY(14px); animation: home-rise 0.7s ease 0.26s forwards;
}
.home-cta {
  font-size: 0.95rem; padding: 0.72rem 1.35rem; border-radius: 999px;
  box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35);
  animation: home-cta-pulse 2.8s ease-in-out 1s infinite;
}
@keyframes home-cta-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
  50% { box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.12); }
}
.home-link {
  border: 0; background: none; padding: 0; color: var(--muted); font: inherit; font-size: 0.9rem;
  cursor: pointer; text-decoration: none;
}
.home-link:hover { color: var(--blue-bright); }
#homeWelcome .home-workspace {
  margin-top: 1.6rem; opacity: 0; transform: translateY(14px);
  animation: home-rise 0.7s ease 0.34s forwards;
}
@keyframes home-rise {
  to { opacity: 1; transform: none; }
}

.home-hero-visual {
  position: relative; min-height: 320px; display: flex; align-items: center; justify-content: center;
  opacity: 0; animation: home-rise 0.9s ease 0.2s forwards;
}
.home-constellation {
  width: min(100%, 420px); height: auto; overflow: visible;
}
.home-constellation .link {
  stroke: color-mix(in srgb, var(--blue-bright) 35%, var(--border));
  stroke-width: 1.25; fill: none;
}
.home-constellation .node {
  transform-box: fill-box; transform-origin: center;
  animation: home-node-pulse 3.2s ease-in-out infinite;
}
.home-constellation .node.chief { animation-delay: 0s; }
.home-constellation .node.mgr { animation-delay: 0.45s; }
.home-constellation .node.wkr { animation-delay: 0.9s; }
.home-constellation .halo {
  fill: none; stroke-opacity: 0.35;
  animation: home-halo 3.2s ease-in-out infinite;
}
@keyframes home-node-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}
@keyframes home-halo {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.75; }
}
.home-constellation .label {
  fill: var(--muted); font-family: "JetBrains Mono", monospace; font-size: 9px;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.home-constellation .disk { stroke-width: 1.4; }
.home-constellation .disk.chief { fill: color-mix(in srgb, #eab308 22%, var(--surface)); stroke: #eab308; }
.home-constellation .disk.mgr { fill: color-mix(in srgb, #d946ef 20%, var(--surface)); stroke: #d946ef; }
.home-constellation .disk.wkr { fill: color-mix(in srgb, #3b82f6 22%, var(--surface)); stroke: #3b82f6; }
.home-constellation .core.chief { fill: #eab308; }
.home-constellation .core.mgr { fill: #d946ef; }
.home-constellation .core.wkr { fill: #3b82f6; }

.home-below {
  max-width: 1180px; margin: 0 auto; padding: 0 clamp(1.25rem, 4vw, 4rem) 4rem;
}
.home-steps {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.75rem 2.5rem; padding: 2rem 0 2.75rem;
  border-top: 1px solid var(--border);
}
.home-step { min-width: 0; }
.home-step-num {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--blue-bright);
}
.home-step-title {
  margin-top: 0.45rem; font-size: 1.05rem; font-weight: 600; letter-spacing: -0.02em;
  padding-bottom: 0.55rem; display: inline-block;
  box-shadow: inset 0 -2px 0 0 #2563eb;
}
.home-step-body {
  margin-top: 0.65rem; color: var(--muted); font-size: 0.88rem; line-height: 1.5; max-width: 22rem;
}
.home-welcome-skills { padding-top: 0.5rem; }
.home-welcome-skills .sec-row { margin-top: 0; }

@media (max-width: 900px) {
  .home-hero {
    grid-template-columns: 1fr; min-height: auto; padding-top: 2.5rem; gap: 1.5rem;
  }
  .home-hero-visual { min-height: 240px; order: -1; }
  .home-constellation { width: min(100%, 300px); }
  .home-steps { grid-template-columns: 1fr; gap: 1.4rem; }
  .home-workspace-path { max-width: 12rem; }
}
@media (prefers-reduced-motion: reduce) {
  #homeWelcome::before, #homeWelcome::after,
  .home-brand, .home-headline, .home-lead, .home-cta-row,
  #homeWelcome .home-workspace, .home-hero-visual, .home-cta,
  .home-constellation .node, .home-constellation .halo,
  .home-dir-pulse, .corow.running .corow-signal {
    animation: none !important; opacity: 1 !important; transform: none !important;
  }
}

/* Workspace picker modal */
.ws-picker { display: flex; flex-direction: column; gap: 0.85rem; }
.ws-picker-path {
  display: flex; gap: 0.5rem; align-items: center;
}
.ws-picker-path input {
  flex: 1; min-width: 0; font-family: "JetBrains Mono", monospace; font-size: 0.78rem;
}
.ws-picker-nav {
  display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
}
.ws-picker-crumb {
  border: 0; background: none; padding: 0; color: var(--muted); font: inherit;
  font-family: "JetBrains Mono", monospace; font-size: 0.72rem; cursor: pointer;
}
.ws-picker-crumb:hover { color: var(--blue-bright); }
.ws-picker-list {
  border: 1px solid var(--border); border-radius: 10px; background: var(--bg);
  max-height: 280px; overflow-y: auto; scrollbar-width: thin;
}
.ws-picker-item {
  display: flex; width: 100%; align-items: center; gap: 0.55rem;
  border: 0; border-bottom: 1px solid var(--border); background: transparent;
  color: var(--text); padding: 0.55rem 0.75rem; font: inherit; font-size: 0.85rem;
  cursor: pointer; text-align: left;
}
.ws-picker-item:last-child { border-bottom: 0; }
.ws-picker-item:hover { background: color-mix(in srgb, var(--blue) 10%, var(--bg)); }
.ws-picker-item .ico { color: var(--blue-bright); font-size: 0.9rem; }
.ws-picker-empty { padding: 1.25rem; color: var(--muted); font-size: 0.82rem; text-align: center; }
.ws-picker-status {
  font-family: "JetBrains Mono", monospace; font-size: 0.7rem; color: var(--muted);
}
.ws-picker-status.ready { color: #4ade80; }
.ws-picker-actions { display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: flex-end; margin-top: 0.25rem; }
.ws-picker-err { color: #f87171; font-size: 0.78rem; min-height: 1.1em; }

.home-portfolio {
  display: flex; flex-direction: column; gap: 0;
  border-top: 1px solid var(--border);
}
.corow {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.85rem 1.15rem; align-items: start;
  background: transparent; border: 0; border-bottom: 1px solid var(--border);
  border-radius: 0; border-left: 0; padding: 1.15rem 0.15rem 1.15rem 0;
  cursor: pointer; min-width: 0; height: auto;
  transition: background 0.18s ease, padding 0.18s ease;
}
.corow:hover {
  background: color-mix(in srgb, var(--blue) 6%, transparent);
  transform: none; box-shadow: none; border-color: var(--border);
  padding-left: 0.55rem; padding-right: 0.4rem;
}
.corow-signal {
  width: 0.55rem; height: 0.55rem; border-radius: 50%; margin-top: 0.45rem;
  background: var(--muted); flex-shrink: 0;
  box-shadow: 0 0 0 0 transparent;
}
.corow.running .corow-signal {
  background: #fbbf24; box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.14);
  animation: home-signal-pulse 1.6s ease-in-out infinite;
}
.corow.queued .corow-signal { background: #60a5fa; }
.corow.failed .corow-signal { background: #f87171; }
.corow.done .corow-signal { background: color-mix(in srgb, #4ade80 70%, var(--muted)); }
@keyframes home-signal-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.2); }
  50% { box-shadow: 0 0 0 7px rgba(251, 191, 36, 0); }
}
.corow-main { min-width: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.corow-top {
  display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem;
}
.corow-name {
  font-size: 1.12rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25;
}
.corow-status {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); flex-shrink: 0;
}
.corow.running .corow-status { color: #fbbf24; }
.corow.queued .corow-status { color: #60a5fa; }
.corow.failed .corow-status { color: #f87171; }
.corow.done .corow-status { color: color-mix(in srgb, #4ade80 80%, var(--muted)); }
.corow-goal {
  color: var(--muted); font-size: 0.88rem; line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  max-width: 42rem;
}
.corow-meta {
  display: flex; flex-wrap: wrap; gap: 0.35rem 0.9rem; align-items: center;
  font-size: 0.7rem; color: var(--muted); font-family: "JetBrains Mono", monospace;
  margin-top: 0.15rem;
}
.corow-ranks { display: flex; align-items: center; gap: 0; }
.corow-side {
  display: flex; flex-direction: column; align-items: flex-end; gap: 0.55rem;
  min-width: 7.5rem; padding-top: 0.15rem;
}
.corow-side .bar { width: 7.5rem; margin: 0; padding: 0; }
.corow-side .bar .lbl {
  display: flex; justify-content: space-between; font-size: 0.62rem; color: var(--muted); margin-bottom: 2px;
}
.corow-top-actions { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
.row-del {
  flex: 0 0 auto; border: 0; background: transparent; color: var(--muted);
  font-size: 1.05rem; line-height: 1; padding: 0.1rem 0.35rem; cursor: pointer;
  border-radius: 6px; opacity: 0.35;
}
.row-del:hover {
  opacity: 1; color: #f87171; background: rgba(248, 113, 113, 0.1);
}
@media (max-width: 720px) {
  .corow { grid-template-columns: auto minmax(0, 1fr); }
  .corow-side {
    grid-column: 2; align-items: stretch; min-width: 0; flex-direction: row;
    justify-content: space-between; align-items: center;
  }
  .corow-side .bar { width: min(100%, 10rem); }
}

.home-plans {
  display: flex; flex-direction: column; gap: 0; border-top: 1px solid var(--border);
}
.plan-chip {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 1rem;
  align-items: start; position: relative;
  background: transparent; border: 0; border-bottom: 1px solid var(--border);
  border-radius: 0; padding: 0.95rem 0.15rem; cursor: pointer;
  min-width: 0; max-width: none;
  transition: background 0.15s ease, padding 0.15s ease;
}
.plan-chip .row-del { position: static; }
.plan-chip.new {
  display: flex; padding: 0.95rem 0.15rem; min-width: 0; max-width: none;
  border-style: solid; justify-content: flex-start; background: transparent;
  color: var(--blue-bright); font-size: 0.9rem; font-weight: 600;
}
.plan-chip:hover {
  border-color: var(--border);
  background: color-mix(in srgb, var(--blue) 6%, transparent);
  transform: none; padding-left: 0.55rem; padding-right: 0.4rem;
}
.plan-chip .name {
  font-size: 0.98rem; font-weight: 600; letter-spacing: -0.015em;
  display: flex; align-items: center; gap: 0.5rem;
}
.plan-chip .goal {
  grid-column: 1; color: var(--muted); font-size: 0.82rem; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  max-width: 40rem;
}
.plan-chip .meta {
  grid-column: 1; font-size: 0.68rem; color: var(--muted);
  font-family: "JetBrains Mono", monospace; margin-top: 0;
}
.plan-chip .plan-chip-actions {
  grid-column: 2; grid-row: 1 / span 3; align-self: center;
}
.plan-chip.new:hover { color: var(--text); }

.skills-strip {
  display: flex; flex-wrap: wrap; gap: 0.55rem; align-items: stretch;
}
.skill-chip {
  display: flex; flex-direction: column; gap: 0.2rem;
  background: transparent; border: 1px solid var(--border); border-radius: 10px;
  padding: 0.55rem 0.8rem; cursor: pointer; min-width: 120px; max-width: 200px;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.skill-chip:hover {
  border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}
.skill-chip .name {
  font-size: 0.82rem; font-weight: 600; letter-spacing: -0.01em;
  display: flex; align-items: center; gap: 0.35rem; min-width: 0;
}
.skill-chip .name > span:not(.src) {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.skill-chip .meta {
  font-size: 0.65rem; color: var(--muted); font-family: "JetBrains Mono", monospace;
}
.skill-chip.more {
  align-items: center; justify-content: center; border-style: dashed;
  color: var(--muted); font-size: 0.8rem; min-width: 110px; max-width: 140px;
}
.skill-chip.more:hover { color: var(--text); }

main { display: none; height: 100vh; }
main.on { display: grid; }
body.footer-on main { height: calc(100vh - 44px); }
#viewHome, #viewSkills, #viewSkill { grid-template-columns: 1fr; overflow-y: auto; }
#viewCompany { grid-template-columns: 340px minmax(0, 1fr) 0fr; transition: grid-template-columns 0.28s ease; }
#viewCompany.agent-open { grid-template-columns: 340px minmax(0, 1fr) 420px; }
#viewCompany .agent-sidebar {
  overflow: hidden; min-width: 0; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease; border-left-color: transparent;
}
#viewCompany.agent-open .agent-sidebar {
  opacity: 1; pointer-events: auto; border-left-color: var(--border);
}
#viewPlan { grid-template-columns: 1fr 440px; }
#viewPlan > section:not(.sidebar) {
  padding-left: clamp(2rem, 6vw, 5rem);
  padding-right: clamp(2rem, 6vw, 5rem);
}
#viewPlan > section:not(.sidebar) .page-head,
#viewPlan > section:not(.sidebar) #planDoc,
#viewPlan > section:not(.sidebar) #planBar {
  max-width: 52rem;
  margin-left: auto;
  margin-right: auto;
  width: 100%;
}
section { overflow-y: auto; padding: 1.25rem 1.5rem; min-width: 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
section + section { border-left: 1px solid var(--border); }
section.sidebar { background: var(--surface); padding: 0; display: flex; flex-direction: column; }
.side-inner { padding: 1rem 1.1rem; overflow-y: auto; flex: 1; min-height: 0; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }

.eyebrow {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.12em; color: var(--muted); margin-bottom: 0.35rem;
}
.page-title { font-size: 1.45rem; font-weight: 600; letter-spacing: -0.02em; }
.subtitle { margin-top: 0.3rem; color: var(--muted); font-size: 0.85rem; max-width: 720px; }
.page-head { margin-bottom: 1.25rem; }
.page-head-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
.page-head-main { min-width: 0; flex: 1; }

#viewCompany .page-head-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.85rem;
}
#viewCompany .page-head-main { min-width: 0; width: 100%; }
#viewCompany .page-head-row .bars {
  flex-wrap: wrap;
  width: 100%;
  justify-content: flex-start;
}
#viewCompany .page-title {
  overflow-wrap: anywhere;
}
h2.sec {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--muted); margin: 1.25rem 0 0.7rem;
}
h2.sec:first-child { margin-top: 0; }
.plan-seg {
  position: relative; border-radius: 10px; margin: 0.15rem -0.45rem;
  padding: 0.1rem 0.45rem 0.35rem; cursor: grab;
  border: 1px solid transparent; transition: border-color 0.15s, background 0.15s;
}
.plan-seg:hover {
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  border-color: color-mix(in srgb, var(--border) 80%, transparent);
}
.plan-seg:active, .plan-seg.dragging { cursor: grabbing; }
.plan-seg.dragging {
  opacity: 0.55;
  border-color: color-mix(in srgb, #60a5fa 45%, var(--border));
  background: color-mix(in srgb, #3b82f6 8%, var(--surface));
}
.plan-seg > .sec { display: flex; align-items: center; gap: 0.45rem; margin-left: 0; margin-right: 0; }
.plan-seg > .sec .plan-seg-grip {
  font-size: 0.72rem; letter-spacing: -0.08em; color: var(--muted); opacity: 0.45;
  font-weight: 700; user-select: none;
}
.plan-seg:hover > .sec .plan-seg-grip { opacity: 0.9; color: #60a5fa; }
.plan-seg.plan-seg-item { margin-top: 0.35rem; padding-top: 0.35rem; padding-bottom: 0.35rem; }
.plan-seg.plan-seg-item .agentcard { margin: 0; }
.setup-chat-composer.drag-over {
  border-color: rgba(96, 165, 250, 0.65);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.18), 0 1px 2px rgba(0, 0, 0, 0.18);
}
.setup-chat-composer.drag-over textarea::placeholder { color: #60a5fa; }

.accentbar { height: 3px; background: linear-gradient(90deg, #2563eb, #60a5fa); }
.side-head { border-bottom: 1px solid var(--border); background: var(--bg); }
.side-head-body { padding: 0.85rem 1.1rem 0.95rem; }
.sidebar-header-top { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.sidebar-close {
  background: transparent; border: 1px solid var(--border); color: var(--muted);
  width: 2rem; height: 2rem; border-radius: 8px; font-size: 1.25rem; line-height: 1;
  cursor: pointer; flex-shrink: 0; transition: color 0.15s, border-color 0.15s;
}
.sidebar-close:hover { color: var(--text); border-color: var(--muted); }
.side-title { font-size: 1.1rem; font-weight: 600; letter-spacing: -0.02em; }

.tabs { display: flex; gap: 0.35rem; padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); overflow-x: auto; flex-wrap: wrap; }
.tab {
  background: var(--bg); border: 1px solid var(--border); color: var(--muted);
  font-size: 0.78rem; padding: 0.32rem 0.75rem; border-radius: 999px;
  white-space: nowrap; display: inline-flex; align-items: center; gap: 0.35rem;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease,
    transform 0.15s ease, box-shadow 0.15s ease;
}
.tab:hover {
  color: var(--text);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.tab.on {
  color: #60a5fa; background: color-mix(in srgb, var(--blue) 12%, var(--bg));
  border-color: color-mix(in srgb, var(--blue) 45%, var(--border));
}
.tab .count { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; opacity: 0.8; }
.tab .dot { width: 0.45rem; height: 0.45rem; border-radius: 50%; background: var(--wkr); }
.tab .dot.chief { background: var(--chief); } .tab .dot.manager { background: var(--mgr); }

.task {
  position: relative;
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 0.7rem 0.85rem; margin-bottom: 0.55rem;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.task:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.task.parallel {
  border-color: color-mix(in srgb, #60a5fa 45%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, #60a5fa 20%, transparent);
}
.task.parallel:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35), 0 0 0 1px color-mix(in srgb, #60a5fa 20%, transparent);
}
.task .parallel-tag {
  font-family: "JetBrains Mono", monospace; font-size: 0.6rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: #60a5fa; background: rgba(59, 130, 246, 0.12);
  border: 1px solid color-mix(in srgb, #60a5fa 35%, var(--border));
  border-radius: 4px; padding: 0.1em 0.4em;
}
#liveStrip .parallel { color: #60a5fa; }
#viewCompany section:not(.sidebar) .task, .agent-body .task { background: var(--surface); }
.task .id { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); }
.task .title { margin: 0.25rem 0; font-size: 0.85rem; line-height: 1.35; }
.task .task-prio-up {
  position: absolute; right: 0.45rem; bottom: 0.35rem;
  opacity: 0; pointer-events: none;
  border: none; background: transparent; color: var(--muted);
  padding: 0.1rem 0.35rem; font-size: 0.75rem; line-height: 1;
  border-radius: 4px; cursor: pointer;
  transition: opacity 0.15s ease, color 0.15s ease;
}
.task:hover .task-prio-up,
.task .task-prio-up:focus-visible {
  opacity: 1; pointer-events: auto;
}
.task .task-prio-up:hover,
.task .task-prio-up:focus-visible {
  color: var(--text);
}
.pill {
  font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.16em 0.5em; border-radius: 4px;
}
.pill.queued  { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.pill.running { background: rgba(251, 191, 36, 0.15); color: #fbbf24; }
.pill.waiting { background: rgba(217, 70, 239, 0.15); color: #e879f9; }
.pill.done    { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.pill.failed  { background: rgba(248, 113, 113, 0.15); color: #f87171; }
.pill.neutral { background: rgba(139, 156, 179, 0.15); color: var(--muted); }

.org { display: flex; flex-direction: column; align-items: center; padding-top: 0.5rem; }
.sub { display: flex; flex-direction: column; align-items: center; position: relative; }
.down { width: 1px; height: 16px; background: var(--line); margin-top: -7px; }
.kids { display: flex; justify-content: center; align-items: flex-start; }
.kids > .sub { padding-top: 16px; }
/* full connectors: rail across all siblings + drop into each card */
.kids > .sub::before { content: ""; position: absolute; top: 0; left: 50%; width: 1px; height: 16px; background: var(--line); }
.kids > .sub::after { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: var(--line); }
.kids > .sub:first-child::after { left: 50%; }
.kids > .sub:last-child::after { right: 50%; }
.kids > .sub:only-child::after { display: none; }
.org-card {
  position: relative; background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; min-width: 172px; max-width: 210px; overflow: hidden;
  margin: 7px 9px; cursor: pointer; text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.org-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.org-card.sel {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}
.org-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 18px color-mix(in srgb, var(--accent) 18%, transparent);
}
.org-card.sel.active {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 22px color-mix(in srgb, var(--accent) 22%, transparent);
}
.org-accent { height: 3px; background: var(--accent); }
.org-body { padding: 0.75rem 0.9rem 0.85rem; }
.org-rank {
  display: inline-block; font-size: 0.62rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 0.2em 0.5em; border-radius: 4px; margin-bottom: 0.45rem;
}
.org-rank.chief   { background: rgba(234, 179, 8, 0.15);  color: #fbbf24; }
.org-rank.manager { background: rgba(217, 70, 239, 0.15); color: #e879f9; }
.org-rank.worker  { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.org-name { font-size: 0.98rem; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.org-role { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); margin-top: 0.25rem; }
.org-tools {
  display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.55rem;
  padding-top: 0.5rem; border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
}
.chip {
  display: inline-block; font-family: "JetBrains Mono", monospace; font-size: 0.62rem;
  line-height: 1.2; padding: 0.15rem 0.38rem; border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  color: color-mix(in srgb, var(--muted) 85%, var(--text));
  opacity: 0.6;
}
.chip.skill { border-style: dashed; }
.chip.hot {
  opacity: 1; color: #4ade80;
  border-color: color-mix(in srgb, #4ade80 55%, var(--border));
  background: color-mix(in srgb, #4ade80 12%, var(--bg));
  animation: chip-pulse 1.4s ease-in-out infinite;
}
@keyframes chip-pulse {
  0%, 100% { box-shadow: 0 0 6px rgba(74, 222, 128, 0.18); }
  50% { box-shadow: 0 0 12px rgba(74, 222, 128, 0.35); }
}
.org-task-tag { font-family: "JetBrains Mono", monospace; font-size: 0.65rem; color: var(--accent); margin-top: 0.45rem; }

.evt { border-bottom: 1px solid var(--border); padding: 0.5rem 0; font-size: 0.78rem; }
.evt.action {
  cursor: pointer; border-radius: 8px; padding: 0.5rem 0.45rem; margin: 0 -0.45rem;
  border-bottom-color: transparent; border: 1px solid transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.evt.action:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.evt .type { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; background: var(--bg); border: 1px solid var(--border); padding: 0.1em 0.45em; border-radius: 4px; }
.evt .ok  { color: #4ade80; font-size: 0.65rem; font-weight: 600; margin-left: 0.4rem; }
.evt .err { color: #f87171; font-size: 0.65rem; font-weight: 600; margin-left: 0.4rem; }
.evt .detail {
  color: var(--muted); margin-top: 0.2rem; font-size: 0.74rem;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; word-break: break-word;
}
.evt .ts { color: var(--muted); font-size: 0.65rem; font-family: "JetBrains Mono", monospace; }
.audit-detail-block {
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 0.75rem 0.85rem; margin-bottom: 0.55rem;
}
.audit-detail-block .who {
  font-size: 0.62rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.35rem;
}
.audit-detail-block .body {
  font-size: 0.85rem; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}

pre.doc {
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 0.75rem; font-family: "JetBrains Mono", monospace; font-size: 0.7rem;
  white-space: pre-wrap; word-break: break-word; max-height: 340px; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
pre.doc.json {
  white-space: pre; word-break: normal; overflow-x: auto; line-height: 1.55;
  tab-size: 2; -moz-tab-size: 2;
}
pre.doc.json .jk { color: #60a5fa; }
pre.doc.json .js { color: #4ade80; }
pre.doc.json .jn { color: #fbbf24; }
pre.doc.json .jb { color: #e879f9; }
[data-theme="light"] pre.doc.json .jk { color: #2563eb; }
[data-theme="light"] pre.doc.json .js { color: #15803d; }
[data-theme="light"] pre.doc.json .jn { color: #a16207; }
[data-theme="light"] pre.doc.json .jb { color: #a21caf; }
.file {
  display: flex; justify-content: space-between; padding: 0.35rem 0.5rem; border-radius: 6px;
  font-family: "JetBrains Mono", monospace; font-size: 0.7rem; color: var(--muted); cursor: pointer;
}
.file:hover { background: var(--bg); color: var(--text); }
.muted { color: var(--muted); font-size: 0.8rem; }

.chatbox { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.agent-body.chat-mode { padding: 0; overflow: hidden; display: flex; flex-direction: column; }

.setup-chat-status { margin: 0; font-size: 0.85rem; color: var(--muted); }
.setup-chat-archive {
  display: flex; flex-direction: column; gap: 1rem;
  padding-bottom: 1rem; margin-bottom: 0.25rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.setup-chat-archive-label {
  margin: 0; font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}
.setup-chat-archive .setup-chat-msg { opacity: 0.78; }
.setup-chat-inline-error {
  flex-shrink: 0; margin: 0; padding: 0 1.15rem 0.5rem; font-size: 0.8rem; color: #f87171;
}
.setup-chat-sidebar-log {
  flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 1.25rem;
  padding: 1.1rem 1.15rem 1rem; scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.setup-chat-msg { font-size: 0.875rem; line-height: 1.6; }
.setup-chat-msg-body { word-break: break-word; }
.setup-chat-msg-user .setup-chat-msg-body {
  white-space: pre-wrap; padding: 0.55rem 0.75rem; border-radius: 12px;
  background: color-mix(in srgb, var(--text) 4%, var(--bg));
  border: 1px solid color-mix(in srgb, var(--border) 32%, transparent);
  color: color-mix(in srgb, var(--text) 90%, var(--muted));
}
.setup-chat-msg-assistant .setup-chat-msg-body { color: var(--text); padding-right: 0.25rem; white-space: pre-wrap; }
.setup-chat-msg-thinking .setup-chat-msg-body { padding: 0.15rem 0; }
.setup-chat-created {
  display: flex; flex-direction: column; gap: 0.45rem;
  margin-top: 0.75rem; white-space: normal;
}
.setup-chat-created .task { margin-bottom: 0; max-width: 100%; }
.setup-chat-reasoning {
  margin: 0 0 0.65rem; padding: 0.45rem 0.6rem; border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--text) 3%, var(--bg));
  color: var(--muted); font-size: 0.78rem; line-height: 1.45; white-space: pre-wrap;
}
.setup-chat-reasoning summary {
  cursor: pointer; user-select: none; color: color-mix(in srgb, var(--muted) 90%, var(--text));
  font-size: 0.72rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  list-style: none;
}
.setup-chat-reasoning summary::-webkit-details-marker { display: none; }
.setup-chat-reasoning[open] summary { margin-bottom: 0.35rem; }
.setup-chat-stream-body { white-space: pre-wrap; min-height: 1.2em; }
.setup-chat-stream-caret {
  display: inline-block; width: 0.45em; height: 1em; margin-left: 1px; vertical-align: text-bottom;
  background: color-mix(in srgb, var(--text) 55%, transparent);
  animation: setup-chat-caret 1s steps(1) infinite;
}
@keyframes setup-chat-caret {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0; }
}
.setup-chat-thinking-row {
  display: flex; align-items: center; gap: 0.65rem; min-height: 1.25rem;
}
.setup-chat-thinking-label {
  font-size: 0.78rem; color: color-mix(in srgb, var(--muted) 88%, var(--text));
  letter-spacing: 0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.setup-chat-thinking-dots { display: inline-flex; align-items: center; gap: 0.28rem; height: 1rem; }
.setup-chat-thinking-dots span {
  width: 0.35rem; height: 0.35rem; border-radius: 50%; background: var(--muted);
  animation: setup-chat-dot 1.2s ease-in-out infinite;
}
.setup-chat-thinking-dots span:nth-child(2) { animation-delay: 0.15s; }
.setup-chat-thinking-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes setup-chat-dot {
  0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}
.setup-chat-dock {
  flex-shrink: 0; margin-top: auto; padding: 0.65rem 0.85rem 0.85rem;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--bg) 88%, transparent) 28%, var(--surface));
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.setup-chat-composer {
  display: flex; flex-direction: column; gap: 0; border: 1px solid var(--border); border-radius: 14px;
  background: var(--bg);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18), 0 0 0 1px color-mix(in srgb, var(--text) 3%, transparent) inset;
  transition: border-color 0.18s, box-shadow 0.18s; overflow: hidden;
}
.setup-chat-composer:focus-within {
  border-color: rgba(96, 165, 250, 0.42);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12), 0 1px 2px rgba(0, 0, 0, 0.18);
}
.setup-chat-composer textarea {
  width: 100%; font: inherit; font-size: 0.875rem; line-height: 1.5;
  padding: 0.8rem 0.9rem 0.45rem; border: none; background: transparent; color: var(--text);
  resize: none; min-height: 2.75rem; max-height: 10rem; overflow-y: auto;
}
.setup-chat-composer textarea::placeholder { color: color-mix(in srgb, var(--muted) 85%, transparent); }
.setup-chat-composer textarea:focus { outline: none; }
.setup-chat-composer textarea:disabled { opacity: 0.55; cursor: not-allowed; }
.setup-chat-composer-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 0.65rem;
  padding: 0.35rem 0.5rem 0.5rem 0.75rem;
}
.setup-chat-composer-hint {
  font-size: 0.68rem; color: var(--muted); line-height: 1.3; user-select: none; min-width: 0; flex: 1;
}
.setup-chat-composer-actions { display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
.setup-chat-send {
  flex-shrink: 0; width: 1.85rem; height: 1.85rem; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: color-mix(in srgb, var(--muted) 28%, var(--border));
  color: color-mix(in srgb, var(--text) 45%, var(--muted));
  cursor: not-allowed; transition: background 0.18s, color 0.18s, transform 0.15s, box-shadow 0.18s;
}
.setup-chat-attach {
  flex-shrink: 0; width: 1.85rem; height: 1.85rem; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 50%; background: var(--bg);
  font-size: 0.85rem; cursor: pointer; transition: border-color 0.15s, transform 0.15s;
}
.setup-chat-attach:hover { border-color: #60a5fa; transform: translateY(-1px); }
.chat-attach-chips {
  display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.45rem 0.65rem 0;
}
.chat-attach-chips[hidden] { display: none; }
.chat-attach-chip {
  display: inline-flex; align-items: center; gap: 0.3rem;
  max-width: 100%; padding: 0.2rem 0.35rem 0.2rem 0.5rem;
  border-radius: 999px; font-size: 0.7rem; line-height: 1.2;
  background: color-mix(in srgb, #60a5fa 12%, var(--bg));
  border: 1px solid color-mix(in srgb, #60a5fa 35%, var(--border));
  color: var(--text);
}
.chat-attach-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 14rem; }
.chat-attach-chip-x {
  flex-shrink: 0; width: 1.1rem; height: 1.1rem; border: none; border-radius: 50%;
  background: transparent; color: var(--muted); cursor: pointer; font-size: 0.85rem; line-height: 1;
  display: inline-flex; align-items: center; justify-content: center; padding: 0;
}
.chat-attach-chip-x:hover { color: #f87171; background: color-mix(in srgb, #f87171 12%, transparent); }
.setup-chat-send-ready {
  background: #3b82f6; color: #fff; cursor: pointer; box-shadow: 0 1px 4px rgba(59, 130, 246, 0.35);
}
.setup-chat-send-ready:hover:not(:disabled) {
  background: #2563eb; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}
.setup-chat-send:disabled { opacity: 1; }
.setup-chat-send svg { display: block; }
.setup-chat-send-spinner { animation: setup-chat-spin 0.75s linear infinite; }
@keyframes setup-chat-spin { to { transform: rotate(360deg); } }

.btn {
  font-size: 0.82rem; padding: 0.45rem 0.95rem; border-radius: 8px;
  border: 1px solid var(--blue); background: var(--blue); color: #fff;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
.btn:hover:not(:disabled) { background: #1d4ed8; border-color: #1d4ed8; }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.ghost { background: var(--bg); border-color: var(--border); color: var(--text); }
.btn.ghost:hover:not(:disabled) { border-color: var(--muted); background: var(--bg); }
.btn.danger { background: transparent; border-color: rgba(248, 113, 113, 0.4); color: #f87171; }
.btn.danger:hover:not(:disabled) { border-color: #f87171; background: rgba(248, 113, 113, 0.08); }

.planbar {
  display: flex; gap: 0.6rem; align-items: center; margin-top: 1.25rem;
  padding: 0.85rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  flex-wrap: wrap;
}
.plan-budget-display {
  font-family: "JetBrains Mono", monospace; font-size: 0.85rem; color: var(--text);
  cursor: pointer; padding: 0.2rem 0; border-bottom: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
  flex-shrink: 0;
}
.plan-budget-display:hover { color: #60a5fa; border-bottom-color: color-mix(in srgb, #60a5fa 45%, var(--border)); }
.plan-budget-input {
  width: 7.5rem; font-family: "JetBrains Mono", monospace; font-size: 0.85rem;
}
.planbar-divider { width: 1px; height: 1.25rem; background: var(--border); flex-shrink: 0; }
.planbar-label { flex-shrink: 0; font-size: 0.8rem; }
.planbar input#planName { flex: 1; min-width: 10rem; }
.plan-org {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 1rem 0.75rem 1.1rem; margin: 0.5rem 0; overflow-x: auto;
}
.plan-org .org-card { cursor: default; }
.plan-org .org-card:hover { transform: none; box-shadow: none; border-color: var(--border); }
.agentcard {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  border-left: 3px solid var(--accent, var(--border));
  padding: 0.75rem 1rem; margin: 0.45rem 0;
}
.agentcard .muted { font-size: 0.78rem; }

.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 0.85rem; max-width: 1200px; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden; cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
}
.card .inner { padding: 1rem 1.1rem 1.05rem; }
.card h3 { font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 0.3rem; }
.card .goal { color: var(--muted); font-size: 0.8rem; line-height: 1.45; min-height: 2.4em; margin-bottom: 0.65rem; }
.card .meta { display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: 0.72rem; color: var(--muted); font-family: "JetBrains Mono", monospace; }
.badge {
  font-size: 0.62rem; font-weight: 600; letter-spacing: 0.06em; padding: 0.2em 0.6em;
  border-radius: 999px; border: 1px solid rgba(234, 179, 8, 0.35);
  background: rgba(234, 179, 8, 0.12); color: #fbbf24; height: fit-content;
}
.card.new {
  display: flex; align-items: center; justify-content: center; color: var(--muted);
  border-style: dashed; font-size: 0.9rem; min-height: 120px; background: transparent;
}
.card.new:hover { color: var(--text); transform: none; box-shadow: none; }

footer {
  position: fixed; bottom: 0; left: 0; right: 0; height: 44px;
  display: none; align-items: center; gap: 1.1rem; padding: 0 1.5rem;
  background: var(--surface); border-top: 1px solid var(--border); font-size: 0.78rem;
}
body.footer-on footer { display: flex; }
footer .sw { display: flex; align-items: center; gap: 0.5rem; color: var(--muted); cursor: pointer; user-select: none; }
footer .track2 { width: 32px; height: 18px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); position: relative; }
footer .knob { position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 7px; background: var(--muted); transition: left 0.15s; }
footer .sw.on .knob { left: 16px; background: #4ade80; }
footer .sw.on { color: var(--text); }
#liveStrip { flex: 1; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: "JetBrains Mono", monospace; font-size: 0.7rem; }
#liveStrip .hot { color: #fbbf24; }
#toastHost {
  position: fixed; right: 1rem; bottom: 3.25rem; z-index: 10000;
  display: flex; flex-direction: column; gap: 0.45rem; align-items: flex-end;
  pointer-events: none; max-width: min(360px, calc(100vw - 2rem));
}
.toast {
  pointer-events: auto;
  background: var(--surface); color: var(--text);
  border: 1px solid var(--border); border-left: 3px solid var(--blue-bright);
  border-radius: 10px; padding: 0.7rem 0.9rem; font-size: 0.82rem; line-height: 1.35;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  animation: toast-in 0.18s ease;
}
.toast.err { border-left-color: #f87171; }
.toast.ok { border-left-color: #4ade80; }
.toast-row { display: flex; align-items: flex-start; gap: 0.65rem; }
.toast-msg { flex: 1; min-width: 0; }
.toast-action {
  flex-shrink: 0; font: inherit; font-size: 0.72rem; font-weight: 600;
  padding: 0.2rem 0.55rem; border-radius: 6px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--text) 6%, var(--bg)); color: var(--text);
}
.toast-action:hover { border-color: var(--muted); }
@keyframes toast-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
footer .footer-settings {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0; flex-shrink: 0;
  background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--muted);
}
footer .footer-settings:hover { color: var(--text); border-color: var(--muted); }
footer .footer-settings svg { display: block; }
.theme-btn {
  position: fixed; left: 12px; bottom: 12px; right: auto; top: auto; z-index: 80;
  width: 34px; height: 34px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--surface); color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.9rem; cursor: grab; touch-action: none; user-select: none;
  transition: color 0.15s, border-color 0.15s, box-shadow 0.15s;
  box-shadow: 0 4px 16px rgba(20, 30, 50, 0.08);
}
.theme-btn:hover { color: var(--text); border-color: var(--muted); }
.theme-btn.dragging {
  cursor: grabbing; z-index: 90;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transition: none;
}
body.footer-on .theme-btn:not(.theme-pos) { bottom: 56px; }
.modal.roles { width: min(520px, 100%); }
.role-settings { display: flex; flex-direction: column; gap: 0.85rem; }
.role-row {
  display: grid; grid-template-columns: 88px 1fr 1fr; gap: 0.55rem; align-items: center;
}
.role-row .role-name {
  color: var(--muted); font-size: 0.72rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.role-row select { width: 100%; font-size: 0.78rem; padding: 0.35rem 0.5rem; }

.toolbar { display: flex; gap: 0.5rem; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--border); }
.toolbar .btn { flex: 1; font-size: 0.78rem; padding: 0.42rem 0.5rem; }

/* Company sidebar runtime controls */
.runtime-bar {
  display: flex; flex-direction: column; gap: 0.55rem;
  padding: 0.65rem 0.85rem 0.7rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 65%, var(--surface));
}
.runtime-run {
  display: flex; gap: 2px; padding: 3px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
}
.runtime-run-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
  border: none; border-radius: 8px; padding: 0.48rem 0.45rem;
  background: transparent; color: var(--muted);
  font: inherit; font-size: 0.78rem; font-weight: 600; letter-spacing: -0.01em;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.runtime-run-btn:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--surface) 70%, transparent);
}
.runtime-run-btn.primary {
  background: var(--blue); color: #fff;
  box-shadow: 0 1px 4px rgba(59, 130, 246, 0.32);
}
.runtime-run-btn.primary:hover:not(:disabled) { background: #1d4ed8; }
.runtime-run-btn.busy {
  background: color-mix(in srgb, var(--blue) 22%, var(--bg));
  color: var(--blue-bright);
  box-shadow: none;
}
.runtime-run-btn.stop {
  background: color-mix(in srgb, #f87171 16%, var(--bg));
  color: #f87171;
}
.runtime-run-btn.stop:hover:not(:disabled) {
  background: color-mix(in srgb, #f87171 24%, var(--bg));
}
.runtime-run-btn:disabled { opacity: 0.42; cursor: default; }
.runtime-run-ico { font-size: 0.68rem; line-height: 1; opacity: 0.9; }

.runtime-status {
  display: flex; align-items: center; gap: 0.4rem;
  min-height: 1rem; padding: 0 0.2rem;
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
}
.runtime-status-dot {
  width: 0.4rem; height: 0.4rem; border-radius: 50%; flex-shrink: 0;
  background: var(--line);
}
.runtime-status.ready .runtime-status-dot { background: #4ade80; }
.runtime-status.busy .runtime-status-dot {
  background: #60a5fa;
  box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.45);
  animation: runtime-dot-pulse 1.4s ease-in-out infinite;
}
.runtime-status.stopping .runtime-status-dot,
.runtime-status.paused .runtime-status-dot { background: #f87171; }
.runtime-status.busy { color: #93c5fd; }
.runtime-status.paused { color: #fca5a5; }
@keyframes runtime-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(96, 165, 250, 0.4); }
  50% { box-shadow: 0 0 0 4px rgba(96, 165, 250, 0); }
}

.runtime-tools {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem;
}
.runtime-tool {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.18rem; min-height: 2.55rem; padding: 0.35rem 0.2rem;
  border: 1px solid var(--border); border-radius: 9px;
  background: var(--surface); color: var(--muted);
  font: inherit; font-size: 0.62rem; font-weight: 600; letter-spacing: 0.04em;
  text-transform: uppercase; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}
.runtime-tool:hover:not(:disabled) {
  color: var(--text); border-color: color-mix(in srgb, var(--muted) 55%, var(--border));
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
}
.runtime-tool.alert {
  color: #f87171; border-color: rgba(248, 113, 113, 0.4);
  background: color-mix(in srgb, #f87171 8%, var(--surface));
}
.runtime-tool.danger { color: color-mix(in srgb, #f87171 70%, var(--muted)); }
.runtime-tool.danger:hover:not(:disabled) {
  color: #f87171; border-color: rgba(248, 113, 113, 0.45);
  background: color-mix(in srgb, #f87171 8%, var(--surface));
}
.runtime-tool:disabled {
  opacity: 0.34; cursor: default; transform: none; box-shadow: none;
}
.runtime-tool-ico { font-size: 0.88rem; line-height: 1; letter-spacing: 0; text-transform: none; font-weight: 500; }
.runtime-tool-ico svg {
  display: block; width: 1rem; height: 1rem;
  stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
}
.runtime-tool-ico svg .n { fill: currentColor; stroke: none; }

.modal-backdrop {
  position: fixed; inset: 0; z-index: 100; display: flex; align-items: center;
  justify-content: center; padding: 2rem; background: rgba(5, 8, 13, 0.72);
  backdrop-filter: blur(3px);
}
.modal {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  width: min(820px, 100%); max-height: 88vh; display: flex; flex-direction: column;
  overflow: hidden; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}
.modal-accent { height: 3px; background: var(--blue); }
.modal-head { border-bottom: 1px solid var(--border); background: var(--bg); }
.modal-head-body { padding: 0.9rem 1.25rem 1rem; display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
.modal-title { font-size: 1.15rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.3; }
.modal-sub { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem; }
.modal-close {
  background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--muted);
  width: 28px; height: 28px; line-height: 1; flex-shrink: 0; font-size: 0.9rem;
}
.modal-close:hover { color: var(--text); border-color: var(--muted); }
.modal-back {
  display: inline-flex; align-items: center; gap: 0.3rem;
  background: none; border: none; padding: 0; margin: 0 0 0.35rem;
  color: #60a5fa; font: inherit; font-size: 0.72rem; font-weight: 600;
  letter-spacing: 0.02em; cursor: pointer;
}
.modal-back:hover { color: var(--link-strong); text-decoration: underline; }
.modal-back-dot {
  display: none; width: 0.45rem; height: 0.45rem; border-radius: 50%;
  background: #fbbf24; flex-shrink: 0;
  box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.45);
  animation: modal-back-dot-pulse 1.4s ease-in-out infinite;
}
.modal-back-dot.on { display: inline-block; }
@keyframes modal-back-dot-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.45); }
  50% { box-shadow: 0 0 0 5px rgba(251, 191, 36, 0); }
}
.modal-body { overflow-y: auto; padding: 1rem 1.25rem 1.5rem; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.modal-callout {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 0.9rem 1rem; margin-bottom: 1rem;
}
.modal-callout-copy { min-width: 0; flex: 1; }
.modal-callout-title {
  font-size: 0.92rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 0.25rem;
}
.modal-callout-sub { color: var(--muted); font-size: 0.8rem; line-height: 1.45; }
.modal-callout .btn { flex-shrink: 0; align-self: center; }
.modal-empty {
  text-align: center; padding: 1.75rem 1rem 1.4rem;
  border: 1px dashed color-mix(in srgb, var(--border) 85%, transparent);
  border-radius: 12px; background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.modal-empty-title {
  font-size: 0.92rem; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 0.35rem;
}
.modal-empty-sub { color: var(--muted); font-size: 0.8rem; line-height: 1.5; max-width: 28rem; margin: 0 auto; }
.checkin-card {
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 0.85rem 1rem; margin-bottom: 0.75rem;
}
.checkin-card .checkin-meta {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
  margin-bottom: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.35rem 0.65rem; align-items: center;
}
.checkin-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  gap: 0.5rem; margin-bottom: 0.75rem;
}
.checkin-stat {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 0.55rem 0.65rem;
}
.checkin-stat .k {
  font-size: 0.6rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.2rem;
}
.checkin-stat .v {
  font-family: "JetBrains Mono", monospace; font-size: 1rem; font-weight: 600;
  letter-spacing: -0.02em; line-height: 1.2;
}
.checkin-stat .s { font-size: 0.68rem; color: var(--muted); margin-top: 0.15rem; }
.checkin-stat.warn .v { color: #fbbf24; }
.checkin-stat.bad .v { color: #f87171; }
.checkin-stat.ok .v { color: #4ade80; }
.checkin-bars { display: flex; flex-direction: column; gap: 0.45rem; margin-bottom: 0.75rem; }
.checkin-bar-row { display: grid; grid-template-columns: 7.5rem 1fr auto; gap: 0.55rem; align-items: center; }
.checkin-bar-row .lab { font-size: 0.72rem; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.checkin-bar-row .num { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); }
.checkin-track {
  height: 7px; border-radius: 999px; background: color-mix(in srgb, var(--border) 70%, transparent);
  overflow: hidden;
}
.checkin-fill { height: 100%; border-radius: 999px; background: #3b82f6; }
.checkin-fill.done { background: #22c55e; }
.checkin-fill.running { background: #eab308; }
.checkin-fill.waiting { background: #d946ef; }
.checkin-fill.queued { background: #60a5fa; }
.checkin-fill.failed { background: #f87171; }
.checkin-agents {
  display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem;
}
.checkin-agent {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 0.28rem 0.55rem; font-size: 0.72rem;
}
.checkin-agent .dot {
  width: 0.4rem; height: 0.4rem; border-radius: 50%; background: var(--muted); flex-shrink: 0;
}
.checkin-agent.working .dot { background: #eab308; box-shadow: 0 0 6px rgba(234, 179, 8, 0.45); }
.checkin-agent .who { font-weight: 600; }
.checkin-agent .meta { font-family: "JetBrains Mono", monospace; font-size: 0.62rem; color: var(--muted); }
.checkin-tables { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.35rem; }
.checkin-chip {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
  padding: 0.3rem 0.55rem; font-family: "JetBrains Mono", monospace; font-size: 0.68rem;
}
.checkin-chip.action {
  cursor: pointer; transition: border-color 0.15s, transform 0.15s, background 0.15s;
}
.checkin-chip.action:hover {
  border-color: color-mix(in srgb, #60a5fa 50%, var(--border));
  background: color-mix(in srgb, #3b82f6 8%, var(--surface));
  transform: translateY(-1px);
}
.checkin-chip b { color: var(--text); font-weight: 600; }
.checkin-chip .muted { font-weight: 400; }
.checkin-alerts {
  display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.75rem;
}
.checkin-q {
  margin-top: 0.65rem; padding-top: 0.55rem;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}
.checkin-q .todoitem { padding: 0.2rem 0; }
.schedule-form {
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  padding: 0.95rem 1rem; margin-bottom: 1rem;
}
.schedule-fields {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem; margin-bottom: 0.95rem;
}
.schedule-field .k {
  font-size: 0.62rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.35rem;
}
.schedule-field input {
  width: 100%; font-family: "JetBrains Mono", monospace; font-size: 0.85rem;
  padding: 0.45rem 0.6rem;
}
.schedule-field .hint { color: var(--muted); font-size: 0.72rem; margin-top: 0.3rem; line-height: 1.35; }
.schedule-status {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem;
  margin-bottom: 0.85rem;
}
.schedule-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.csv-preview-meta {
  display: flex; flex-wrap: wrap; gap: 0.35rem 0.5rem; align-items: center;
  margin-bottom: 0.75rem;
}
.csv-preview-scroll {
  border: 1px solid var(--border); border-radius: 12px; overflow: auto;
  max-height: min(52vh, 28rem); background: var(--bg);
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.csv-preview-scroll table.dbt th { background: var(--surface); }
.csv-preview-scroll table.dbt tr { cursor: default; }
.csv-preview-scroll table.dbt tbody tr:hover td { background: color-mix(in srgb, var(--blue) 6%, transparent); }
.md-preview-meta {
  display: flex; flex-wrap: wrap; gap: 0.35rem 0.5rem; align-items: center;
  margin-bottom: 0.75rem;
}
.md-preview-scroll {
  border: 1px solid var(--border); border-radius: 12px; overflow: auto;
  max-height: min(52vh, 28rem); background: var(--bg); padding: 1rem 1.1rem 1.15rem;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.md-preview { color: var(--text); font-size: 0.85rem; line-height: 1.55; }
.md-preview h1, .md-preview h2, .md-preview h3 {
  font-weight: 600; letter-spacing: -0.02em; line-height: 1.3; margin: 1rem 0 0.45rem;
}
.md-preview h1:first-child, .md-preview h2:first-child, .md-preview h3:first-child { margin-top: 0; }
.md-preview h1 { font-size: 1.15rem; }
.md-preview h2 {
  font-size: 0.98rem; padding-bottom: 0.35rem;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}
.md-preview h3 {
  font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--muted);
}
.md-preview p { margin: 0.4rem 0; }
.md-preview .md-gap { height: 0.45rem; }
.md-preview ul { margin: 0.35rem 0 0.55rem; padding-left: 1.15rem; }
.md-preview li { margin: 0.2rem 0; }
.md-preview hr {
  border: 0; border-top: 1px solid var(--border); margin: 0.85rem 0;
}
.md-preview strong { color: var(--link-strong); font-weight: 600; }
.md-preview em { color: color-mix(in srgb, var(--muted) 70%, var(--text)); font-style: italic; }
.md-preview code {
  font-family: "JetBrains Mono", monospace; font-size: 0.78em;
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 4px; padding: 0.05em 0.35em;
}
.md-preview pre.md-code {
  margin: 0.55rem 0; padding: 0.7rem 0.8rem; border-radius: 10px;
  background: var(--surface); border: 1px solid var(--border);
  overflow-x: auto; font-family: "JetBrains Mono", monospace; font-size: 0.72rem;
  line-height: 1.45; white-space: pre-wrap; word-break: break-word;
}
.md-preview pre.md-code code {
  background: none; border: 0; padding: 0; font-size: inherit; color: var(--text);
}
.modal.confirm { width: min(420px, 100%); }
.modal.confirm .modal-body { padding-bottom: 1.1rem; }
.confirm-msg { color: var(--muted); font-size: 0.9rem; line-height: 1.5; margin: 0; }
.confirm-msg strong { color: var(--text); font-weight: 600; }
.confirm-actions {
  display: flex; justify-content: flex-end; gap: 0.55rem; margin-top: 1.25rem;
}
.meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.55rem; margin: 0.75rem 0 0.25rem; }
.meta-cell { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.45rem 0.6rem; }
.meta-cell .k { font-size: 0.6rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.15rem; }
.meta-cell .v { font-family: "JetBrains Mono", monospace; font-size: 0.72rem; word-break: break-all; display: flex; align-items: center; gap: 0.35rem; }
.linkchip {
  display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.6rem;
  border-radius: 999px; border: 1px solid color-mix(in srgb, var(--blue) 35%, var(--border));
  background: color-mix(in srgb, var(--blue) 10%, var(--bg)); color: #60a5fa;
  font-size: 0.72rem; font-weight: 600; cursor: pointer; margin: 0.15rem 0.25rem 0.15rem 0;
}
.linkchip:hover { border-color: color-mix(in srgb, var(--blue) 60%, var(--border)); }
.live-dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: #4ade80; animation: live-pulse 1.2s ease-in-out infinite; }
@keyframes live-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.result-box { border-radius: 10px; padding: 0.75rem; font-size: 0.82rem; white-space: pre-wrap; word-break: break-word; }
.result-box.done { background: rgba(34, 197, 94, 0.08); border: 1px solid rgba(34, 197, 94, 0.3); }
.result-box.failed { background: rgba(248, 113, 113, 0.08); border: 1px solid rgba(248, 113, 113, 0.3); }
.msg-item { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; }
.msg-item .route { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); margin-bottom: 0.25rem; }
.msg-item .content { font-size: 0.78rem; white-space: pre-wrap; word-break: break-word; }

.spinner {
  display: inline-block; width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid rgba(251, 191, 36, 0.25); border-top-color: #fbbf24;
  animation: spin 0.8s linear infinite; vertical-align: -1px; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }
.adot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 50%; margin-right: 0.35rem; vertical-align: 0; }

/* ── DB browser: overview (level 1) ── */
.db-crumb { display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: var(--muted); margin-bottom: 0.9rem; }
.db-crumb a { color: #60a5fa; cursor: pointer; }
.db-crumb a:hover { text-decoration: underline; }
.db-file { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem; margin-bottom: 0.7rem; }
.db-file-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
.db-file-name { font-family: "JetBrains Mono", monospace; font-size: 0.82rem; font-weight: 500; }
.db-file-size { font-size: 0.68rem; color: var(--muted); font-family: "JetBrains Mono", monospace; }
.db-tables { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 0.5rem; }
.db-tcard { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.6rem 0.7rem; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.db-tcard:hover { border-color: color-mix(in srgb, var(--blue) 50%, var(--border)); transform: translateY(-1px); }
.db-tcard .t { font-family: "JetBrains Mono", monospace; font-weight: 600; font-size: 0.8rem; }
.db-tcard .n { font-size: 0.72rem; color: var(--text); font-family: "JetBrains Mono", monospace; }
.db-tcard .c { font-size: 0.64rem; color: var(--muted); margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── DB browser: table explorer (level 2) ── */
.dbx-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.6rem; }
.dbx-bar input[type=text] { flex: 1; min-width: 160px; }
.dbx-bar select { font-size: 0.75rem; }
.dbtablewrap { overflow: auto; max-height: 46vh; border: 1px solid var(--border); border-radius: 8px; }
table.dbt { border-collapse: collapse; width: 100%; font-size: 0.72rem; }
table.dbt th { position: sticky; top: 0; z-index: 1; background: var(--bg); text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--border); font-family: "JetBrains Mono", monospace; color: var(--muted); font-weight: 500; cursor: pointer; white-space: nowrap; user-select: none; }
table.dbt th:hover { color: var(--text); }
table.dbt th .arr { color: #60a5fa; margin-left: 0.2rem; }
table.dbt td { padding: 0.35rem 0.6rem; border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent); font-family: "JetBrains Mono", monospace; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
table.dbt tr { cursor: pointer; }
table.dbt tbody tr:hover td { background: color-mix(in srgb, var(--blue) 8%, transparent); }
table.dbt td.null { color: var(--muted); font-style: italic; }
.dbx-foot { display: flex; align-items: center; gap: 0.6rem; margin-top: 0.55rem; font-size: 0.75rem; color: var(--muted); }
.dbx-foot .sp { flex: 1; }
.pgbtn { background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; padding: 0.25rem 0.6rem; font-size: 0.75rem; cursor: pointer; }
.pgbtn:disabled { opacity: 0.4; cursor: default; }
.dbsql { width: 100%; height: 60px; font-family: "JetBrains Mono", monospace; font-size: 0.75rem; resize: vertical; background: var(--bg); }
.rowdetail { margin-top: 0.6rem; border: 1px solid var(--border); border-radius: 8px; padding: 0.7rem 0.85rem; background: var(--bg); }
.rowdetail h4 { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.5rem; }
.rowdetail .kv { display: grid; grid-template-columns: 130px 1fr; gap: 0.3rem 0.8rem; font-size: 0.76rem; }
.rowdetail .kv .k { color: var(--muted); font-family: "JetBrains Mono", monospace; }
.rowdetail .kv .v { word-break: break-word; font-family: "JetBrains Mono", monospace; }
.rowdetail .kv .v a { color: #60a5fa; }

.todoitem { display: flex; gap: 0.5rem; align-items: flex-start; padding: 0.25rem 0; font-size: 0.85rem; }
.todoitem .box { color: var(--muted); font-family: "JetBrains Mono", monospace; }
.dlv { display: inline-flex; align-items: center; gap: 0.45rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.7rem; margin: 0.2rem 0.3rem 0.2rem 0; font-family: "JetBrains Mono", monospace; font-size: 0.75rem; }
.dlv .kind { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.12em 0.45em; border-radius: 4px; background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.dlv .kind.csv { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.dlv .kind.md { background: rgba(217, 70, 239, 0.15); color: #e879f9; }
.dlv .kind.db { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
.dlv .kind.pdf { background: rgba(248, 113, 113, 0.15); color: #f87171; }
.mermaidbox { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem; margin: 0.5rem 0; overflow-x: auto; }
.mermaidbox svg { max-width: 100%; }
.dagbox {
  position: relative;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  margin: 0.5rem 0; min-height: 420px; height: min(60vh, 560px); width: 100%;
  overflow: hidden;
}
.dagbox-cy { position: absolute; inset: 0; z-index: 1; }
.dagbox-overlay {
  position: absolute; inset: 0; z-index: 2;
  overflow: hidden; pointer-events: none;
}
.dagbox-overlay .task {
  position: absolute; left: 0; top: 0;
  width: 260px; margin: 0;
  pointer-events: auto;
  transform-origin: 0 0;
  will-change: transform;
  box-sizing: border-box;
}
.dagbox-overlay .task.graph-hist { opacity: 0.62; }
.dagbox-empty {
  position: absolute; inset: 0; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.graph-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 0.55rem; margin-bottom: 0.35rem;
}
.graph-filter {
  display: inline-flex; gap: 2px; padding: 3px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
}
.graph-filter-btn {
  border: none; background: transparent; color: var(--muted);
  font: inherit; font-size: 0.72rem; font-weight: 600; letter-spacing: -0.01em;
  padding: 0.28rem 0.75rem; border-radius: 999px; cursor: pointer;
  transition: color 0.15s, background 0.15s, box-shadow 0.15s;
}
.graph-filter-btn:hover { color: var(--text); }
.graph-filter-btn.on {
  background: color-mix(in srgb, var(--blue) 18%, var(--surface));
  color: var(--blue-bright);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--blue) 35%, var(--border));
}

.skillrow { display: flex; flex-direction: column; gap: 1.25rem; width: 100%; }
.skilllist { width: 100%; }
#skillItems {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.85rem;
}
@media (max-width: 980px) {
  #skillItems { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  #skillItems { grid-template-columns: 1fr; }
}
.skillitem {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 0.95rem 1.1rem 1rem; cursor: pointer; min-width: 0; height: 100%;
  display: flex; flex-direction: column; gap: 0.55rem; text-align: left;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  border-left: 3px solid color-mix(in srgb, var(--blue) 55%, var(--border));
}
.skillitem:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  border-color: color-mix(in srgb, var(--blue) 35%, var(--border));
  border-left-color: var(--blue);
}
.skillitem.on {
  border-color: color-mix(in srgb, var(--blue) 45%, var(--border));
  border-left-color: var(--blue);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--blue) 25%, transparent);
}
.skillitem.action {
  align-items: center; justify-content: center; text-align: center;
  border: 1px dashed var(--border); background: transparent;
  color: var(--muted); font-size: 0.85rem; min-height: 7.5rem;
}
.skillitem.action:hover {
  color: var(--text); transform: none; box-shadow: none;
  border-color: var(--muted);
}
.skillitem.action label { cursor: pointer; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.skillitem-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem; }
.skillitem-name { font-size: 1.02rem; font-weight: 600; letter-spacing: -0.01em; line-height: 1.25; }
.skillitem-slug {
  font-family: "JetBrains Mono", monospace; font-size: 0.65rem; color: var(--muted); margin-top: -0.2rem;
}
.skillitem-desc {
  color: var(--muted); font-size: 0.8rem; line-height: 1.4; flex: 1;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
.skillitem-meta {
  display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-top: auto;
  font-size: 0.65rem; color: var(--muted); font-family: "JetBrains Mono", monospace;
}
.skillitem-meta .chip {
  opacity: 1; font-size: 0.62rem; padding: 0.12rem 0.4rem;
  color: #60a5fa; border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
  background: color-mix(in srgb, var(--blue) 10%, var(--bg));
}
.src {
  font-size: 0.6rem; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--muted); background: rgba(139, 156, 179, 0.15); border-radius: 4px; padding: 0.18em 0.5em;
  height: fit-content; flex-shrink: 0;
}
.src.workspace { color: #4ade80; background: rgba(34, 197, 94, 0.15); }
.src.new { color: #60a5fa; background: rgba(59, 130, 246, 0.15); }

#viewSkill .skill-page-meta {
  display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center;
  margin-top: 0.55rem; font-size: 0.72rem; color: var(--muted);
  font-family: "JetBrains Mono", monospace;
}
#viewSkill .skill-page-meta .chip {
  opacity: 1; font-size: 0.62rem; padding: 0.12rem 0.4rem;
  color: #60a5fa; border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
  background: color-mix(in srgb, var(--blue) 10%, var(--bg));
}
#skillWorkspace {
  display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden; margin-top: 0.25rem; min-height: calc(100vh - 220px);
}
@media (max-width: 800px) {
  #skillWorkspace { grid-template-columns: 1fr; }
}
#skillWorkspace .accentbar {
  grid-column: 1 / -1; height: 3px; background: linear-gradient(90deg, #2563eb, #60a5fa);
}
.skill-tree-pane {
  border-right: 1px solid var(--border); background: var(--bg);
  display: flex; flex-direction: column; min-height: 0; max-height: calc(100vh - 223px);
}
.skill-tree-head {
  display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
  padding: 0.7rem 0.85rem; border-bottom: 1px solid var(--border);
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);
}
.skill-tree-head .ghost-link {
  background: none; border: 0; color: var(--muted); font-size: 0.72rem; cursor: pointer;
  text-transform: none; letter-spacing: 0; font-weight: 500; padding: 0;
}
.skill-tree-head .ghost-link:hover { color: var(--text); }
#skillTree {
  overflow-y: auto; flex: 1; padding: 0.45rem 0.35rem 0.75rem;
  scrollbar-width: thin; scrollbar-color: var(--border) transparent;
}
.skill-tree-item {
  display: flex; align-items: center; gap: 0.4rem; width: 100%;
  background: none; border: 0; color: var(--muted); text-align: left;
  font-family: "JetBrains Mono", monospace; font-size: 0.72rem;
  padding: 0.32rem 0.55rem; border-radius: 6px; cursor: pointer;
}
.skill-tree-item:hover { color: var(--text); background: color-mix(in srgb, var(--surface) 80%, transparent); }
.skill-tree-item.on {
  color: #60a5fa; background: color-mix(in srgb, var(--blue) 12%, var(--bg));
}
.skill-tree-item.dir { color: var(--muted); cursor: default; font-weight: 600; opacity: 0.85; }
.skill-tree-item.dir:hover { background: none; }
.skill-tree-item .ico { opacity: 0.55; flex-shrink: 0; width: 0.9rem; text-align: center; }
.skill-tree-item .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill-tree-empty { padding: 0.75rem 0.85rem; color: var(--muted); font-size: 0.75rem; }

.skill-editor-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#skillEditor .skill-editor-inner { padding: 1rem 1.1rem 1.15rem; display: flex; flex-direction: column; flex: 1; min-height: 0; }
#skillEditor .skill-editor-bar {
  display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap;
}
#skillEditor .skill-editor-bar input#skillName {
  flex: 1; min-width: 10rem; font-family: "JetBrains Mono", monospace;
}
#skillFileLabel {
  font-family: "JetBrains Mono", monospace; font-size: 0.72rem; color: var(--muted);
  margin-bottom: 0.45rem;
}
#skillContent {
  width: 100%; flex: 1; min-height: 360px; height: calc(100vh - 340px); max-height: none;
  font-family: "JetBrains Mono", monospace; font-size: 0.78rem; line-height: 1.5;
  background: var(--bg); resize: vertical;
}
#skillContent:disabled { opacity: 0.55; cursor: not-allowed; }
#skillMsg { margin-top: 0.65rem; }
#skillBinaryNote {
  display: none; flex: 1; align-items: center; justify-content: center;
  color: var(--muted); font-size: 0.85rem; padding: 2rem; text-align: center;
  border: 1px dashed var(--border); border-radius: 10px; background: var(--bg);
  min-height: 200px;
}
#skillBinaryNote.on { display: flex; }
#skillContent.hidden { display: none; }
</style>
</head>
<body>
<main id="viewHome" class="on home-welcome">
  <section id="homeWelcome">
    <div class="home-hero">
      <div class="home-hero-copy">
        <div class="home-brand">AI Company OS</div>
        <h1 class="home-headline">Build a company of agents</h1>
        <p class="home-lead">Plan a roster in chat, launch it to disk, and let agents work from plain files — companies, tasks, and artifacts you can open in any editor.</p>
        <div class="home-cta-row">
          <button type="button" class="btn home-cta" onclick="openPlan(null)">Start a plan</button>
          <button type="button" class="home-link" onclick="nav('skills')">Browse skills</button>
        </div>
        <button type="button" class="home-workspace" id="homeWorkspaceWelcome" onclick="openWorkspacePicker()" title="Change workspace folder">
          <span class="home-workspace-label">Workspace</span>
          <span class="home-workspace-path" id="homeWorkspacePathWelcome">Loading…</span>
          <span class="home-workspace-change">Change</span>
        </button>
      </div>
      <div class="home-hero-visual" aria-hidden="true">
        <svg class="home-constellation" viewBox="0 0 420 360" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path class="link" d="M210 72 L120 168"/>
          <path class="link" d="M210 72 L300 168"/>
          <path class="link" d="M120 168 L70 268"/>
          <path class="link" d="M120 168 L170 268"/>
          <path class="link" d="M300 168 L250 268"/>
          <path class="link" d="M300 168 L350 268"/>
          <g class="node chief">
            <circle class="halo" cx="210" cy="72" r="28" stroke="#eab308"/>
            <circle class="disk chief" cx="210" cy="72" r="16"/>
            <circle class="core chief" cx="210" cy="72" r="5"/>
          </g>
          <g class="node mgr">
            <circle class="halo" cx="120" cy="168" r="22" stroke="#d946ef"/>
            <circle class="disk mgr" cx="120" cy="168" r="13"/>
            <circle class="core mgr" cx="120" cy="168" r="4"/>
          </g>
          <g class="node mgr">
            <circle class="halo" cx="300" cy="168" r="22" stroke="#d946ef"/>
            <circle class="disk mgr" cx="300" cy="168" r="13"/>
            <circle class="core mgr" cx="300" cy="168" r="4"/>
          </g>
          <g class="node wkr">
            <circle class="disk wkr" cx="70" cy="268" r="10"/>
            <circle class="core wkr" cx="70" cy="268" r="3.5"/>
          </g>
          <g class="node wkr">
            <circle class="disk wkr" cx="170" cy="268" r="10"/>
            <circle class="core wkr" cx="170" cy="268" r="3.5"/>
          </g>
          <g class="node wkr">
            <circle class="disk wkr" cx="250" cy="268" r="10"/>
            <circle class="core wkr" cx="250" cy="268" r="3.5"/>
          </g>
          <g class="node wkr">
            <circle class="disk wkr" cx="350" cy="268" r="10"/>
            <circle class="core wkr" cx="350" cy="268" r="3.5"/>
          </g>
          <text class="label" x="210" y="48" text-anchor="middle">Chief</text>
          <text class="label" x="120" y="148" text-anchor="middle">Managers</text>
          <text class="label" x="300" y="148" text-anchor="middle">Managers</text>
          <text class="label" x="210" y="312" text-anchor="middle">Workers</text>
        </svg>
      </div>
    </div>
    <div class="home-below">
      <div class="home-steps">
        <div class="home-step">
          <div class="home-step-num">01</div>
          <div class="home-step-title">Plan</div>
          <p class="home-step-body">Describe the goal. A planning model drafts the org chart, tools, and first tasks.</p>
        </div>
        <div class="home-step">
          <div class="home-step-num">02</div>
          <div class="home-step-title">Launch</div>
          <p class="home-step-body">Scaffold a company directory — agents, queue, skills, and budget as plain files.</p>
        </div>
        <div class="home-step">
          <div class="home-step-num">03</div>
          <div class="home-step-title">Run</div>
          <p class="home-step-body">Tick the queue. The chief delegates, workers execute, results flow back up.</p>
        </div>
      </div>
      <div class="home-welcome-skills">
        <div class="sec-row">
          <h2 class="sec">Skills ready</h2>
          <button type="button" class="sec-link" onclick="nav('skills')">Open library →</button>
        </div>
        <div class="skills-strip" id="skillCardsWelcome"></div>
      </div>
    </div>
  </section>

  <section id="homeDirectory" hidden>
    <div class="home-dir-shell">
      <header class="home-dir-mast">
        <div class="home-dir-mast-main">
          <div class="home-dir-brand">AI Company OS</div>
          <button type="button" class="home-workspace home-workspace-inline" id="homeWorkspaceDir" onclick="openWorkspacePicker()" title="Change workspace folder">
            <span class="home-workspace-label">Workspace</span>
            <span class="home-workspace-path" id="homeWorkspacePathDir">Loading…</span>
            <span class="home-workspace-change">Change</span>
          </button>
        </div>
        <div class="home-dir-mast-actions">
          <button type="button" class="home-link" onclick="nav('skills')">Skills</button>
          <button type="button" class="btn" onclick="openPlan(null)">New plan</button>
        </div>
      </header>

      <div class="home-dir-pulse">
        <h1 class="home-dir-title" id="homeTitle">Your companies</h1>
        <div class="home-dir-metrics" id="homeMetrics"></div>
      </div>

      <div class="home-dir-section" id="companiesBlock">
        <div class="home-dir-section-head">
          <div class="home-dir-section-label">Portfolio</div>
          <div class="home-dir-section-count" id="homeCompanyCount"></div>
        </div>
        <div class="home-portfolio" id="companyRows"></div>
      </div>

      <div class="home-dir-section" id="plansBlock">
        <div class="home-dir-section-head">
          <div class="home-dir-section-label">Plans in progress</div>
          <div class="home-dir-section-count" id="homePlanCount"></div>
        </div>
        <div class="home-plans" id="planCards"></div>
      </div>

      <div class="home-dir-section">
        <div class="home-dir-section-head">
          <div class="home-dir-section-label">Skills</div>
          <button type="button" class="sec-link" onclick="nav('skills')">Open library →</button>
        </div>
        <div class="skills-strip" id="skillCards"></div>
      </div>
    </div>
  </section>
</main>

<main id="viewCompany" class="agent-open">
  <section class="sidebar">
    <div class="side-head">
      <div class="accentbar"></div>
      <div class="side-head-body">
        <div class="eyebrow">Runtime</div>
        <div class="side-title">Task queue</div>
      </div>
    </div>
    <div class="runtime-bar">
      <div class="runtime-run" role="group" aria-label="Run tasks">
        <button type="button" class="runtime-run-btn primary" id="tickBtn" onclick="runTick()" title="Process the next ready wave once">
          <span class="runtime-run-ico" aria-hidden="true">▶</span>
          <span class="runtime-run-label" id="tickBtnLabel">Once</span>
        </button>
        <button type="button" class="runtime-run-btn" id="loopBtn" onclick="runLoopToggle()" title="Keep claiming and running tasks until you stop">
          <span class="runtime-run-ico" aria-hidden="true">↻</span>
          <span class="runtime-run-label" id="loopBtnLabel">Keep going</span>
        </button>
      </div>
      <div class="runtime-status ready" id="runtimeStatus" role="status">
        <span class="runtime-status-dot" aria-hidden="true"></span>
        <span id="runtimeStatusText">Ready</span>
      </div>
      <div class="runtime-tools" role="group" aria-label="Queue tools">
        <button type="button" class="runtime-tool" id="pauseBtn" onclick="togglePause()" title="Pause or resume the company">
          <span class="runtime-tool-ico" id="pauseBtnIco" aria-hidden="true">⏸</span>
          <span class="runtime-tool-label" id="pauseBtnLabel">Pause</span>
        </button>
        <button type="button" class="runtime-tool" id="graphBtn" onclick="openTaskGraph()" title="Task dependency graph" aria-label="Task dependency graph">
          <span class="runtime-tool-ico" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><circle class="n" cx="8" cy="3.2" r="1.55"/><circle class="n" cx="3.4" cy="12.5" r="1.55"/><circle class="n" cx="12.6" cy="12.5" r="1.55"/><path d="M8 4.8V7.2L3.8 11.1M8 7.2l4.2 3.9"/></svg></span>
          <span class="runtime-tool-label">Graph</span>
        </button>
        <button type="button" class="runtime-tool danger" id="flushBtn" onclick="flushQueue()" title="Clear queued and waiting tasks" aria-label="Clear queue">
          <span class="runtime-tool-ico" aria-hidden="true">⌫</span>
          <span class="runtime-tool-label">Clear</span>
        </button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab" id="ltQueue" onclick="setLeftTab('queue')">Queue <span class="count" id="cntQueue"></span></button>
      <button class="tab" id="ltHistory" onclick="setLeftTab('history')">History <span class="count" id="cntHistory"></span></button>
    </div>
    <div class="side-inner"><div id="tasks"></div></div>
  </section>
  <section>
    <div class="page-head">
      <div class="page-head-row">
        <div class="page-head-main">
          <button type="button" class="backlink" onclick="nav('home')">← Home</button>
          <div class="eyebrow">AI Company OS</div>
          <div class="page-title" id="coName"></div>
          <div class="subtitle" id="coGoal"></div>
        </div>
        <div class="bars" id="bars">
          <div class="bar" id="tokWrap">Tokens remaining <span class="num" id="tokTxt"></span><div class="track"><div class="fill" id="tokBar"></div></div></div>
          <button class="grant-btn" onclick="grantTokens()">＋ Grant</button>
          <button class="grant-btn" id="dataBtn" onclick="openDbBrowser()">🗄 Data</button>
          <button class="grant-btn" id="apprBtn" onclick="openApprovals()">✓ Approvals</button>
          <button class="grant-btn" onclick="openCheckins()">✉ Check-ins</button>
          <button class="grant-btn" onclick="openSchedule()">∞ Schedule</button>
          <button class="grant-btn" onclick="deleteCurrentCompany()" title="Delete this company" style="color:#f87171;border-color:rgba(248,113,113,0.35)">Delete</button>
        </div>
      </div>
    </div>
    <div class="org" id="org"></div>
  </section>
  <section class="sidebar agent-sidebar" id="agentSidebar">
    <div class="side-head">
      <div class="accentbar" id="agentAccent"></div>
      <div class="side-head-body">
        <div class="sidebar-header-top">
          <div class="eyebrow">Agents</div>
          <button type="button" class="sidebar-close" onclick="closeAgentSidebar()" aria-label="Close">×</button>
        </div>
        <div class="tabs" id="agentPills" style="border:0;padding:0.4rem 0 0"></div>
      </div>
    </div>
    <div class="tabs" id="agentTabs"></div>
    <div class="side-inner agent-body" id="agentBody"></div>
  </section>
</main>

<main id="viewPlan">
  <section>
    <div class="page-head">
      <button type="button" class="backlink" onclick="nav('home')">← Home</button>
      <div class="eyebrow">Plan</div>
      <div class="page-title" id="planTitle">New plan</div>
      <div class="subtitle">Refine in chat, then launch a company with the proposed agent roster.</div>
    </div>
    <div id="planDoc"><div class="muted">No plan yet — describe your goal in the chat.</div></div>
    <div class="planbar" id="planBar" style="display:none">
      <span class="plan-budget-display" id="planBudgetDisplay" tabindex="0" role="button" title="Click to edit token budget"></span>
      <input type="number" id="planBudgetTokens" class="plan-budget-input" min="1" step="1" style="display:none" aria-label="Token budget">
      <span class="planbar-divider" aria-hidden="true"></span>
      <label class="planbar-label muted" for="planName">Company name</label>
      <input type="text" id="planName">
      <button class="btn" id="launchBtn" onclick="launchPlan()">Launch company</button>
      <button class="btn danger" id="planDeleteBtn" onclick="deleteCurrentPlan()" title="Delete this plan">Delete plan</button>
    </div>
  </section>
  <section class="sidebar">
    <div class="side-head">
      <div class="accentbar"></div>
      <div class="side-head-body">
        <div class="eyebrow">Conversation</div>
        <div class="side-title">Plan <select id="providerSel" style="margin-left:0.5rem;font-size:0.72rem"></select></div>
      </div>
    </div>
    <div class="side-inner" style="display:flex;flex-direction:column;overflow:hidden;padding:0">
      <div class="chatbox">
        <div class="setup-chat-sidebar-log" id="planLog"></div>
        <div class="setup-chat-dock">
          <form class="setup-chat-composer" id="planChatForm" onsubmit="event.preventDefault();sendPlanMsg();">
            <div class="chat-attach-chips" id="planAttachChips" hidden></div>
            <textarea id="planInput" rows="1" placeholder="Describe what you want to accomplish..." aria-label="Message"></textarea>
            <div class="setup-chat-composer-bar">
              <span class="setup-chat-composer-hint" id="planChatHint">Enter to send · drop plan sections for context</span>
              <div class="setup-chat-composer-actions">
                <input type="file" id="planAttachFile" accept=".json,.geojson,.csv,.tsv,.txt" style="display:none" onchange="if(this.files[0])uploadToPlan(this.files[0]);this.value='';">
                <button type="button" class="setup-chat-attach" title="Attach data for your next message (overpass-turbo JSON/GeoJSON/CSV)" onclick="document.getElementById('planAttachFile').click()">📎</button>
                <button type="submit" class="setup-chat-send" id="planSend" disabled aria-label="Send message"></button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</main>

<main id="viewSkills">
  <section>
    <div class="page-head">
      <button type="button" class="backlink" onclick="nav('home')">← Home</button>
      <div class="eyebrow">Library</div>
      <div class="page-title">Skills</div>
      <div class="subtitle">A skill is a folder with a SKILL.md plus optional scripts, templates, and assets. Workspace skills override bundled ones; the whole folder is copied into companies.</div>
    </div>
    <div class="skillrow">
      <div class="skilllist">
        <div id="skillItems"></div>
      </div>
    </div>
  </section>
</main>

<main id="viewSkill">
  <section>
    <div class="page-head">
      <button type="button" class="backlink" onclick="nav('skills')">← Skills</button>
      <div class="eyebrow">Library · Skill</div>
      <div class="page-title" id="skillTitle">Skill</div>
      <div class="skill-page-meta" id="skillMeta"></div>
    </div>
    <div id="skillWorkspace">
      <div class="accentbar"></div>
      <aside class="skill-tree-pane">
        <div class="skill-tree-head">
          <span>Files</span>
          <button type="button" class="ghost-link" id="skillAddFile" onclick="addSkillFile()">＋ file</button>
        </div>
        <div id="skillTree"></div>
      </aside>
      <div class="skill-editor-pane" id="skillEditor">
        <div class="skill-editor-inner">
          <div class="skill-editor-bar">
            <input type="text" id="skillName" placeholder="skill-name" class="mono" title="Skill folder name">
            <span class="src" id="skillSrc"></span>
            <button class="btn" onclick="saveSkillEdit()">Save</button>
            <button class="btn danger" id="skillDelete" onclick="deleteSkillEdit()">Delete skill</button>
          </div>
          <div id="skillFileLabel">SKILL.md</div>
          <textarea id="skillContent" placeholder="# My Skill&#10;&#10;Instructions for the agent..."></textarea>
          <div id="skillBinaryNote">This file is packaged with the skill but is not text-editable here.</div>
          <div class="muted" id="skillMsg"></div>
        </div>
      </div>
    </div>
  </section>
</main>

<div id="modalRoot"></div>
<div id="toastHost" aria-live="polite"></div>

<button type="button" class="theme-btn" id="themeBtn" aria-label="Toggle theme" title="Toggle theme (drag to move)">☾</button>

<footer>
  <div class="sw" id="liveSw" onclick="toggleLive()">
    <div class="track2"><div class="knob"></div></div>
    Live tools
  </div>
  <div id="liveStrip"></div>
  <button type="button" class="footer-settings" id="roleSettingsBtn" onclick="openRoleSettings()" aria-label="Model settings" title="Model settings">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  </button>
</footer>

<script>
var view = 'home';
var companySlug = null;
var lastDataSigByCompany = {};

function markDataFresh(on) {
  var btn = document.getElementById('dataBtn');
  if (!btn) return;
  if (on) {
    btn.classList.add('data-fresh');
    btn.title = 'New data arrived \\u2014 open to inspect';
  } else {
    btn.classList.remove('data-fresh');
    btn.title = '';
  }
}

function noteDataSig(sig) {
  if (sig == null || !companySlug) return;
  var prev = lastDataSigByCompany[companySlug];
  if (prev != null && prev !== '' && sig !== prev) markDataFresh(true);
  lastDataSigByCompany[companySlug] = sig;
}
var state = null;
var selectedAgent = null;
var agentSidebarOpen = true;
var selectedTab = 'overview';
var leftTab = 'queue';
var planHistory = [];
var planDraft = null;
var planSlug = null;
var chatHistories = {};
var chatLoaded = {};
var chiefSending = false;
var planSending = false;
var chiefStream = null; // { status, reasoning, reply }
var planPhaseIndex = 0;
var planPhaseTimer = null;
var PLAN_ACTIVITY_PHASES = ['Composing reply\\u2026', 'Building plan\\u2026', 'Structuring agents\\u2026'];
var skills = [];
var selectedSkill = null;
var skillFilePath = 'SKILL.md';
var skillDirty = false;
var cfg = { providers: [], roles: {}, models: {}, defaultProvider: '' };
var liveTools = localStorage.getItem('liveTools') !== '0';
var RANK_ACCENT = { chief: '#eab308', manager: '#d946ef', worker: '#3b82f6' };
// every agent gets its own color: chief gold, managers purple tones, workers the rest
var PALETTE = ['#3b82f6', '#22c55e', '#06b6d4', '#f97316', '#a78bfa', '#ef4444', '#facc15', '#4ade80', '#e879f9', '#60a5fa'];

function agentColors(agents) {
  var map = {};
  var wi = 0;
  (agents || []).forEach(function (a) {
    if (a.rank === 'chief') map[a.name] = '#eab308';
    else if (a.rank === 'manager') map[a.name] = '#d946ef';
    else { map[a.name] = PALETTE[wi % PALETTE.length]; wi++; }
  });
  return map;
}

function agentColor(name) {
  if (!state) return RANK_ACCENT.worker;
  if (!state._colors) state._colors = agentColors(state.agents);
  return state._colors[name] || RANK_ACCENT.worker;
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function chatSendIconSvg() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 13V3M8 3L4 7M8 3L12 7');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.75');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

function chatSpinnerSvg() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'setup-chat-send-spinner');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '6');
  circle.setAttribute('stroke', 'currentColor');
  circle.setAttribute('stroke-width', '2');
  circle.setAttribute('fill', 'none');
  circle.setAttribute('opacity', '0.25');
  var arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arc.setAttribute('d', 'M14 8a6 6 0 0 0-6-6');
  arc.setAttribute('stroke', 'currentColor');
  arc.setAttribute('stroke-width', '2');
  arc.setAttribute('stroke-linecap', 'round');
  arc.setAttribute('fill', 'none');
  svg.appendChild(circle);
  svg.appendChild(arc);
  return svg;
}

function resizeChatTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
}

function syncChatSendBtn(btn, canSend, sending) {
  if (!btn) return;
  btn.className = 'setup-chat-send' + (canSend ? ' setup-chat-send-ready' : '');
  btn.disabled = !canSend;
  btn.setAttribute('aria-label', sending ? 'Sending' : 'Send message');
  while (btn.firstChild) btn.removeChild(btn.firstChild);
  btn.appendChild(sending ? chatSpinnerSvg() : chatSendIconSvg());
}

function syncChatComposerHint(hintEl, sending, thinkingLabel) {
  if (!hintEl) return;
  hintEl.textContent = sending ? (thinkingLabel || 'Working\\u2026') : 'Enter to send \\u00b7 Shift+Enter for newline';
}

function buildChatThinkingDots() {
  var wrap = el('span', 'setup-chat-thinking-dots');
  wrap.setAttribute('aria-hidden', 'true');
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  wrap.appendChild(el('span'));
  return wrap;
}

function appendChatThinking(log, label, id) {
  var msg = el('div', 'setup-chat-msg setup-chat-msg-assistant setup-chat-msg-thinking');
  if (id) msg.id = id;
  var body = el('div', 'setup-chat-msg-body');
  var row = el('div', 'setup-chat-thinking-row');
  row.setAttribute('aria-label', label || 'Assistant is working');
  row.appendChild(buildChatThinkingDots());
  var lbl = el('span', 'setup-chat-thinking-label thinking-label-text', label || '');
  lbl.setAttribute('aria-live', 'polite');
  row.appendChild(lbl);
  body.appendChild(row);
  msg.appendChild(body);
  log.appendChild(msg);
  log.scrollTop = log.scrollHeight;
  return msg;
}

function appendSetupChatMessage(log, role, content, reasoning, created) {
  var d = el('div', 'setup-chat-msg setup-chat-msg-' + role);
  var body = el('div', 'setup-chat-msg-body');
  if (role === 'assistant' && reasoning) {
    var details = el('details', 'setup-chat-reasoning');
    details.appendChild(el('summary', null, 'Reasoning'));
    details.appendChild(document.createTextNode(reasoning));
    body.appendChild(details);
  }
  fillChatMessageBody(body, content, created);
  d.appendChild(body);
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

/** Strip legacy "➕ queued TASK-…" lines when we render real task cards. */
function stripQueuedTaskLines(content) {
  return String(content || '')
    .replace(/(?:^|\\n)(?:\\u2795|➕)\\s*queued\\s+TASK-\\d+[^\\n]*/g, '')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}

/** Recover created-task refs from legacy assistant text if needed. */
function createdFromMessage(m) {
  if (m && Array.isArray(m.created) && m.created.length) return m.created;
  var content = m && m.content ? m.content : '';
  var out = [];
  var re = /(?:\\u2795|➕)\\s*queued\\s+(TASK-\\d+)\\s*[\\u201c"]([^\\u201d"]*)[\\u201d"]/g;
  var match;
  while ((match = re.exec(content))) {
    out.push({ id: match[1], title: match[2] || match[1] });
  }
  return out.length ? out : null;
}

function resolveChatTask(ref) {
  var live = state && state.tasks ? state.tasks.find(function (t) { return t.id === ref.id; }) : null;
  if (live) return live;
  var chief = null;
  try { chief = chiefOf(); } catch (e) {}
  return {
    id: ref.id,
    title: ref.title || ref.id,
    status: 'queued',
    assignee: chief ? chief.name : '',
    priority: 'normal',
    parent: null
  };
}

function appendChatCreatedTasks(host, created) {
  if (!created || !created.length) return;
  var wrap = el('div', 'setup-chat-created');
  created.forEach(function (ref) {
    wrap.appendChild(taskCard(resolveChatTask(ref)));
  });
  host.appendChild(wrap);
}

function fillChatMessageBody(body, content, created) {
  var text = created && created.length ? stripQueuedTaskLines(content) : content;
  if (text) body.appendChild(document.createTextNode(text));
  appendChatCreatedTasks(body, created);
}

function appendChiefStreamMessage(log) {
  var d = el('div', 'setup-chat-msg setup-chat-msg-assistant');
  d.id = 'chiefStreamMsg';
  var body = el('div', 'setup-chat-msg-body');
  var details = el('details', 'setup-chat-reasoning');
  details.id = 'chiefStreamReasoning';
  details.open = true;
  details.style.display = 'none';
  details.appendChild(el('summary', null, 'Reasoning'));
  var reasonText = el('div');
  reasonText.id = 'chiefStreamReasoningText';
  details.appendChild(reasonText);
  body.appendChild(details);
  var status = el('div', 'setup-chat-thinking-row');
  status.id = 'chiefStreamStatus';
  status.appendChild(buildChatThinkingDots());
  var statusLabel = el('span', 'setup-chat-thinking-label', (chiefStream && chiefStream.status) || 'Composing reply\\u2026');
  statusLabel.id = 'chiefStreamStatusLabel';
  status.appendChild(statusLabel);
  body.appendChild(status);
  var reply = el('div', 'setup-chat-stream-body');
  reply.id = 'chiefStreamReply';
  body.appendChild(reply);
  var caret = el('span', 'setup-chat-stream-caret');
  caret.id = 'chiefStreamCaret';
  body.appendChild(caret);
  d.appendChild(body);
  log.appendChild(d);
  syncChiefStreamDom();
  log.scrollTop = log.scrollHeight;
  return d;
}

function syncChiefStreamDom() {
  if (!chiefStream) return;
  var reasonWrap = document.getElementById('chiefStreamReasoning');
  var reasonText = document.getElementById('chiefStreamReasoningText');
  var status = document.getElementById('chiefStreamStatus');
  var statusLabel = document.getElementById('chiefStreamStatusLabel');
  var reply = document.getElementById('chiefStreamReply');
  var caret = document.getElementById('chiefStreamCaret');
  var hint = document.getElementById('chiefChatHint');
  if (reasonWrap && reasonText) {
    if (chiefStream.reasoning) {
      reasonWrap.style.display = '';
      reasonText.textContent = chiefStream.reasoning;
    } else {
      reasonWrap.style.display = 'none';
    }
  }
  if (status) {
    status.style.display = chiefStream.reply ? 'none' : '';
  }
  if (statusLabel && chiefStream.status) statusLabel.textContent = chiefStream.status;
  if (reply) reply.textContent = chiefStream.reply || '';
  if (caret) caret.style.display = chiefSending ? '' : 'none';
  if (hint) syncChatComposerHint(hint, true, chiefStream.status || 'Working\\u2026');
  var log = document.getElementById('chiefChatLog');
  if (log) log.scrollTop = log.scrollHeight;
}

function setChatMessageContent(msgEl, content) {
  if (!msgEl) return;
  msgEl.className = 'setup-chat-msg setup-chat-msg-assistant';
  msgEl.innerHTML = '';
  msgEl.appendChild(el('div', 'setup-chat-msg-body', content));
  var log = msgEl.parentElement;
  if (log) log.scrollTop = log.scrollHeight;
}

function getPlanThinkingLabel() {
  return PLAN_ACTIVITY_PHASES[planPhaseIndex % PLAN_ACTIVITY_PHASES.length];
}

function updatePlanThinkingUI() {
  var label = getPlanThinkingLabel();
  syncChatComposerHint(document.getElementById('planChatHint'), true, label);
  var thinking = document.querySelector('#planThinking .thinking-label-text');
  if (thinking) thinking.textContent = label;
}

function startPlanPhaseTimer() {
  if (planPhaseTimer) clearInterval(planPhaseTimer);
  planPhaseIndex = 0;
  updatePlanThinkingUI();
  planPhaseTimer = setInterval(function () {
    planPhaseIndex = (planPhaseIndex + 1) % PLAN_ACTIVITY_PHASES.length;
    updatePlanThinkingUI();
  }, 2800);
}

function stopPlanPhaseTimer() {
  if (planPhaseTimer) { clearInterval(planPhaseTimer); planPhaseTimer = null; }
  planPhaseIndex = 0;
}

function buildChatComposer(opts) {
  var dock = el('div', 'setup-chat-dock');
  var form = el('form', 'setup-chat-composer');
  form.onsubmit = function (e) { e.preventDefault(); opts.onSend(); };

  var chips = el('div', 'chat-attach-chips');
  chips.id = opts.attachChipsId || '';
  chips.hidden = true;
  form.appendChild(chips);

  var ta = el('textarea');
  ta.id = opts.textareaId;
  ta.placeholder = opts.placeholder;
  ta.rows = 1;
  ta.setAttribute('aria-label', 'Message');
  ta.disabled = !!opts.sending;
  function refreshSend() {
    var hasText = ta.value.trim().length > 0;
    var hasAttach = opts.hasPendingAttachments ? !!opts.hasPendingAttachments() : false;
    syncChatSendBtn(opts.sendBtnRef, (hasText || hasAttach) && !opts.sending && !ta.disabled, opts.sending);
  }
  ta.oninput = function () {
    resizeChatTextarea(ta);
    refreshSend();
  };
  ta.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); opts.onSend(); }
  };

  var bar = el('div', 'setup-chat-composer-bar');
  var hint = el('span', 'setup-chat-composer-hint');
  hint.id = opts.hintId;

  var actions = el('div', 'setup-chat-composer-actions');

  // optional 📎 attach (overpass-turbo JSON/GeoJSON/CSV or any data file)
  if (opts.onAttach) {
    var fileIn = el('input');
    fileIn.type = 'file';
    fileIn.accept = '.json,.geojson,.csv,.tsv,.txt';
    fileIn.style.display = 'none';
    fileIn.onchange = function () {
      if (fileIn.files && fileIn.files[0]) opts.onAttach(fileIn.files[0]);
      fileIn.value = '';
    };
    var attach = el('button', 'setup-chat-attach', '\\ud83d\\udcce');
    attach.type = 'button';
    attach.title = 'Attach data for your next message (overpass-turbo JSON/GeoJSON/CSV)';
    attach.onclick = function () { fileIn.click(); };
    actions.appendChild(fileIn);
    actions.appendChild(attach);
  }

  var sendBtn = el('button');
  sendBtn.type = 'submit';
  sendBtn.id = opts.sendId;
  opts.sendBtnRef = sendBtn;

  actions.appendChild(sendBtn);
  bar.appendChild(hint);
  bar.appendChild(actions);
  form.appendChild(ta);
  form.appendChild(bar);
  dock.appendChild(form);

  refreshSend();
  syncChatComposerHint(hint, !!opts.sending, opts.thinkingLabel);
  resizeChatTextarea(ta);
  if (opts.renderAttachments) opts.renderAttachments();

  return { dock: dock, textarea: ta, sendBtn: sendBtn, hint: hint, refreshSend: refreshSend };
}

function syncPlanComposer() {
  var ta = document.getElementById('planInput');
  var btn = document.getElementById('planSend');
  var hint = document.getElementById('planChatHint');
  if (!ta || !btn || !hint) return;
  ta.disabled = planSending;
  var can = (ta.value.trim().length > 0 || planPendingAttachments.length > 0) && !planSending;
  syncChatSendBtn(btn, can, planSending);
  if (planSending) syncChatComposerHint(hint, true, getPlanThinkingLabel());
  else hint.textContent = 'Enter to send \\u00b7 drop plan sections for context';
}

function insertPlanContext(text) {
  var ta = document.getElementById('planInput');
  if (!ta || planSending) return;
  var chunk = String(text || '').trim();
  if (!chunk) return;
  var cur = ta.value;
  var start = ta.selectionStart != null ? ta.selectionStart : cur.length;
  var end = ta.selectionEnd != null ? ta.selectionEnd : cur.length;
  var before = cur.slice(0, start);
  var after = cur.slice(end);
  var padBefore = before && !/\\n\\s*$/.test(before) ? '\\n\\n' : (before && !/\\n$/.test(before) ? '\\n' : '');
  var padAfter = after && !/^\\n/.test(after) ? '\\n\\n' : '';
  var next = before + padBefore + chunk + padAfter + after;
  ta.value = next;
  var caret = (before + padBefore + chunk).length;
  ta.focus();
  try { ta.setSelectionRange(caret, caret); } catch (e) {}
  resizeChatTextarea(ta);
  syncPlanComposer();
}

function bindPlanChatDrop(target) {
  if (!target || target.dataset.dropReady) return;
  target.dataset.dropReady = '1';
  target.addEventListener('dragover', function (e) {
    if (!e.dataTransfer) return;
    var types = e.dataTransfer.types;
    var ok = false;
    for (var i = 0; i < types.length; i++) {
      if (types[i] === 'text/plain' || types[i] === 'text/uri-list') { ok = true; break; }
    }
    if (!ok) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    target.classList.add('drag-over');
  });
  target.addEventListener('dragleave', function (e) {
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;
    target.classList.remove('drag-over');
  });
  target.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    target.classList.remove('drag-over');
    var text = e.dataTransfer && e.dataTransfer.getData('text/plain');
    if (text) insertPlanContext(text);
  });
}

function makePlanDraggable(node, getText) {
  if (!node) return node;
  node.classList.add('plan-seg');
  node.draggable = true;
  node.title = node.title || 'Drag into chat for context';
  node.addEventListener('dragstart', function (e) {
    var text = typeof getText === 'function' ? getText() : getText;
    text = String(text || '').trim();
    if (!text) { e.preventDefault(); return; }
    e.stopPropagation();
    node.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', text);
    try {
      var ghost = node.cloneNode(true);
      ghost.style.position = 'absolute';
      ghost.style.top = '-9999px';
      ghost.style.width = Math.min(node.offsetWidth, 320) + 'px';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 16, 16);
      setTimeout(function () { ghost.remove(); }, 0);
    } catch (err) {}
  });
  node.addEventListener('dragend', function () { node.classList.remove('dragging'); });
  return node;
}

function planSegHeading(title) {
  var h = el('h2', 'sec');
  h.appendChild(el('span', 'plan-seg-grip', '\\u2837'));
  h.appendChild(document.createTextNode(title));
  return h;
}

function appendPlanSegment(box, title, buildBody, getText) {
  var seg = el('div', 'plan-seg');
  seg.appendChild(planSegHeading(title));
  var body = el('div', 'plan-seg-body');
  buildBody(body);
  seg.appendChild(body);
  makePlanDraggable(seg, getText);
  box.appendChild(seg);
  return seg;
}

function agentContextText(a) {
  var lines = ['--- Agent: ' + a.name + ' ---', 'rank: ' + a.rank, 'role: ' + a.role];
  if (a.manager) lines.push('reports to: ' + a.manager);
  if ((a.tools || []).length) lines.push('tools: ' + a.tools.join(', '));
  if ((a.skills || []).length) lines.push('skills: ' + a.skills.join(', '));
  (a.responsibilities || []).forEach(function (r) { lines.push('- ' + r); });
  return lines.join('\\n');
}

function initPlanChatComposer() {
  var ta = document.getElementById('planInput');
  var btn = document.getElementById('planSend');
  var form = document.getElementById('planChatForm');
  if (!ta || !btn || btn.dataset.ready) return;
  btn.dataset.ready = '1';
  ta.oninput = function () { resizeChatTextarea(ta); syncPlanComposer(); };
  ta.onkeydown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPlanMsg(); }
  };
  bindPlanChatDrop(form);
  syncPlanComposer();
}

// ---------- router: every view has a real, deep-linkable URL ----------
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

// ---------- home ----------

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
  var del = el('button', 'row-del', '\\u00d7');
  del.type = 'button';
  del.title = 'Delete company';
  del.setAttribute('aria-label', 'Delete ' + co.name);
  del.onclick = function (e) {
    e.stopPropagation();
    deleteCompany(co.slug, co.name);
  };
  side.appendChild(del);
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
    if (planDoc) planDoc.innerHTML = '<div class="muted">No plan yet — describe your goal in the chat.</div>';
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

    var box = document.getElementById('companyRows');
    var coBlock = document.getElementById('companiesBlock');
    var coCount = document.getElementById('homeCompanyCount');
    if (box) {
      box.innerHTML = '';
      sorted.forEach(function (co) {
        box.appendChild(renderCompanyRow(co));
      });
    }
    if (coBlock) coBlock.hidden = !list.length;
    if (coCount) coCount.textContent = list.length ? list.length + ' compan' + (list.length === 1 ? 'y' : 'ies') : '';

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
          document.getElementById('planDoc').innerHTML = '<div class="muted">No plan yet — describe your goal in the chat.</div>';
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
    var shown = list.slice(0, 8);
    shown.forEach(function (s) {
      var preview = skillPreview(s.content, s.name);
      var chip = el('div', 'skill-chip');
      var name = el('div', 'name');
      name.appendChild(el('span', 'src ' + s.source, s.source));
      name.appendChild(el('span', null, preview.title || s.name));
      chip.appendChild(name);
      var bits = [];
      if (s.files > 1) bits.push(s.files + ' files');
      if (s.hasScripts) bits.push('scripts');
      if (bits.length) chip.appendChild(el('div', 'meta', bits.join(' \\u00b7 ')));
      chip.onclick = function () { openSkill(s.name); };
      box.appendChild(chip);
    });
    var more = el('div', 'skill-chip more', list.length > shown.length
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

// ---------- company ----------

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

// ---------- reusable modal ----------

var modalPoll = null;
/** Live task modal session — kept while an audit overlay is open so polls
 * don't yank the UI back to the task. */
var taskModalLive = null;

function closeModal() {
  if (modalPoll) { clearInterval(modalPoll); modalPoll = null; }
  taskModalLive = null;
  document.getElementById('modalRoot').innerHTML = '';
}

function syncModalBackDot() {
  var dot = document.getElementById('modalBackDot');
  if (!dot) return;
  var on = !!(taskModalLive && taskModalLive.viewingAudit && taskModalLive.dirty);
  dot.className = 'modal-back-dot' + (on ? ' on' : '');
  var backBtn = dot.parentElement;
  if (backBtn && backBtn.classList.contains('modal-back')) {
    backBtn.title = on ? 'Task updated while you were away' : '';
  }
}

/** Reusable modal: opts = { eyebrow, title, accent, subNode?, back?: { label, go }, body(bodyEl) }
 * Replaces the modal DOM but does NOT touch modalPoll — live re-renders keep
 * their polling; only closeModal() (user action) stops it. */
function showModal(opts) {
  var root = document.getElementById('modalRoot');
  root.innerHTML = '';
  var back = el('div', 'modal-backdrop');
  back.onclick = function (e) { if (e.target === back) closeModal(); };
  var m = el('div', 'modal' + (opts.className ? ' ' + opts.className : ''));
  var accent = el('div', 'modal-accent');
  if (opts.accent) accent.style.background = opts.accent;
  m.appendChild(accent);
  var head = el('div', 'modal-head');
  var hb = el('div', 'modal-head-body');
  var left = el('div');
  if (opts.back && opts.back.go) {
    var backBtn = el('button', 'modal-back');
    backBtn.type = 'button';
    backBtn.appendChild(document.createTextNode('\\u2190 ' + (opts.back.label || 'Back')));
    var backDot = el('span', 'modal-back-dot');
    backDot.id = 'modalBackDot';
    backBtn.appendChild(backDot);
    backBtn.onclick = function () { opts.back.go(); };
    left.appendChild(backBtn);
  }
  if (opts.subNode) { var sub = el('div', 'modal-sub'); sub.appendChild(opts.subNode); left.appendChild(sub); }
  else if (opts.eyebrow) left.appendChild(el('div', 'eyebrow', opts.eyebrow));
  left.appendChild(el('div', 'modal-title', opts.title || ''));
  hb.appendChild(left);
  var x = el('button', 'modal-close', '\\u2715');
  x.onclick = closeModal;
  hb.appendChild(x);
  head.appendChild(hb);
  m.appendChild(head);
  var body = el('div', 'modal-body');
  m.appendChild(body);
  back.appendChild(m);
  root.appendChild(back);
  if (opts.body) opts.body(body);
  syncModalBackDot();
  return { body: body, accentEl: accent, titleEl: left };
}

/** Confirm dialog: opts = { title, message, confirmLabel?, cancelLabel?, onConfirm() }
 * onConfirm may return a Promise; the modal stays open with a busy state until it settles. */
function confirmModal(opts) {
  showModal({
    className: 'confirm',
    eyebrow: 'Confirm',
    title: opts.title || 'Are you sure?',
    accent: '#f87171',
    body: function (body) {
      var msg = el('p', 'confirm-msg');
      msg.textContent = opts.message || '';
      body.appendChild(msg);
      var err = el('div', 'muted');
      err.style.color = '#f87171';
      err.style.marginTop = '0.75rem';
      err.style.fontSize = '0.8rem';
      err.hidden = true;
      body.appendChild(err);
      var actions = el('div', 'confirm-actions');
      var cancel = el('button', 'btn ghost', opts.cancelLabel || 'Cancel');
      cancel.type = 'button';
      cancel.onclick = closeModal;
      var ok = el('button', 'btn danger', opts.confirmLabel || 'Delete');
      ok.type = 'button';
      ok.onclick = function () {
        err.hidden = true;
        err.textContent = '';
        ok.disabled = true;
        cancel.disabled = true;
        ok.textContent = opts.busyLabel || 'Working\\u2026';
        Promise.resolve()
          .then(function () { return opts.onConfirm ? opts.onConfirm() : null; })
          .then(function () { closeModal(); })
          .catch(function (e) {
            ok.disabled = false;
            cancel.disabled = false;
            ok.textContent = opts.confirmLabel || 'Delete';
            err.textContent = (e && e.message) || 'Something went wrong';
            err.hidden = false;
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(ok);
      body.appendChild(actions);
      setTimeout(function () { ok.focus(); }, 0);
    }
  });
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

var STATUS_ACCENT = {
  queued: '#60a5fa', running: '#fbbf24', waiting: '#e879f9', done: '#4ade80', failed: '#f87171'
};

function agentNamed(name) {
  if (!state || !name) return false;
  return state.agents.some(function (a) { return a.name === name; });
}

function metaCell(k, v, agentName) {
  var c = el('div', 'meta-cell');
  c.appendChild(el('div', 'k', k));
  var val = el('div', 'v');
  var label = v || '\\u2014';
  if (agentName && agentNamed(agentName)) {
    var dot = el('span', 'adot');
    dot.style.background = agentColor(agentName);
    val.appendChild(dot);
    val.appendChild(document.createTextNode(label));
  } else {
    val.textContent = label;
  }
  c.appendChild(val);
  return c;
}

function fmtTs(ts) { return ts ? ts.replace('T', ' ').slice(0, 19) : ''; }

// ---------- task detail modal ----------

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

// ---------- governance: pause / approvals / check-ins / schedule ----------

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

// ---------- runtime controls ----------

var runnerState = { mode: null, stopRequested: false };

function refreshRunner() {
  if (view !== 'company' || !companySlug) return;
  fetch('/api/run/status?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      runnerState = s;
      var tickBtn = document.getElementById('tickBtn');
      var loopBtn = document.getElementById('loopBtn');
      var tickLabel = document.getElementById('tickBtnLabel');
      var loopLabel = document.getElementById('loopBtnLabel');
      var status = document.getElementById('runtimeStatus');
      var statusText = document.getElementById('runtimeStatusText');
      if (!tickBtn || !loopBtn) return;

      tickBtn.disabled = !!s.mode;
      if (s.mode === 'tick') {
        tickBtn.className = 'runtime-run-btn busy';
        if (tickLabel) tickLabel.textContent = 'Working\\u2026';
      } else {
        tickBtn.className = 'runtime-run-btn primary';
        if (tickLabel) tickLabel.textContent = 'Once';
      }

      if (s.mode === 'loop') {
        loopBtn.className = 'runtime-run-btn stop';
        loopBtn.disabled = s.stopRequested;
        if (loopLabel) {
          loopLabel.textContent = s.stopRequested
            ? 'Stopping\\u2026'
            : ('Stop \\u00b7 ' + (s.ticks || 0));
        }
      } else {
        loopBtn.className = 'runtime-run-btn';
        loopBtn.disabled = !!s.mode;
        if (loopLabel) loopLabel.textContent = 'Keep going';
      }

      if (status && statusText) {
        var paused = state && state.meta && state.meta.paused;
        if (paused) {
          status.className = 'runtime-status paused';
          statusText.textContent = 'Paused \\u2014 resume to run';
        } else if (s.mode === 'loop') {
          status.className = 'runtime-status' + (s.stopRequested ? ' stopping' : ' busy');
          statusText.textContent = s.stopRequested
            ? 'Stopping after this wave\\u2026'
            : ('Keep going \\u00b7 wave ' + (s.ticks || 0));
        } else if (s.mode === 'tick') {
          status.className = 'runtime-status busy';
          statusText.textContent = 'Running one wave\\u2026';
        } else {
          status.className = 'runtime-status ready';
          statusText.textContent = 'Ready';
        }
      }
    })
    .catch(function () {});
}

function flashStrip(msg) {
  var strip = document.getElementById('liveStrip');
  strip.innerHTML = '';
  var s = el('span', null, msg);
  s.style.color = '#f87171';
  strip.appendChild(s);
}

function showToast(msg, kind, opts) {
  opts = opts || {};
  var host = document.getElementById('toastHost');
  if (!host) { flashStrip(msg); return; }
  var t = el('div', 'toast' + (kind === 'err' ? ' err' : kind === 'ok' ? ' ok' : ''));
  var row = el('div', 'toast-row');
  row.appendChild(el('div', 'toast-msg', msg));
  if (opts.actionLabel && opts.onAction) {
    var act = el('button', 'toast-action', opts.actionLabel);
    act.type = 'button';
    act.onclick = function (e) {
      e.stopPropagation();
      t.remove();
      opts.onAction();
    };
    row.appendChild(act);
  }
  t.appendChild(row);
  host.appendChild(t);
  var ms = opts.duration || (kind === 'err' ? 7000 : 2800);
  setTimeout(function () {
    if (!t.parentNode) return;
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.2s ease';
    setTimeout(function () { t.remove(); }, 220);
  }, ms);
}

function raisePriorityRequest(id, opts) {
  opts = opts || {};
  return fetch('/api/task/priority', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, id: id, force: !!opts.force })
  }).then(function (r) { return r.json(); }).then(function (res) {
    if (res.error) {
      if (res.code === 'already_front' && !opts.force) {
        showToast(res.error, 'err', {
          actionLabel: 'Force',
          duration: 10000,
          onAction: function () {
            raisePriorityRequest(id, { force: true, onDone: opts.onDone })
              .catch(function () { showToast('Priority update failed', 'err'); });
          }
        });
      } else {
        showToast(res.error, 'err');
      }
      return res;
    }
    showToast(
      id + (res.forced ? ' forced' : '') + ' \\u2191 ' + res.priority +
        (res.moved && res.moved.length ? ' \\u00b7 ' + res.moved.join(', ') : ''),
      'ok'
    );
    refresh();
    if (opts.onDone) opts.onDone(res);
    return res;
  });
}

function runTick() {
  if (!companySlug) { flashStrip('open a company first'); return; }
  document.getElementById('tickBtn').disabled = true;
  fetch('/api/run/tick', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) flashStrip('tick: ' + d.error);
    refreshRunner(); refresh();
  }).catch(function (e) { flashStrip('tick failed: ' + e); refreshRunner(); });
}

function runLoopToggle() {
  if (!companySlug) { flashStrip('open a company first'); return; }
  var action = runnerState.mode === 'loop' ? 'stop' : 'start';
  document.getElementById('loopBtn').disabled = true;
  fetch('/api/run/loop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, action: action })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (d.error) flashStrip('loop: ' + d.error);
    refreshRunner(); refresh();
  }).catch(function (e) { flashStrip('loop failed: ' + e); refreshRunner(); });
}

function runningAgents() {
  if (!state) return {};
  var out = {};
  state.tasks.forEach(function (t) { if (t.status === 'running') out[t.assignee] = t.id; });
  return out;
}

function nodeFor(a, opts) {
  opts = opts || {};
  var running = opts.static ? {} : runningAgents();
  var accent = opts.colors
    ? (opts.colors[a.name] || RANK_ACCENT[a.rank] || RANK_ACCENT.worker)
    : agentColor(a.name);
  var showTools = opts.showTools !== undefined ? opts.showTools : liveTools;
  var n = el('div', 'org-card' + (!opts.static && selectedAgent === a.name ? ' sel' : '') + (running[a.name] ? ' active' : ''));
  n.style.setProperty('--accent', accent);
  n.appendChild(el('div', 'org-accent'));
  var body = el('div', 'org-body');
  body.appendChild(el('span', 'org-rank ' + a.rank, a.rank));
  body.appendChild(el('div', 'org-name', a.name));
  body.appendChild(el('div', 'org-role', a.role));
  if (showTools && ((a.tools || []).length || (a.skills || []).length)) {
    var chips = el('div', 'org-tools');
    var hotTool = opts.static ? null : liveToolFor(a.name);
    (a.tools || []).forEach(function (t) { chips.appendChild(el('span', 'chip' + (hotTool === t ? ' hot' : ''), t)); });
    (a.skills || []).forEach(function (s) { chips.appendChild(el('span', 'chip skill', s)); });
    body.appendChild(chips);
  }
  if (!opts.static && liveTools && running[a.name]) body.appendChild(el('div', 'org-task-tag', '\\u25b6 ' + running[a.name]));
  n.appendChild(body);
  if (!opts.static) n.onclick = function () { selectAgent(a.name); };
  return n;
}

function renderOrgInto(box, agents, opts) {
  box.innerHTML = '';
  function subtree(a) {
    var wrap = el('div', 'sub');
    wrap.appendChild(nodeFor(a, opts));
    var kids = agents.filter(function (x) { return x.manager === a.name; });
    if (kids.length) {
      wrap.appendChild(el('div', 'down')); // stub from parent card into the rail
      var row = el('div', 'kids');
      kids.forEach(function (k) { row.appendChild(subtree(k)); });
      wrap.appendChild(row);
    }
    return wrap;
  }
  agents.filter(function (a) { return !a.manager; }).forEach(function (a) {
    box.appendChild(subtree(a));
  });
}

function renderOrg(agents) {
  renderOrgInto(document.getElementById('org'), agents, {});
}

function chiefOf() {
  if (!state) return null;
  var c = state.agents.filter(function (a) { return a.rank === 'chief'; })[0];
  return c || state.agents[0] || null;
}

function selectAgent(name) {
  selectedAgent = name;
  agentSidebarOpen = true;
  syncCompanyLayout();
  renderAgentPanel();
  renderOrg(state.agents);
}

function ensureAgentSelection() {
  if (!agentSidebarOpen || !state || !state.agents.length) return;
  if (!selectedAgent) selectedAgent = (chiefOf() || state.agents[0]).name;
}

function renderAgentPanel() {
  if (!state) return;
  ensureAgentSelection();
  var pills = document.getElementById('agentPills');
  pills.innerHTML = '';
  state.agents.forEach(function (a) {
    var p = el('button', 'tab' + (a.name === selectedAgent ? ' on' : ''));
    var dot = el('span', 'dot');
    dot.style.background = agentColor(a.name);
    p.appendChild(dot);
    p.appendChild(document.createTextNode(a.name));
    p.onclick = function () { selectAgent(a.name); };
    pills.appendChild(p);
  });

  var sel = state.agents.filter(function (x) { return x.name === selectedAgent; })[0];
  document.getElementById('agentAccent').style.background = sel ? agentColor(sel.name) : '';

  var chief = chiefOf();
  var tabs = [
    ['overview', 'Overview'], ['tasks', 'Tasks'], ['files', 'Files'], ['audit', 'Audit']
  ];
  if (chief && sel && sel.name === chief.name) tabs.push(['chat', 'Chat']);
  if (selectedTab === 'chat' && (!chief || !sel || sel.name !== chief.name)) selectedTab = 'overview';
  var tb = document.getElementById('agentTabs');
  tb.innerHTML = '';
  tabs.forEach(function (t) {
    var b = el('button', 'tab' + (selectedTab === t[0] ? ' on' : ''), t[1]);
    b.onclick = function () { selectedTab = t[0]; renderAgentPanel(); };
    tb.appendChild(b);
  });

  var body = document.getElementById('agentBody');
  var a = sel;
  if (!a) { body.innerHTML = ''; body.className = 'side-inner agent-body'; return; }

  if (selectedTab === 'chat') { renderChiefChat(body); return; }
  body.innerHTML = '';
  body.className = 'side-inner agent-body';
  body.style.display = 'block';
  body.style.overflowY = 'auto';

  if (selectedTab === 'overview') {
    body.appendChild(el('pre', 'doc', a.profile || '(no profile)'));
  } else if (selectedTab === 'tasks') {
    var mine = state.tasks.filter(function (t) { return t.assignee === a.name; });
    if (!mine.length) body.appendChild(el('div', 'muted', 'no tasks assigned'));
    mine.forEach(function (t) {
      body.appendChild(taskCard(t));
      if (t.result) {
        var r = el('pre', 'doc', t.result);
        r.style.marginTop = '-2px';
        r.style.marginBottom = '0.55rem';
        body.appendChild(r);
      }
    });
  } else if (selectedTab === 'files') {
    if (!a.files || !a.files.length) body.appendChild(el('div', 'muted', 'no files yet'));
    (a.files || []).forEach(function (f) {
      var row = el('div', 'file');
      row.appendChild(el('span', null, f.path.replace('agents/' + a.name + '/', '')));
      row.appendChild(el('span', null, f.size + ' B'));
      row.onclick = function () { openCompanyFileModal(f.path); };
      body.appendChild(row);
    });
  } else if (selectedTab === 'audit') {
    var evts = state.audit.filter(function (e) { return e.agent === a.name; });
    if (!evts.length) body.appendChild(el('div', 'muted', 'no events yet'));
    evts.slice().reverse().forEach(function (e) { body.appendChild(evtRow(e)); });
  }
}

function planningChatDisplayContent(m) {
  if (m.role !== 'assistant') return m.content;
  try {
    var parsed = JSON.parse(m.content);
    if (parsed && typeof parsed.reply === 'string') return parsed.reply;
  } catch (e) {}
  return m.content;
}

function renderChiefChat(body) {
  var chief = chiefOf();
  body.innerHTML = '';
  body.className = 'side-inner agent-body chat-mode';
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.overflowY = 'hidden';

  var box = el('div', 'chatbox');
  var log = el('div', 'setup-chat-sidebar-log');
  log.id = 'chiefChatLog';

  var planning = (state && Array.isArray(state.planningChat)) ? state.planningChat : [];
  if (planning.length) {
    var archive = el('div', 'setup-chat-archive');
    archive.appendChild(el('p', 'setup-chat-archive-label', 'Planning'));
    planning.forEach(function (m) {
      appendSetupChatMessage(
        archive,
        m.role === 'user' ? 'user' : 'assistant',
        planningChatDisplayContent(m),
        m.reasoning
      );
    });
    log.appendChild(archive);
  }

  var hist = chatHistories[companySlug] || [];
  if (!hist.length) {
    log.appendChild(el('p', 'setup-chat-status', 'Talk to ' + chief.name + ' \\u2014 ask about progress or hand over new work. New tasks land in the queue; run them with "ai-company-os run".'));
  }
  hist.forEach(function (m) {
    appendSetupChatMessage(
      log,
      m.role === 'user' ? 'user' : 'assistant',
      m.content,
      m.reasoning,
      m.role === 'assistant' ? createdFromMessage(m) : null
    );
  });
  if (chiefSending) {
    appendChiefStreamMessage(log);
  }

  var anchor = el('div');
  anchor.id = 'chiefChatEnd';
  log.appendChild(anchor);
  box.appendChild(log);

  var composer = buildChatComposer({
    textareaId: 'chiefInput',
    sendId: 'chiefSend',
    hintId: 'chiefChatHint',
    attachChipsId: 'chiefAttachChips',
    placeholder: 'Message ' + chief.name + '\\u2026',
    sending: chiefSending,
    thinkingLabel: (chiefStream && chiefStream.status) || 'Working\\u2026',
    onSend: sendChiefMsg,
    onAttach: uploadToChief,
    hasPendingAttachments: function () { return chiefPendingAttachments.length > 0; },
    renderAttachments: renderChiefAttachChips
  });
  box.appendChild(composer.dock);
  body.appendChild(box);

  anchor.scrollIntoView({ behavior: 'smooth' });
}

function finishChiefStream(hist, reply, reasoning, created) {
  chiefSending = false;
  if (reply != null) {
    var msg = { role: 'assistant', content: reply, reasoning: reasoning || undefined };
    if (created && created.length) msg.created = created;
    hist.push(msg);
  }
  // Finalize the live bubble in place so the answer doesn't "pop" after streaming.
  var streamMsg = document.getElementById('chiefStreamMsg');
  if (streamMsg && reply != null) {
    streamMsg.id = '';
    streamMsg.innerHTML = '';
    var body = el('div', 'setup-chat-msg-body');
    if (reasoning) {
      var details = el('details', 'setup-chat-reasoning');
      details.appendChild(el('summary', null, 'Reasoning'));
      details.appendChild(document.createTextNode(reasoning));
      body.appendChild(details);
    }
    fillChatMessageBody(body, reply, created);
    streamMsg.appendChild(body);
    var ta = document.getElementById('chiefInput');
    var btn = document.getElementById('chiefSend');
    var hint = document.getElementById('chiefChatHint');
    if (ta) { ta.disabled = false; resizeChatTextarea(ta); }
    if (btn) syncChatSendBtn(btn, false, false);
    if (hint) syncChatComposerHint(hint, false);
  } else {
    renderAgentPanel();
  }
  chiefStream = null;
  refresh({ paintChat: !!(created && created.length) });
}

// ---------- data uploads (📎 in chief chat + plan chat) ----------

var chiefPendingAttachments = [];
var planPendingAttachments = [];

function readFileB64(file, cb) {
  var r = new FileReader();
  r.onload = function () { cb(String(r.result).split(',')[1]); };
  r.readAsDataURL(file);
}

function chiefUploadNote(d) {
  var note = 'I uploaded ' + d.path;
  if (d.bytes) note += ' (' + d.bytes + ' B)';
  if (d.preview) {
    note += ' \\u2014 parsed as a business list: ' + d.preview.rows + ' rows, ' +
      d.preview.withEmail + ' with email (e.g. ' + (d.preview.sample || []).join(', ') + ')';
  } else if (d.parseError) {
    note += ' \\u2014 file saved but business parse failed: ' + d.parseError;
  }
  note += '. Import with importdata on this exact path (do not rewrite truncated copies).';
  return note;
}

function planUploadNote(d) {
  var note = 'I uploaded a data file (' + d.path + ')';
  if (d.bytes) note += ' ' + d.bytes + ' B';
  if (d.preview) note += ' with ' + d.preview.rows + ' businesses (' + d.preview.withEmail + ' incl. email)';
  else if (d.parseError) note += ' \\u2014 parse failed: ' + d.parseError;
  note += ' \\u2014 it will be available to the company at data/uploads/. Plan an importdata step on the original file (no truncated rewrite).';
  return note;
}

function renderAttachChips(hostId, list, onChange) {
  var host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = '';
  if (!list.length) { host.hidden = true; return; }
  host.hidden = false;
  list.forEach(function (a, i) {
    var chip = el('span', 'chat-attach-chip');
    chip.appendChild(el('span', null, '\\ud83d\\udcce ' + (a.name || a.path)));
    chip.title = a.path || a.name || '';
    var x = el('button', 'chat-attach-chip-x', '\\u00d7');
    x.type = 'button';
    x.title = 'Remove attachment';
    x.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      list.splice(i, 1);
      if (onChange) onChange();
    };
    chip.appendChild(x);
    host.appendChild(chip);
  });
}

function renderChiefAttachChips() {
  renderAttachChips('chiefAttachChips', chiefPendingAttachments, function () {
    renderChiefAttachChips();
    syncChiefComposerReady();
  });
}

function renderPlanAttachChips() {
  renderAttachChips('planAttachChips', planPendingAttachments, function () {
    renderPlanAttachChips();
    syncPlanComposer();
  });
}

function syncChiefComposerReady() {
  var ta = document.getElementById('chiefInput');
  var btn = document.getElementById('chiefSend');
  if (!ta || !btn) return;
  var can = (ta.value.trim().length > 0 || chiefPendingAttachments.length > 0) && !chiefSending && !ta.disabled;
  syncChatSendBtn(btn, can, chiefSending);
}

function uploadToChief(file) {
  readFileB64(file, function (b64) {
    fetch('/api/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ company: companySlug, filename: file.name, dataBase64: b64 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { showToast('upload failed: ' + d.error, 'err'); return; }
      chiefPendingAttachments.push({
        path: d.path,
        name: file.name,
        preview: d.preview || null,
        note: chiefUploadNote(d)
      });
      renderChiefAttachChips();
      syncChiefComposerReady();
      showToast('Attached ' + file.name + ' \\u2014 add a message and send', 'ok');
      var ta = document.getElementById('chiefInput');
      if (ta) ta.focus();
    }).catch(function (e) { showToast('upload failed: ' + e, 'err'); });
  });
}

function uploadToPlan(file) {
  readFileB64(file, function (b64) {
    fetch('/api/plan/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: planSlug || '', filename: file.name, dataBase64: b64 })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) { showToast('upload failed: ' + d.error, 'err'); return; }
      planSlug = d.slug; // a fresh plan gets its slug from the upload
      planPendingAttachments.push({
        path: d.path,
        name: file.name,
        preview: d.preview || null,
        note: planUploadNote(d)
      });
      ensurePlanAttachChips();
      renderPlanAttachChips();
      syncPlanComposer();
      showToast('Attached ' + file.name + ' \\u2014 add a message and send', 'ok');
      var ta = document.getElementById('planInput');
      if (ta) ta.focus();
    }).catch(function (e) { showToast('upload failed: ' + e, 'err'); });
  });
}

function ensurePlanAttachChips() {
  var form = document.getElementById('planChatForm');
  if (!form) return;
  var chips = document.getElementById('planAttachChips');
  if (chips) return;
  chips = el('div', 'chat-attach-chips');
  chips.id = 'planAttachChips';
  chips.hidden = true;
  var ta = document.getElementById('planInput');
  if (ta && ta.parentNode === form) form.insertBefore(chips, ta);
  else form.insertBefore(chips, form.firstChild);
}

function sendChiefMsg() {
  var ta = document.getElementById('chiefInput');
  if (!ta) return;
  var text = ta.value.trim();
  var notes = chiefPendingAttachments.map(function (a) { return a.note; });
  if ((!text && !notes.length) || chiefSending) return;
  var message = notes.length
    ? (notes.join('\\n') + (text ? '\\n\\n' + text : '')).trim()
    : text;
  chiefPendingAttachments = [];
  renderChiefAttachChips();
  if (!chatHistories[companySlug]) chatHistories[companySlug] = [];
  var hist = chatHistories[companySlug];
  var prior = hist.slice();
  ta.value = '';
  chiefSending = true;
  chiefStream = { status: 'Composing reply\\u2026', reasoning: '', reply: '' };
  hist.push({ role: 'user', content: message });
  renderAgentPanel();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, message: message, history: prior })
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    if (!r.body || !r.body.getReader) throw new Error('streaming not supported');
    var reader = r.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    function pump() {
      return reader.read().then(function (result) {
        if (result.done) {
          if (chiefSending) {
            var fallback = (chiefStream && chiefStream.reply) || '(empty reply)';
            finishChiefStream(hist, fallback, chiefStream && chiefStream.reasoning);
          }
          return;
        }
        buf += decoder.decode(result.value, { stream: true });
        var parts = buf.split('\\n');
        buf = parts.pop() || '';
        parts.forEach(function (line) {
          var trimmed = line.trim();
          if (trimmed.indexOf('data:') !== 0) return;
          var payload = trimmed.slice(5).trim();
          if (!payload) return;
          var evt;
          try { evt = JSON.parse(payload); } catch (e) { return; }
          if (!chiefStream) chiefStream = { status: '', reasoning: '', reply: '' };
          if (evt.type === 'status') {
            chiefStream.status = evt.label || 'Working\\u2026';
            syncChiefStreamDom();
          } else if (evt.type === 'reasoning') {
            chiefStream.reasoning += evt.text || '';
            syncChiefStreamDom();
          } else if (evt.type === 'delta') {
            chiefStream.reply += evt.text || '';
            syncChiefStreamDom();
          } else if (evt.type === 'lookup') {
            chiefStream.status = 'Looking up ' + (evt.path || 'details') + '\\u2026';
            syncChiefStreamDom();
          } else if (evt.type === 'done') {
            var reply = evt.reply || chiefStream.reply || '';
            finishChiefStream(hist, reply, evt.reasoning || chiefStream.reasoning, evt.created || []);
          } else if (evt.type === 'error') {
            finishChiefStream(hist, '(error: ' + evt.error + ')');
          }
        });
        if (chiefSending) return pump();
      });
    }
    return pump();
  }).catch(function (e) {
    finishChiefStream(hist, '(request failed: ' + e + ')');
  });
}

function parseLlmCallDetail(detail) {
  // e.g. "cursor/auto 2322+276tok" or an error message
  var m = String(detail || '').match(/^([^/\\s]+)\\/(\\S+)\\s+(\\d+)\\+(\\d+)tok\\b/);
  if (!m) return null;
  return {
    provider: m[1],
    model: m[2],
    promptTokens: Number(m[3]),
    completionTokens: Number(m[4]),
    totalTokens: Number(m[3]) + Number(m[4]),
  };
}

function tryPrettyJson(text) {
  var s = String(text || '').trim();
  if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) return null;
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch (e) {
    return null;
  }
}

function appendDetailDoc(parent, detail, maxHeight) {
  var pretty = tryPrettyJson(detail);
  var pre = el('pre', 'doc' + (pretty ? ' json' : ''));
  if (maxHeight) pre.style.maxHeight = maxHeight;
  if (pretty) {
    var esc = pretty
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    var out = '';
    var i = 0;
    while (i < esc.length) {
      var ch = esc.charAt(i);
      if (ch === '"') {
        var j = i + 1;
        while (j < esc.length) {
          if (esc.charAt(j) === '\\\\') { j += 2; continue; }
          if (esc.charAt(j) === '"') { j++; break; }
          j++;
        }
        var str = esc.slice(i, j);
        var k = j;
        while (k < esc.length && /\\s/.test(esc.charAt(k))) k++;
        if (esc.charAt(k) === ':') out += '<span class="jk">' + str + '</span>';
        else out += '<span class="js">' + str + '</span>';
        i = j;
        continue;
      }
      if (/[\\d-]/.test(ch)) {
        var num = esc.slice(i).match(/^-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?/);
        if (num) {
          out += '<span class="jn">' + num[0] + '</span>';
          i += num[0].length;
          continue;
        }
      }
      if (/[tfn]/.test(ch)) {
        var lit = esc.slice(i).match(/^(true|false|null)\\b/);
        if (lit) {
          out += '<span class="jb">' + lit[0] + '</span>';
          i += lit[0].length;
          continue;
        }
      }
      out += ch;
      i++;
    }
    pre.innerHTML = out;
  } else {
    pre.textContent = detail;
  }
  parent.appendChild(pre);
  return pre;
}

function openAuditEventModal(e, fromTask) {
  if (fromTask && taskModalLive) {
    taskModalLive.viewingAudit = true;
    taskModalLive.dirty = false;
  }
  var back = null;
  if (fromTask && taskModalLive) {
    back = {
      label: taskModalLive.id || e.taskId || 'Task',
      go: function () {
        if (!taskModalLive) return;
        taskModalLive.viewingAudit = false;
        taskModalLive.dirty = false;
        var d = taskModalLive.latest;
        if (d) renderTaskModal(d, true, taskModalLive.opts || {});
        else openTaskModal(taskModalLive.id, taskModalLive.opts || {});
      }
    };
  } else if (e.taskId) {
    back = {
      label: e.taskId,
      go: function () { openTaskModal(e.taskId); }
    };
  }
  showModal({
    eyebrow: 'Audit event',
    title: e.type || 'Event',
    accent: e.ok ? '#4ade80' : '#f87171',
    back: back,
    body: function (body) {
      var grid = el('div', 'meta-grid');
      grid.appendChild(metaCell('Status', e.ok ? 'OK' : 'ERR'));
      grid.appendChild(metaCell('When', fmtTs(e.ts)));
      if (e.agent) grid.appendChild(metaCell('Agent', e.agent, e.agent));
      if (e.taskId) grid.appendChild(metaCell('Task', e.taskId));

      var detail = e.detail || '';
      var llm = e.type === 'llm.call' ? parseLlmCallDetail(detail) : null;
      if (llm) {
        grid.appendChild(metaCell('Provider', llm.provider));
        grid.appendChild(metaCell('Model', llm.model));
        grid.appendChild(metaCell('Prompt tok', llm.promptTokens.toLocaleString()));
        grid.appendChild(metaCell('Completion', llm.completionTokens.toLocaleString()));
        grid.appendChild(metaCell('Total', llm.totalTokens.toLocaleString()));
      }
      body.appendChild(grid);

      if (e.type === 'llm.call') {
        body.appendChild(el('div', 'muted',
          'Audit rows store provider and token counts only. The model\\u2019s thoughts and tool steps live in the task execution log.'));
        if (e.taskId && !fromTask) {
          var actions = el('div', 'schedule-actions');
          actions.style.margin = '0.75rem 0 1rem';
          var openTask = el('button', 'btn ghost', 'Open ' + e.taskId);
          openTask.onclick = function () { openTaskModal(e.taskId); };
          actions.appendChild(openTask);
          body.appendChild(actions);
        }

        if (e.taskId) {
          body.appendChild(el('h2', 'sec', 'Execution log'));
          var host = el('div', 'muted', 'Loading\\u2026');
          body.appendChild(host);
          fetch('/api/task?company=' + encodeURIComponent(companySlug) + '&id=' + encodeURIComponent(e.taskId))
            .then(function (r) { return r.json(); })
            .then(function (d) {
              host.innerHTML = '';
              if (d.error) { host.textContent = d.error; return; }
              if (!d.thoughts) {
                host.className = 'muted';
                host.textContent = 'No execution log recorded for this task yet.';
                return;
              }
              var wrap = el('div');
              host.replaceWith(wrap);
              renderMdPreview(wrap, e.taskId + '.md', 'agents/' + (e.agent || d.task && d.task.assignee || '') + '/workspace/' + e.taskId + '.md', d.thoughts);
            })
            .catch(function (err) {
              host.textContent = 'failed: ' + err;
            });
        }
        if (!llm && detail) {
          body.appendChild(el('h2', 'sec', 'Detail'));
          appendDetailDoc(body, detail, '28rem');
        }
        return;
      }

      if (!detail) {
        body.appendChild(el('div', 'muted', 'No detail on this event.'));
        return;
      }

      body.appendChild(el('h2', 'sec', 'Detail'));

      // chat.message details are often "user: … | Agent: …"
      var parts = [];
      if (e.type === 'chat.message' && detail.indexOf(' | ') >= 0) {
        detail.split(' | ').forEach(function (chunk) {
          var m = chunk.match(/^([^:]+):\\s*([\\s\\S]*)$/);
          if (m) parts.push({ who: m[1].trim(), text: m[2].trim() });
        });
      }

      if (parts.length >= 2) {
        parts.forEach(function (p) {
          var block = el('div', 'audit-detail-block');
          block.appendChild(el('div', 'who', p.who));
          block.appendChild(el('div', 'body', p.text));
          body.appendChild(block);
        });
        return;
      }

      appendDetailDoc(body, detail, '28rem');
    }
  });
}

function evtRow(e, fromTask) {
  var d = el('div', 'evt action');
  d.title = 'Inspect event';
  var head = el('div');
  head.appendChild(el('span', 'type', e.type));
  head.appendChild(el('span', e.ok ? 'ok' : 'err', e.ok ? 'OK' : 'ERR'));
  if (e.taskId) head.appendChild(el('span', 'ts', ' ' + e.taskId));
  d.appendChild(head);
  var detail = String(e.detail || '').replace(/\\s+/g, ' ').trim();
  if (detail.length > 140) detail = detail.slice(0, 139) + '\\u2026';
  var meta = (e.agent ? e.agent + ' \\u00b7 ' : '') + detail;
  if (meta) d.appendChild(el('div', 'detail', meta));
  d.appendChild(el('div', 'ts', e.ts.replace('T', ' ').slice(0, 19)));
  d.onclick = function () { openAuditEventModal(e, !!fromTask); };
  return d;
}

/** Countdown: the bar and number DEPLETE from the full budget toward 0. */
function renderBudget(spent, cap) {
  var remaining = Math.max(0, cap - spent);
  var wrap = document.getElementById('tokWrap');
  wrap.className = 'bar' + (cap && remaining === 0 ? ' depleted' : '');
  document.getElementById('tokTxt').textContent =
    remaining.toLocaleString() + ' / ' + cap.toLocaleString();
  document.getElementById('tokBar').style.width = cap ? (remaining / cap * 100) + '%' : '0%';
}

function grantTokens() {
  var remaining = state ? Math.max(0, state.meta.budget.tokens - state.spent.tokens) : 0;
  showModal({
    eyebrow: 'Budget',
    title: 'Grant tokens',
    accent: '#4ade80',
    body: function (body) {
      body.appendChild(el('div', 'muted',
        'Currently ' + remaining.toLocaleString() + ' tokens remaining. How much do you want to grant on top?'));
      var row = el('div');
      row.style.cssText = 'display:flex;gap:0.5rem;margin:0.9rem 0;align-items:center';
      var input = el('input');
      input.type = 'text';
      input.id = 'grantAmount';
      input.value = '100000';
      input.className = 'mono';
      input.style.flex = '1';
      row.appendChild(input);
      var confirm = el('button', 'btn', 'Grant');
      confirm.onclick = function () {
        var n = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
        if (!n) return;
        confirm.disabled = true;
        fetch('/api/budget', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ company: companySlug, addTokens: n })
        }).then(function () { closeModal(); refresh(); });
      };
      row.appendChild(confirm);
      body.appendChild(row);
      var quick = el('div');
      [50000, 100000, 250000, 500000, 1000000].forEach(function (n) {
        var b = el('button', 'tab', '+' + (n >= 1000000 ? (n / 1000000) + 'M' : (n / 1000) + 'k'));
        b.style.marginRight = '0.35rem';
        b.onclick = function () { input.value = String(n); };
        quick.appendChild(b);
      });
      body.appendChild(quick);
      input.focus();
      input.select();
    }
  });
}

// ---------- sqlite browser (read-only): overview → table explorer ----------

var dbState = { list: [], view: 'overview', db: null, table: null, columns: [],
  page: 0, pageSize: 50, pages: 1, total: 0, sort: '', dir: 'asc', q: '', filters: {}, back: null };

function openDbBrowser() {
  markDataFresh(false);
  dbState.view = 'overview';
  dbState.back = null;
  fetch('/api/db/list?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (list) { dbState.list = list; renderDb(); });
}

function renderDb() {
  showModal({
    eyebrow: 'Data \\u00b7 read-only',
    title: (state ? state.meta.name : '') + ' \\u2014 databases',
    accent: '#fbbf24',
    back: dbState.back || undefined,
    body: function (body) {
      if (dbState.view === 'table') return renderDbTable(body);
      renderDbOverview(body);
    }
  });
}

// ── level 1: every DB file and its tables ──
function renderDbOverview(body) {
  if (!dbState.list.length) {
    body.appendChild(el('div', 'muted', 'No SQLite databases in data/ yet. Agents create them with the sqlite/discover tools.'));
    return;
  }
  dbState.list.forEach(function (d) {
    var file = el('div', 'db-file');
    var head = el('div', 'db-file-head');
    head.appendChild(el('span', 'db-file-name', '\\ud83d\\uddc4 ' + d.db));
    head.appendChild(el('span', 'db-file-size', fmtBytes(d.bytes) + ' \\u00b7 ' + d.tables.length + ' table' + (d.tables.length === 1 ? '' : 's')));
    file.appendChild(head);
    if (!d.tables.length) { file.appendChild(el('div', 'muted', '(no tables)')); }
    else {
      var grid = el('div', 'db-tables');
      d.tables.forEach(function (t) {
        var card = el('div', 'db-tcard');
        card.appendChild(el('div', 't', t.name));
        card.appendChild(el('div', 'n', t.rows.toLocaleString() + ' rows \\u00b7 ' + t.columns.length + ' cols'));
        card.appendChild(el('div', 'c', t.columns.join(', ')));
        card.onclick = function () { openDbTable(d.db, t.name, t.columns); };
        grid.appendChild(card);
      });
      file.appendChild(grid);
    }
    body.appendChild(file);
  });
}

function openDbTable(db, table, columns) {
  dbState.view = 'table';
  dbState.db = db; dbState.table = table; dbState.columns = columns || [];
  dbState.page = 0; dbState.sort = ''; dbState.dir = 'asc'; dbState.q = ''; dbState.filters = {};
  renderDb();
  loadDbPage();
}

function loadDbPage() {
  var qs = new URLSearchParams({ company: companySlug, db: dbState.db, table: dbState.table,
    page: String(dbState.page), pageSize: String(dbState.pageSize), dir: dbState.dir });
  if (dbState.sort) qs.set('sort', dbState.sort);
  if (dbState.q) qs.set('q', dbState.q);
  Object.keys(dbState.filters).forEach(function (c) { if (dbState.filters[c]) qs.set('f_' + c, dbState.filters[c]); });
  var host = document.getElementById('dbGrid');
  if (host) host.style.opacity = '0.5';
  fetch('/api/db/table?' + qs.toString())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.error) { if (host) host.innerHTML = '<div class="muted">error: ' + d.error + '</div>'; return; }
      dbState.columns = d.columns; dbState.pages = d.pages; dbState.total = d.total;
      renderDbGrid(d);
    })
    .catch(function (e) { if (host) host.innerHTML = '<div class="muted">failed: ' + e + '</div>'; });
}

// ── level 2: paginated / sortable / filterable table explorer ──
function renderDbTable(body) {
  var crumb = el('div', 'db-crumb');
  var back = el('a', null, '\\u2190 databases'); back.onclick = function () { dbState.view = 'overview'; renderDb(); };
  crumb.appendChild(back);
  crumb.appendChild(document.createTextNode(' / ' + dbState.db + ' / '));
  crumb.appendChild(el('strong', null, dbState.table));
  body.appendChild(crumb);

  var bar = el('div', 'dbx-bar');
  var search = el('input'); search.type = 'text'; search.placeholder = 'search all columns\\u2026'; search.value = dbState.q;
  var deb;
  search.oninput = function () { clearTimeout(deb); deb = setTimeout(function () { dbState.q = search.value.trim(); dbState.page = 0; loadDbPage(); }, 350); };
  bar.appendChild(search);
  var psl = el('select');
  [25, 50, 100, 200].forEach(function (n) { var o = document.createElement('option'); o.value = String(n); o.textContent = n + ' / page'; if (n === dbState.pageSize) o.selected = true; psl.appendChild(o); });
  psl.onchange = function () { dbState.pageSize = Number(psl.value); dbState.page = 0; loadDbPage(); };
  bar.appendChild(psl);
  var sqlBtn = el('button', 'pgbtn', 'SQL'); sqlBtn.title = 'raw read-only query'; sqlBtn.onclick = function () { openDbSql(); };
  bar.appendChild(sqlBtn);
  body.appendChild(bar);

  var grid = el('div'); grid.id = 'dbGrid'; body.appendChild(grid);
}

function renderDbGrid(d) {
  var host = document.getElementById('dbGrid');
  if (!host) return;
  var prevWrap = host.querySelector('.dbtablewrap');
  var keepLeft = prevWrap ? prevWrap.scrollLeft : 0;
  var keepTop = prevWrap ? prevWrap.scrollTop : 0;
  host.style.opacity = '1';
  host.innerHTML = '';
  var wrap = el('div', 'dbtablewrap');
  var table = el('table', 'dbt');
  var thead = el('tr');
  d.columns.forEach(function (c) {
    var th = el('th', null, c);
    if (dbState.sort === c) th.appendChild(el('span', 'arr', dbState.dir === 'asc' ? '\\u2191' : '\\u2193'));
    th.onclick = function (e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (dbState.sort === c) dbState.dir = dbState.dir === 'asc' ? 'desc' : 'asc';
      else { dbState.sort = c; dbState.dir = 'asc'; }
      dbState.page = 0; loadDbPage();
    };
    thead.appendChild(th);
  });
  table.appendChild(thead);
  d.rows.forEach(function (row) {
    var tr = el('tr');
    row.forEach(function (v) {
      var td = el('td', v === null ? 'null' : null, v === null ? 'NULL' : String(v));
      if (v !== null) td.title = String(v);
      tr.appendChild(td);
    });
    tr.onclick = function () { showRowDetail(d.columns, row); };
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  host.appendChild(wrap);
  // Restore viewport after sort/filter/page reload — otherwise the wrap jumps to 0,0
  requestAnimationFrame(function () {
    wrap.scrollLeft = keepLeft;
    wrap.scrollTop = keepTop;
  });

  var foot = el('div', 'dbx-foot');
  var from = dbState.total ? dbState.page * dbState.pageSize + 1 : 0;
  var to = Math.min(dbState.total, (dbState.page + 1) * dbState.pageSize);
  foot.appendChild(el('span', null, from.toLocaleString() + '\\u2013' + to.toLocaleString() + ' of ' + dbState.total.toLocaleString()
    + (dbState.q || Object.keys(dbState.filters).some(function (k) { return dbState.filters[k]; }) ? ' (filtered)' : '')));
  foot.appendChild(el('span', 'sp'));
  var prev = el('button', 'pgbtn', '\\u2039 prev'); prev.disabled = dbState.page <= 0;
  prev.onclick = function () { if (dbState.page > 0) { dbState.page--; loadDbPage(); } };
  var ind = el('span', null, 'page ' + (dbState.page + 1) + ' / ' + dbState.pages);
  var next = el('button', 'pgbtn', 'next \\u203a'); next.disabled = dbState.page + 1 >= dbState.pages;
  next.onclick = function () { if (dbState.page + 1 < dbState.pages) { dbState.page++; loadDbPage(); } };
  foot.appendChild(prev); foot.appendChild(ind); foot.appendChild(next);
  host.appendChild(foot);

  var det = el('div'); det.id = 'dbRowDetail'; host.appendChild(det);
}

function showRowDetail(columns, row) {
  var det = document.getElementById('dbRowDetail');
  if (!det) return;
  det.innerHTML = '';
  var box = el('div', 'rowdetail');
  box.appendChild(el('h4', null, 'Row detail'));
  var kv = el('div', 'kv');
  columns.forEach(function (c, i) {
    kv.appendChild(el('div', 'k', c));
    var v = row[i];
    var vd = el('div', 'v');
    if (v === null || v === '') vd.appendChild(el('span', 'muted', v === null ? 'NULL' : '(empty)'));
    else if (/^https?:\\/\\//.test(String(v))) { var a = el('a', null, String(v)); a.href = String(v); a.target = '_blank'; vd.appendChild(a); }
    else vd.textContent = String(v);
    kv.appendChild(vd);
  });
  box.appendChild(kv);
  det.appendChild(box);
  det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// raw read-only SQL escape hatch (kept from the old browser)
function openDbSql() {
  showModal({
    eyebrow: 'Data \\u00b7 read-only SQL',
    title: dbState.db,
    accent: '#fbbf24',
    body: function (body) {
      var b = el('a', null, '\\u2190 back to ' + dbState.table); b.style.cssText = 'color:#60a5fa;cursor:pointer;font-size:0.78rem';
      b.onclick = function () { renderDb(); loadDbPage(); };
      body.appendChild(b);
      var ta = el('textarea', 'dbsql'); ta.id = 'dbSql';
      ta.value = 'SELECT * FROM ' + dbState.table + ' LIMIT 50';
      ta.style.marginTop = '0.5rem';
      ta.onkeydown = function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runDbSql(); } };
      body.appendChild(ta);
      var run = el('button', 'btn', 'Run (\\u2318\\u21a9)'); run.style.marginTop = '0.4rem'; run.onclick = runDbSql;
      body.appendChild(run);
      body.appendChild(el('span', 'muted', '  SELECT / PRAGMA / WITH only'));
      var out = el('div'); out.id = 'dbSqlOut'; body.appendChild(out);
    }
  });
}

function runDbSql() {
  var out = document.getElementById('dbSqlOut'); var sql = document.getElementById('dbSql').value;
  out.innerHTML = ''; out.appendChild(el('div', 'muted', 'running\\u2026'));
  fetch('/api/db/query', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ company: companySlug, db: dbState.db, sql: sql }) })
    .then(function (r) { return r.json(); }).then(function (d) {
      out.innerHTML = '';
      if (d.error) { out.appendChild(el('div', 'muted', 'error: ' + d.error)); return; }
      if (!d.rows.length) { out.appendChild(el('div', 'muted', '(no rows)')); return; }
      var wrap = el('div', 'dbtablewrap'); var t = el('table', 'dbt'); var h = el('tr');
      d.columns.forEach(function (c) { h.appendChild(el('th', null, c)); }); t.appendChild(h);
      d.rows.forEach(function (row) { var tr = el('tr'); row.forEach(function (v) { tr.appendChild(el('td', v === null ? 'null' : null, v === null ? 'NULL' : String(v))); }); t.appendChild(tr); });
      wrap.appendChild(t); out.appendChild(wrap);
      out.appendChild(el('div', 'muted', d.total + ' row(s)' + (d.truncated ? ' \\u2014 first 200' : '')));
    }).catch(function (e) { out.innerHTML = ''; out.appendChild(el('div', 'muted', 'failed: ' + e)); });
}

function refresh(opts) {
  opts = opts || {};
  if (view !== 'company' || !companySlug) return;
  fetch('/api/state?company=' + encodeURIComponent(companySlug))
    .then(function (r) { return r.json(); })
    .then(function (s) {
      if (s.error) return;
      state = s;
      document.getElementById('coName').textContent = s.meta.name;
      document.getElementById('coGoal').textContent = s.meta.goal;
      // hydrate chief chat once from disk (plans already persist via /api/plan)
      var chatJustLoaded = false;
      if (!chatLoaded[companySlug] && !chiefSending) {
        chatHistories[companySlug] = Array.isArray(s.chat) ? s.chat : [];
        chatLoaded[companySlug] = true;
        chatJustLoaded = true;
      }
      renderTasks(s.tasks);
      renderOrg(s.agents);
      if (selectedTab !== 'chat' || chatJustLoaded || opts.paintChat) renderAgentPanel();
      renderBudget(s.spent.tokens, s.meta.budget.tokens);
      renderLiveStrip();
      noteDataSig(s.dataSig);
      var ab = document.getElementById('apprBtn');
      if (ab) {
        ab.textContent = s.pendingApprovals ? '\\u2713 Approvals (' + s.pendingApprovals + ')' : '\\u2713 Approvals';
        ab.style.color = s.pendingApprovals ? '#e879f9' : '';
        ab.style.borderColor = s.pendingApprovals ? 'rgba(217,70,239,0.5)' : '';
      }
      var pb = document.getElementById('pauseBtn');
      if (pb) {
        var paused = !!s.meta.paused;
        pb.className = 'runtime-tool' + (paused ? ' alert' : '');
        var ico = document.getElementById('pauseBtnIco');
        var lab = document.getElementById('pauseBtnLabel');
        if (ico) ico.textContent = paused ? '\\u25b6' : '\\u23f8';
        if (lab) lab.textContent = paused ? 'Resume' : 'Pause';
        pb.title = paused ? 'Resume the company' : 'Pause the company';
      }
    })
    .catch(function () {});
  refreshRunner();
}

// ---------- live tools footer ----------

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

// ---------- plan view ----------

function planBotMsg(text) {
  return appendSetupChatMessage(document.getElementById('planLog'), 'assistant', text);
}

function planUserMsg(text) {
  return appendSetupChatMessage(document.getElementById('planLog'), 'user', text);
}

function openPlan(slug) {
  planSlug = slug;
  planPendingAttachments = [];
  routeTo(slug ? '/plan/' + encodeURIComponent(slug) : '/plan/new');
  document.title = 'ai-company-os \\u00b7 ' + (slug || 'new plan');
  planHistory = [];
  planDraft = null;
  document.getElementById('planLog').innerHTML = '';
  document.getElementById('planDoc').innerHTML = '<div class="muted">No plan yet \\u2014 describe your goal in the chat.</div>';
  document.getElementById('planBar').style.display = 'none';
  document.getElementById('planName').value = '';
  document.getElementById('planTitle').textContent = 'New plan';
  var chips = document.getElementById('planAttachChips');
  if (chips) { chips.innerHTML = ''; chips.hidden = true; }
  var planTa = document.getElementById('planInput');
  if (planTa) planTa.value = '';
  if (slug) {
    fetch('/api/plan?slug=' + encodeURIComponent(slug)).then(function (r) { return r.json(); }).then(function (d) {
      planDraft = d.plan;
      planHistory = d.history || [];
      planHistory.forEach(function (m) {
        if (m.role === 'user') planUserMsg(m.content);
        else {
          try { planBotMsg(JSON.parse(m.content).reply); } catch (e) { planBotMsg(m.content); }
        }
      });
      renderPlanDoc();
      nav('plan');
    });
  } else {
    nav('plan');
  }
}

function sendPlanMsg() {
  var ta = document.getElementById('planInput');
  if (!ta) return;
  var text = ta.value.trim();
  var notes = planPendingAttachments.map(function (a) { return a.note; });
  if ((!text && !notes.length) || planSending) return;
  var message = notes.length
    ? (notes.join('\\n') + (text ? '\\n\\n' + text : '')).trim()
    : text;
  planPendingAttachments = [];
  renderPlanAttachChips();
  ta.value = '';
  resizeChatTextarea(ta);
  planSending = true;
  syncPlanComposer();
  planUserMsg(message);
  var thinking = appendChatThinking(document.getElementById('planLog'), getPlanThinkingLabel(), 'planThinking');
  startPlanPhaseTimer();
  planHistory.push({ role: 'user', content: message });
  fetch('/api/plan/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: document.getElementById('providerSel').value,
      history: planHistory,
      slug: planSlug
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    planSending = false;
    stopPlanPhaseTimer();
    if (d.error) { setChatMessageContent(thinking, '(error: ' + d.error + ')'); }
    else {
      setChatMessageContent(thinking, d.reply);
      planDraft = d.plan;
      planSlug = d.slug;
      // a fresh plan just got its identity — give it its permanent URL
      if (planSlug && location.pathname !== '/plan/' + encodeURIComponent(planSlug)) {
        history.replaceState({}, '', '/plan/' + encodeURIComponent(planSlug));
        document.title = 'ai-company-os \\u00b7 ' + planSlug;
      }
      planHistory.push({ role: 'assistant', content: JSON.stringify({ reply: d.reply, plan: d.plan }) });
      renderPlanDoc();
    }
    syncPlanComposer();
  }).catch(function (e) {
    planSending = false;
    stopPlanPhaseTimer();
    setChatMessageContent(thinking, '(request failed: ' + e + ')');
    syncPlanComposer();
  });
}

var mermaidSeq = 0;

function mmEsc(s) {
  return String(s || '').replace(/["\\[\\]{}()<>#;]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 60);
}

/** Deterministic mermaid of the process (root tasks) — the model never writes
 * mermaid itself, so the diagram always renders. */
function renderPlanDiagram(box, p) {
  if (typeof mermaid === 'undefined') return;
  var tasks = p.rootTasks || [];
  if (!tasks.length) return;
  var lines = ['flowchart LR'];
  tasks.forEach(function (t, i) {
    lines.push('  T' + i + '["' + mmEsc(t.title) + '"]');
    if (i > 0) lines.push('  T' + (i - 1) + ' --> T' + i);
  });
  var holder = el('div', 'mermaidbox');
  box.appendChild(holder);
  var id = 'mm' + (++mermaidSeq);
  try {
    mermaid.render(id, lines.join('\\n')).then(function (out) {
      holder.innerHTML = out.svg;
    }).catch(function () { holder.remove(); });
  } catch (e) { holder.remove(); }
}

/** Same org-chart UI as the live Agents view, for the proposed roster. */
function renderPlanOrg(box, p) {
  var agents = p.agents || [];
  if (!agents.length) return;
  var holder = el('div', 'org plan-org');
  box.appendChild(holder);
  renderOrgInto(holder, agents, {
    static: true,
    showTools: true,
    colors: agentColors(agents),
  });
}

function renderPlanDoc() {
  var box = document.getElementById('planDoc');
  box.innerHTML = '';
  if (!planDraft) return;
  var p = planDraft;
  var planColors = agentColors(p.agents || []);
  document.getElementById('planTitle').textContent = 'Plan: ' + p.name;

  var goalEl = el('div', 'plan-seg plan-seg-item', p.goal);
  makePlanDraggable(goalEl, function () {
    return '--- Goal ---\\n' + (p.goal || '');
  });
  box.appendChild(goalEl);

  appendPlanSegment(box, 'Process', function (body) {
    renderPlanDiagram(body, p);
  }, function () {
    var titles = (p.rootTasks || []).map(function (t) { return t.title; });
    return '--- Process ---\\n' + (titles.length ? titles.join(' \\u2192 ') : '(no root tasks)');
  });

  appendPlanSegment(box, 'Approach', function (body) {
    body.appendChild(el('div', 'muted', p.approach));
  }, function () {
    return '--- Approach ---\\n' + (p.approach || '');
  });

  appendPlanSegment(box, 'Proposed agents', function (body) {
    renderPlanOrg(body, p);
    (p.agents || []).forEach(function (a) {
      var card = el('div', 'agentcard');
      card.style.setProperty('--accent', planColors[a.name] || RANK_ACCENT.worker);
      var top = el('div');
      top.appendChild(el('span', 'org-rank ' + a.rank, a.rank));
      top.appendChild(el('strong', null, ' ' + a.name + ' '));
      top.appendChild(el('span', 'muted', a.role + (a.manager ? ' \\u00b7 reports to ' + a.manager : '')));
      card.appendChild(top);
      var chips = el('div');
      chips.style.margin = '0.35rem 0';
      (a.tools || []).forEach(function (t) { chips.appendChild(el('span', 'chip', t)); });
      (a.skills || []).forEach(function (s) { chips.appendChild(el('span', 'chip skill', s)); });
      card.appendChild(chips);
      (a.responsibilities || []).forEach(function (r) { card.appendChild(el('div', 'muted', '\\u2022 ' + r)); });
      var wrap = el('div', 'plan-seg plan-seg-item');
      wrap.appendChild(card);
      makePlanDraggable(wrap, function () { return agentContextText(a); });
      body.appendChild(wrap);
    });
  }, function () {
    var lines = ['--- Proposed agents ---'];
    (p.agents || []).forEach(function (a) {
      lines.push(a.rank + ' ' + a.name + ' \\u2014 ' + a.role + (a.manager ? ' (reports to ' + a.manager + ')' : ''));
    });
    return lines.join('\\n');
  });

  appendPlanSegment(box, 'Root tasks', function (body) {
    (p.rootTasks || []).forEach(function (t) {
      var row = el('div', 'plan-seg plan-seg-item', '\\u2022 ' + t.title);
      makePlanDraggable(row, function () {
        return '--- Root task ---\\n' + t.title;
      });
      body.appendChild(row);
    });
  }, function () {
    return '--- Root tasks ---\\n' + (p.rootTasks || []).map(function (t) { return '- ' + t.title; }).join('\\n');
  });

  if (p.deliverables && p.deliverables.length) {
    appendPlanSegment(box, 'Expected output files', function (body) {
      var dl = el('div');
      p.deliverables.forEach(function (d) {
        var chip = el('span', 'dlv');
        chip.appendChild(el('span', 'kind ' + (d.kind || '').toLowerCase(), d.kind || 'file'));
        chip.appendChild(el('span', null, d.file));
        if (d.description) chip.title = d.description;
        var wrap = el('span', 'plan-seg plan-seg-item');
        wrap.style.display = 'inline-block';
        wrap.appendChild(chip);
        makePlanDraggable(wrap, function () {
          return '--- Deliverable ---\\n' + (d.kind || 'file') + ': ' + d.file + (d.description ? '\\n' + d.description : '');
        });
        dl.appendChild(wrap);
      });
      body.appendChild(dl);
    }, function () {
      return '--- Expected output files ---\\n' + p.deliverables.map(function (d) {
        return '- [' + (d.kind || 'file') + '] ' + d.file + (d.description ? ' \\u2014 ' + d.description : '');
      }).join('\\n');
    });
  }

  if (p.storage && p.storage.length) {
    appendPlanSegment(box, 'Storage (SQLite)', function (body) {
      var st = el('div');
      p.storage.forEach(function (s) {
        var chip = el('span', 'dlv');
        chip.appendChild(el('span', 'kind db', s.db || 'main.db'));
        chip.appendChild(el('span', null, s.table + (s.purpose ? ' \\u2014 ' + s.purpose : '')));
        var wrap = el('span', 'plan-seg plan-seg-item');
        wrap.style.display = 'inline-block';
        wrap.appendChild(chip);
        makePlanDraggable(wrap, function () {
          return '--- Storage ---\\n' + (s.db || 'main.db') + ' / ' + s.table + (s.purpose ? '\\n' + s.purpose : '');
        });
        st.appendChild(wrap);
      });
      body.appendChild(st);
    }, function () {
      return '--- Storage (SQLite) ---\\n' + p.storage.map(function (s) {
        return '- ' + (s.db || 'main.db') + ' / ' + s.table + (s.purpose ? ' \\u2014 ' + s.purpose : '');
      }).join('\\n');
    });
  }

  if (p.todos && p.todos.length) {
    appendPlanSegment(box, 'Todos & requirements to stay on track', function (body) {
      p.todos.forEach(function (t) {
        var row = el('div', 'todoitem plan-seg plan-seg-item');
        row.appendChild(el('span', 'box', '\\u2610'));
        row.appendChild(el('span', null, t));
        makePlanDraggable(row, function () {
          return '--- Todo ---\\n' + t;
        });
        body.appendChild(row);
      });
    }, function () {
      return '--- Todos & requirements ---\\n' + p.todos.map(function (t) { return '- [ ] ' + t; }).join('\\n');
    });
  }

  renderPlanBar();
  var nameInput = document.getElementById('planName');
  if (!nameInput.value) nameInput.value = p.name;
}

function formatPlanBudget(tokens) {
  return tokens.toLocaleString() + ' tokens';
}

function showPlanBudgetDisplay() {
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  if (!display || !inp || !planDraft) return;
  display.textContent = formatPlanBudget(planDraft.budget.tokens);
  display.style.display = '';
  inp.style.display = 'none';
}

function editPlanBudget() {
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  if (!display || !inp || !planDraft) return;
  inp.value = String(planDraft.budget.tokens);
  display.style.display = 'none';
  inp.style.display = '';
  inp.focus();
  inp.select();
}

function commitPlanBudgetEdit() {
  var inp = document.getElementById('planBudgetTokens');
  if (!inp || !planDraft) return;
  var n = parseInt(inp.value, 10);
  if (!isNaN(n) && n > 0) planDraft.budget.tokens = n;
  showPlanBudgetDisplay();
}

function initPlanBar() {
  var bar = document.getElementById('planBar');
  if (!bar || bar.dataset.ready) return;
  bar.dataset.ready = '1';
  var display = document.getElementById('planBudgetDisplay');
  var inp = document.getElementById('planBudgetTokens');
  display.onclick = function () { editPlanBudget(); };
  display.onkeydown = function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); editPlanBudget(); }
  };
  inp.onblur = function () { commitPlanBudgetEdit(); };
  inp.onkeydown = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { inp.value = String(planDraft ? planDraft.budget.tokens : ''); inp.blur(); }
  };
}

function renderPlanBar() {
  if (!planDraft) return;
  document.getElementById('planBar').style.display = 'flex';
  showPlanBudgetDisplay();
  var delBtn = document.getElementById('planDeleteBtn');
  if (delBtn) delBtn.style.display = planSlug ? '' : 'none';
}

function syncPlanBudgetFromInput() {
  var inp = document.getElementById('planBudgetTokens');
  if (!inp || !planDraft) return;
  if (inp.style.display !== 'none') {
    var n = parseInt(inp.value, 10);
    if (!isNaN(n) && n > 0) planDraft.budget.tokens = n;
  }
  showPlanBudgetDisplay();
}

function launchPlan() {
  if (!planDraft) return;
  syncPlanBudgetFromInput();
  var btn = document.getElementById('launchBtn');
  btn.disabled = true;
  fetch('/api/plan/launch', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      plan: planDraft,
      name: document.getElementById('planName').value,
      provider: document.getElementById('providerSel').value,
      slug: planSlug
    })
  }).then(function (r) { return r.json(); }).then(function (d) {
    btn.disabled = false;
    if (d.error) { planBotMsg('(launch failed: ' + d.error + ')'); return; }
    planHistory = []; planDraft = null; planSlug = null;
    document.getElementById('planLog').innerHTML = '';
    document.getElementById('planDoc').innerHTML = '';
    document.getElementById('planBar').style.display = 'none';
    document.getElementById('planName').value = '';
    openCompany(d.slug);
  }).catch(function () { btn.disabled = false; });
}

// ---------- skills ----------

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

function loadSkills() {
  fetch('/api/skills').then(function (r) { return r.json(); }).then(function (list) {
    skills = list;
    var box = document.getElementById('skillItems');
    if (!box) return;
    box.innerHTML = '';
    list.forEach(function (s) {
      var preview = skillPreview(s.content, s.name);
      var card = el('div', 'skillitem');
      var top = el('div', 'skillitem-top');
      top.appendChild(el('div', 'skillitem-name', preview.title));
      top.appendChild(el('span', 'src ' + s.source, s.source));
      card.appendChild(top);
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
      box.appendChild(card);
    });

    var add = el('div', 'skillitem action', '\\uff0b New skill');
    add.onclick = function () { openSkill(null); };
    box.appendChild(add);

    var upload = el('div', 'skillitem action');
    var lab = document.createElement('label');
    lab.textContent = 'Upload .zip / .md';
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.id = 'skillUpload';
    inp.accept = '.zip,.md';
    inp.style.display = 'none';
    lab.appendChild(inp);
    upload.appendChild(lab);
    box.appendChild(upload);
    inp.addEventListener('change', onSkillUpload);
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

// ---------- role model settings ----------

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

/** Plan sidebar provider select; role models live in the settings modal. */
function initRoles() {
  var psel = document.getElementById('providerSel');
  psel.innerHTML = '';
  cfg.providers.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p; o.textContent = p;
    if (p === (cfg.roles.planning || cfg.defaultProvider)) o.selected = true;
    psel.appendChild(o);
  });
}

// ---------- theme (matches ai-company-os-site light/dark tokens) ----------

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

// ---------- boot ----------

fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
  cfg = c;
  initRoles();
  if (view === 'home') updateHomeSkillsLink();
});
initPlanChatComposer();
initPlanBar();
renderFooter();
applyRoute(location.pathname || '/');
setInterval(refresh, 2500);
</script>
</body>
</html>
`;
