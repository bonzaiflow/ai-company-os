/** Home hierarchy, welcome hero, portfolio, workspace picker */
export const HOME = `/* Home hierarchy */
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
.home-pager {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  margin-top: 0; padding: 0.7rem 0.15rem 0; border-top: 0;
}
.home-pager[hidden] { display: none !important; }
.home-pager-meta {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
}
.home-pager-actions { display: flex; align-items: center; gap: 0.45rem; }
.home-pager-btn {
  border: 1px solid var(--border); background: transparent; color: var(--muted);
  font: inherit; font-size: 0.78rem; font-weight: 600; padding: 0.35rem 0.75rem;
  border-radius: 999px; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.home-pager-btn:hover:not(:disabled) {
  color: var(--text); border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
  background: color-mix(in srgb, var(--blue) 8%, transparent);
}
.home-pager-btn:disabled { opacity: 0.35; cursor: default; }

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

.home-skills {
  display: flex; flex-direction: column; gap: 0;
  border-top: 1px solid var(--border);
}
.home-skill {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 1rem; align-items: center;
  padding: 0.95rem 0.15rem; cursor: pointer;
  border-bottom: 1px solid var(--border); background: transparent;
  transition: background 0.15s ease, padding 0.15s ease;
}
.home-skill:hover {
  background: color-mix(in srgb, var(--blue) 6%, transparent);
  padding-left: 0.55rem; padding-right: 0.4rem;
}
.home-skill-main { min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.home-skill-name {
  font-size: 1rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.home-skill-meta {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
}
.home-skill.more {
  display: flex; align-items: center; justify-content: flex-start;
  color: var(--blue-bright); font-size: 0.9rem; font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.home-skill.more:hover { color: var(--text); }

`;
