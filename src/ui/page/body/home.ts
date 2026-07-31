/** Home view markup */
export const HOME = `<main id="viewHome" class="on home-welcome">
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
        <div class="home-skills" id="skillCardsWelcome"></div>
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
        <div class="home-pager" id="homeCompanyPager" hidden>
          <div class="home-pager-meta" id="homeCompanyPagerMeta"></div>
          <div class="home-pager-actions">
            <button type="button" class="home-pager-btn" id="homeCompanyPrev" onclick="homePortfolioPageDelta(-1)">Previous</button>
            <button type="button" class="home-pager-btn" id="homeCompanyNext" onclick="homePortfolioPageDelta(1)">Next</button>
          </div>
        </div>
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
        <div class="home-skills" id="skillCards"></div>
      </div>
    </div>
  </section>
</main>

`;
