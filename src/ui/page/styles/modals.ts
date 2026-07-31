/** Modal chrome, check-ins, schedule */
export const MODALS = `.modal-backdrop {
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

`;
