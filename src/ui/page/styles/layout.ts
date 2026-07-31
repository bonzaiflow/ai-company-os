/** App shells and company/plan/skills stage layout */
export const LAYOUT = `main { display: none; height: 100vh; }
main.on { display: grid; }
body.footer-on main { height: calc(100vh - 40px); }
#viewHome, #viewSkills, #viewSkill { grid-template-columns: 1fr; overflow-y: auto; }
#viewCompany { grid-template-columns: 300px minmax(0, 1fr) 0fr; transition: grid-template-columns 0.28s ease; }
#viewCompany.agent-open { grid-template-columns: 300px minmax(0, 1fr) 400px; }
#viewCompany .agent-sidebar {
  overflow: hidden; min-width: 0; opacity: 0; pointer-events: none;
  transition: opacity 0.2s ease; border-left-color: transparent;
}
#viewCompany.agent-open .agent-sidebar {
  opacity: 1; pointer-events: auto; border-left-color: var(--border);
}
#viewPlan { grid-template-columns: 1fr 420px; }
#viewPlan > .plan-stage {
  padding: 1.5rem clamp(1.5rem, 5vw, 3.5rem) 2rem;
  background:
    radial-gradient(ellipse 55% 40% at 80% 0%, var(--glow), transparent 70%);
}
#viewPlan > .plan-stage .plan-mast,
#viewPlan > .plan-stage #planDoc,
#viewPlan > .plan-stage #planBar {
  max-width: 48rem;
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

/* Company stage */
#viewCompany > .co-stage {
  padding: 1.35rem 1.75rem 2rem;
  background:
    radial-gradient(ellipse 50% 35% at 90% -5%, var(--glow), transparent 70%);
}
.co-mast { margin-bottom: 1.75rem; }
.co-mast .backlink { margin-bottom: 0.65rem; }
.co-mast-row {
  display: flex; flex-wrap: wrap; justify-content: space-between;
  align-items: flex-start; gap: 1rem 1.5rem;
}
.co-mast-main { min-width: 0; flex: 1; }
.co-brand {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--blue-bright); margin-bottom: 0.4rem;
}
#viewCompany .page-title {
  font-size: clamp(1.45rem, 2.4vw, 1.85rem); overflow-wrap: anywhere;
  letter-spacing: -0.03em;
}
#viewCompany .subtitle { max-width: 40rem; font-size: 0.92rem; line-height: 1.45; }
#viewCompany .bars {
  flex-wrap: wrap; align-items: flex-end; gap: 0.55rem; justify-content: flex-end;
}
.co-org-label {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; font-weight: 600;
  letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
  margin-bottom: 0.85rem;
}
.co-pinned {
  display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: flex-end; justify-content: flex-end;
}
.co-tools { position: relative; }
.co-tools-toggle {
  font-size: 0.7rem; padding: 0.24rem 0.75rem; border-radius: 999px;
  border: 1px solid var(--border); background: var(--bg); color: var(--muted); margin-top: 0.15rem;
}
.co-tools-toggle:hover, .co-tools-toggle[aria-expanded="true"] {
  color: var(--text); border-color: var(--muted);
}
.co-tools-menu {
  position: absolute; right: 0; top: calc(100% + 0.35rem); z-index: 20;
  display: flex; flex-direction: column; gap: 0.3rem; min-width: 11.5rem;
  padding: 0.55rem; border-radius: 12px; border: 1px solid var(--border);
  background: var(--surface); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
}
.co-tools-menu[hidden] { display: none !important; }
.co-tools-row {
  display: flex; align-items: center; gap: 0.25rem;
}
.co-tools-menu .grant-btn {
  margin: 0; flex: 1; width: auto; text-align: left; border-radius: 8px;
}
.co-tools-pin {
  flex-shrink: 0; width: 1.7rem; height: 1.7rem; margin: 0; padding: 0;
  border: 1px solid transparent; border-radius: 8px; background: transparent;
  color: var(--muted); display: inline-flex; align-items: center; justify-content: center;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.co-tools-pin::before {
  content: ""; width: 0.7rem; height: 0.7rem;
  background: currentColor;
  clip-path: polygon(50% 0, 85% 35%, 70% 35%, 70% 75%, 50% 100%, 30% 75%, 30% 35%, 15% 35%);
  opacity: 0.55;
}
.co-tools-pin:hover {
  color: var(--text); border-color: var(--border); background: var(--bg);
}
.co-tools-pin:hover::before { opacity: 0.9; }
.co-tools-pin[aria-pressed="true"] {
  color: var(--blue-bright);
  border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
  background: color-mix(in srgb, var(--blue) 12%, var(--bg));
}
.co-tools-pin[aria-pressed="true"]::before { opacity: 1; }
.co-tools-danger { color: #f87171 !important; border-color: rgba(248, 113, 113, 0.35) !important; }

/* Plan studio */
.plan-mast { margin-bottom: 1.75rem; }
.plan-brand, .skills-brand {
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--blue-bright); margin: 0.35rem 0 0.45rem;
}
.plan-mast .page-title { font-size: clamp(1.45rem, 2.4vw, 1.85rem); letter-spacing: -0.03em; }
.plan-empty {
  padding: 2.5rem 0 1rem; border-top: 1px solid var(--border);
}
.plan-empty-title {
  font-size: 1.15rem; font-weight: 600; letter-spacing: -0.02em; color: var(--text);
}
.plan-empty-body {
  margin-top: 0.55rem; color: var(--muted); font-size: 0.92rem; line-height: 1.5; max-width: 28rem;
}

/* Skills shelf */
.skills-stage {
  max-width: 1080px; margin: 0 auto; width: 100%;
  padding: 1.75rem clamp(1.25rem, 3.5vw, 2.5rem) 3.5rem !important;
  background:
    radial-gradient(ellipse 55% 40% at 70% 0%, var(--glow), transparent 70%);
}
.skills-mast { margin-bottom: 2.25rem; }
.skills-mast-compact { margin-bottom: 1.25rem; }
.skills-mast-row {
  display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between;
  gap: 1rem 1.5rem;
}
.skills-mast-main { min-width: 0; flex: 1; }
.skills-mast-actions {
  display: flex; align-items: center; gap: 0.65rem; flex-shrink: 0; padding-top: 0.35rem;
}
.skills-title {
  font-size: clamp(1.85rem, 3.6vw, 2.55rem); font-weight: 700;
  letter-spacing: -0.045em; line-height: 1.05; color: var(--text);
}
.skills-lead {
  margin-top: 0.75rem; color: var(--muted); font-size: 1rem; line-height: 1.5; max-width: 36rem;
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

`;
