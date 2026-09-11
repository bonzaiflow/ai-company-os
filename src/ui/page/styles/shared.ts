/** Sidebar, tabs, org chart, chat, buttons, toasts, theme */
export const SHARED = `.accentbar { height: 3px; background: linear-gradient(90deg, #2563eb, #60a5fa); }
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

.org { display: flex; flex-direction: column; align-items: center; padding: 0.75rem 0 1.5rem; }
.sub { display: flex; flex-direction: column; align-items: center; position: relative; }
.down { width: 1px; height: 18px; background: color-mix(in srgb, var(--blue-bright) 35%, var(--border)); margin-top: -4px; }
.kids { display: flex; justify-content: center; align-items: flex-start; }
.kids > .sub { padding-top: 18px; }
.kids > .sub::before { content: ""; position: absolute; top: 0; left: 50%; width: 1px; height: 18px; background: color-mix(in srgb, var(--blue-bright) 35%, var(--border)); }
.kids > .sub::after { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: color-mix(in srgb, var(--blue-bright) 35%, var(--border)); }
.kids > .sub:first-child::after { left: 50%; }
.kids > .sub:last-child::after { right: 50%; }
.kids > .sub:only-child::after { display: none; }
.org-card {
  position: relative; background: color-mix(in srgb, var(--surface) 88%, transparent);
  border: 1px solid var(--border); border-radius: 14px;
  min-width: 168px; max-width: 200px; overflow: hidden;
  margin: 6px 8px; cursor: pointer; text-align: left;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
  box-shadow: 0 0 0 0 transparent;
}
.org-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--surface);
}
.org-card.sel {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent);
}
.org-card.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 22px color-mix(in srgb, var(--accent) 20%, transparent);
}
.org-card.sel.active {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 26px color-mix(in srgb, var(--accent) 24%, transparent);
}
.org-accent { height: 2px; background: var(--accent); }
.org-body { padding: 0.8rem 0.9rem 0.9rem; }
.org-rank {
  display: inline-block; font-family: "JetBrains Mono", monospace;
  font-size: 0.6rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.1em; padding: 0.18em 0.45em; border-radius: 4px; margin-bottom: 0.45rem;
}
.org-rank.chief   { background: rgba(234, 179, 8, 0.15);  color: #fbbf24; }
.org-rank.manager { background: rgba(217, 70, 239, 0.15); color: #e879f9; }
.org-rank.worker  { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.org-name { font-size: 1rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
.org-role { font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); margin-top: 0.3rem; }
.org-llm {
  font-family: "JetBrains Mono", monospace; font-size: 0.62rem;
  color: var(--muted); margin-top: 0.25rem; opacity: 0.9;
}
.org-llm.pinned { color: var(--accent, #60a5fa); opacity: 1; }
.agent-llm {
  margin-bottom: 0.75rem; padding: 0.55rem 0.65rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.agent-llm-title { font-size: 0.72rem; font-weight: 600; margin-bottom: 0.35rem; }
.agent-llm-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.agent-llm-row select {
  flex: 1; min-width: 7rem; font-size: 0.78rem;
  background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.4rem;
}
.agent-llm-hint { margin-top: 0.35rem; font-size: 0.68rem; }
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
a.chat-path {
  color: #60a5fa; text-decoration: underline; text-underline-offset: 2px;
  word-break: break-all; cursor: pointer;
}
a.chat-path:hover { color: var(--link-strong, #93c5fd); }
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
  display: flex; gap: 0.65rem; align-items: center; margin-top: 1.75rem;
  padding: 0.95rem 1.1rem; background: color-mix(in srgb, var(--surface) 92%, transparent);
  border: 1px solid var(--border); border-radius: 14px; flex-wrap: wrap;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
}
.planbar .btn { border-radius: 999px; padding: 0.55rem 1.15rem; }
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

footer.status-rail {
  position: fixed; bottom: 0; left: 0; right: 0; height: 40px;
  display: none; align-items: center; gap: 0.85rem; padding: 0 1.25rem;
  background: color-mix(in srgb, var(--bg) 72%, var(--surface));
  border-top: 1px solid var(--border); font-size: 0.72rem;
  backdrop-filter: blur(10px);
}
body.footer-on footer.status-rail { display: flex; }
footer .sw {
  display: flex; align-items: center; gap: 0.45rem; color: var(--muted);
  cursor: pointer; user-select: none; flex-shrink: 0;
}
footer .status-rail-label {
  font-family: "JetBrains Mono", monospace; font-size: 0.62rem; font-weight: 600;
  letter-spacing: 0.1em; text-transform: uppercase;
}
footer .track2 { width: 28px; height: 16px; border-radius: 10px; background: var(--bg); border: 1px solid var(--border); position: relative; }
footer .knob { position: absolute; top: 1px; left: 2px; width: 12px; height: 12px; border-radius: 7px; background: var(--muted); transition: left 0.15s; }
footer .sw.on .knob { left: 13px; background: #4ade80; }
footer .sw.on { color: var(--text); }
footer .sw.on .status-rail-label { color: #4ade80; }
#liveStrip {
  flex: 1; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; min-width: 0;
}
#liveStrip:empty::before {
  content: "Models & live activity";
  color: color-mix(in srgb, var(--muted) 70%, transparent);
}
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
  width: 26px; height: 26px; padding: 0; flex-shrink: 0;
  background: none; border: 1px solid transparent; border-radius: 999px; color: var(--muted);
}
footer .footer-settings:hover {
  color: var(--text); border-color: var(--border);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}
footer .footer-settings svg { display: block; }
.theme-btn {
  position: fixed; left: 12px; bottom: 12px; right: auto; top: auto; z-index: 80;
  width: 32px; height: 32px; border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 88%, transparent); color: var(--muted);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 0.85rem; cursor: grab; touch-action: none; user-select: none;
  transition: color 0.15s, border-color 0.15s, box-shadow 0.15s, background 0.15s;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
}
.theme-btn:hover { color: var(--text); border-color: var(--muted); }
.theme-btn.dragging {
  cursor: grabbing; z-index: 90;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transition: none;
}
body.footer-on .theme-btn:not(.theme-pos) { bottom: 52px; }
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

`;
