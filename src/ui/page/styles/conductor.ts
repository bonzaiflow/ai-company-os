/** Conductor / runtime control styles */
export const CONDUCTOR = `/* Conductor — runtime controls */
.conductor-head .side-title { font-size: 1.05rem; }
.runtime-bar {
  display: flex; flex-direction: column; gap: 0.65rem;
  padding: 0.75rem 0.9rem 0.8rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
}
.runtime-run {
  display: flex; gap: 3px; padding: 3px;
  background: var(--bg); border: 1px solid var(--border); border-radius: 999px;
}
.runtime-run-btn {
  flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.35rem;
  border: none; border-radius: 999px; padding: 0.52rem 0.5rem;
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
  box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.35);
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
  display: flex; align-items: center; gap: 0.45rem;
  min-height: 1.1rem; padding: 0.15rem 0.35rem;
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
}
.runtime-status-dot {
  width: 0.45rem; height: 0.45rem; border-radius: 50%; flex-shrink: 0;
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
  50% { box-shadow: 0 0 0 5px rgba(96, 165, 250, 0); }
}

.runtime-tools {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.3rem;
}
.runtime-tool {
  display: inline-flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.15rem; min-height: 2.35rem; padding: 0.3rem 0.15rem;
  border: 1px solid transparent; border-radius: 10px;
  background: transparent; color: var(--muted);
  font: inherit; font-size: 0.6rem; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s, opacity 0.15s;
}
.runtime-tool:hover:not(:disabled) {
  color: var(--text); border-color: var(--border);
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  transform: none; box-shadow: none;
}
.runtime-tool.alert {
  color: #f87171; border-color: rgba(248, 113, 113, 0.35);
  background: color-mix(in srgb, #f87171 8%, transparent);
}
.runtime-tool.danger { color: color-mix(in srgb, #f87171 70%, var(--muted)); }
.runtime-tool.danger:hover:not(:disabled) {
  color: #f87171; border-color: rgba(248, 113, 113, 0.4);
  background: color-mix(in srgb, #f87171 8%, transparent);
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

`;
