/** SQLite browser styles */
export const DB = `/* ── DB browser: overview (level 1) ── */
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
#skillItems.skills-shelf,
.skills-shelf {
  display: flex; flex-direction: column; gap: 0;
  border-top: 1px solid var(--border);
}
.skillitem {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 1.25rem;
  align-items: start; background: transparent; border: 0;
  border-bottom: 1px solid var(--border); border-radius: 0; border-left: 0;
  padding: 1.1rem 0.15rem; cursor: pointer; min-width: 0; height: auto;
  text-align: left; transition: background 0.15s ease, padding 0.15s ease;
}
.skillitem:hover {
  transform: none; box-shadow: none;
  background: color-mix(in srgb, var(--blue) 6%, transparent);
  border-color: var(--border); padding-left: 0.55rem; padding-right: 0.4rem;
}
.skillitem.on {
  border-color: var(--border);
  background: color-mix(in srgb, var(--blue) 8%, transparent);
  box-shadow: none;
}
.skillitem.action {
  display: flex; align-items: center; justify-content: flex-start;
  text-align: left; border-style: solid; background: transparent;
  color: var(--blue-bright); font-size: 0.9rem; font-weight: 600; min-height: 0;
  padding: 1.05rem 0.15rem;
}
.skillitem.action:hover {
  color: var(--text); transform: none; box-shadow: none;
  border-color: var(--border);
  background: color-mix(in srgb, var(--blue) 6%, transparent);
  padding-left: 0.55rem;
}
.skillitem.action label {
  cursor: pointer; width: 100%; height: auto;
  display: flex; align-items: center; justify-content: flex-start;
}
.skillitem-top {
  display: flex; justify-content: space-between; align-items: baseline; gap: 0.75rem;
  grid-column: 1;
}
.skillitem-name { font-size: 1.08rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; }
.skillitem-slug {
  font-family: "JetBrains Mono", monospace; font-size: 0.68rem; color: var(--muted); margin-top: 0;
  grid-column: 1;
}
.skillitem-desc {
  color: var(--muted); font-size: 0.88rem; line-height: 1.45; flex: none;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  max-width: 40rem; grid-column: 1;
}
.skillitem-meta {
  display: flex; flex-wrap: wrap; gap: 0.35rem 0.75rem; align-items: center; margin-top: 0.15rem;
  font-size: 0.68rem; color: var(--muted); font-family: "JetBrains Mono", monospace;
  grid-column: 1;
}
.skillitem > .src {
  grid-column: 2; grid-row: 1; align-self: center;
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

`;
