/** Skill editor workspace styles */
export const SKILLS = `#viewSkill .skill-page-meta {
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
#skillContent.hidden { display: none; }`;
