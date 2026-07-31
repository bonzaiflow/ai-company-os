/** Skills library and skill editor markup */
export const SKILLS = `<main id="viewSkills">
  <section class="skills-stage">
    <div class="skills-mast">
      <button type="button" class="backlink" onclick="nav('home')">← Home</button>
      <div class="skills-mast-row">
        <div class="skills-mast-main">
          <div class="skills-brand">AI Company OS</div>
          <h1 class="skills-title">Skills</h1>
          <p class="skills-lead">Folders of instructions agents can use. Workspace skills override bundled ones and copy into companies at launch.</p>
        </div>
        <div class="skills-mast-actions">
          <input type="file" id="skillUpload" accept=".zip,.md" style="display:none" onchange="onSkillUpload(event)">
          <button type="button" class="home-link" onclick="document.getElementById('skillUpload').click()">Upload</button>
          <button type="button" class="btn" onclick="openSkill(null)">New skill</button>
        </div>
      </div>
    </div>
    <div class="skillrow">
      <div class="skilllist">
        <div class="home-dir-section-head" style="margin-bottom:0.85rem">
          <div class="home-dir-section-label">Library</div>
          <div class="home-dir-section-count" id="skillsLibraryCount"></div>
        </div>
        <div id="skillItems" class="skills-shelf"></div>
        <div class="home-pager" id="skillsPager" hidden>
          <div class="home-pager-meta" id="skillsPagerMeta"></div>
          <div class="home-pager-actions">
            <button type="button" class="home-pager-btn" id="skillsPrev" onclick="skillsPageDelta(-1)">Previous</button>
            <button type="button" class="home-pager-btn" id="skillsNext" onclick="skillsPageDelta(1)">Next</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</main>

<main id="viewSkill">
  <section class="skills-stage">
    <div class="skills-mast skills-mast-compact">
      <button type="button" class="backlink" onclick="nav('skills')">← Skills</button>
      <div class="skills-brand">AI Company OS</div>
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

`;
