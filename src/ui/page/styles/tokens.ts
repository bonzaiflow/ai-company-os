/** Design tokens and base element styles */
export const TOKENS = `:root {
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

`;
