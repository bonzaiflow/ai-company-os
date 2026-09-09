/** Company conductor view markup */
export const COMPANY = `<main id="viewCompany" class="agent-open">
  <section class="sidebar">
    <div class="side-head conductor-head">
      <div class="accentbar"></div>
      <div class="side-head-body">
        <div class="eyebrow">Conductor</div>
        <div class="side-title">Task queue</div>
      </div>
    </div>
    <div class="runtime-bar">
      <div class="runtime-run" role="group" aria-label="Run tasks">
        <button type="button" class="runtime-run-btn primary" id="tickBtn" onclick="runTick()" title="Process the next ready wave once">
          <span class="runtime-run-ico" aria-hidden="true">▶</span>
          <span class="runtime-run-label" id="tickBtnLabel">Once</span>
        </button>
        <button type="button" class="runtime-run-btn" id="loopBtn" onclick="runLoopToggle()" title="Keep claiming and running tasks until you stop">
          <span class="runtime-run-ico" aria-hidden="true">↻</span>
          <span class="runtime-run-label" id="loopBtnLabel">Keep going</span>
        </button>
      </div>
      <div class="runtime-status ready" id="runtimeStatus" role="status">
        <span class="runtime-status-dot" aria-hidden="true"></span>
        <span id="runtimeStatusText">Ready</span>
      </div>
      <div class="runtime-tools" role="group" aria-label="Queue tools">
        <button type="button" class="runtime-tool" id="pauseBtn" onclick="togglePause()" title="Pause or resume the company">
          <span class="runtime-tool-ico" id="pauseBtnIco" aria-hidden="true">⏸</span>
          <span class="runtime-tool-label" id="pauseBtnLabel">Pause</span>
        </button>
        <button type="button" class="runtime-tool" id="graphBtn" onclick="openTaskGraph()" title="Task dependency graph" aria-label="Task dependency graph">
          <span class="runtime-tool-ico" aria-hidden="true"><svg viewBox="0 0 16 16" width="16" height="16"><circle class="n" cx="8" cy="3.2" r="1.55"/><circle class="n" cx="3.4" cy="12.5" r="1.55"/><circle class="n" cx="12.6" cy="12.5" r="1.55"/><path d="M8 4.8V7.2L3.8 11.1M8 7.2l4.2 3.9"/></svg></span>
          <span class="runtime-tool-label">Graph</span>
        </button>
        <button type="button" class="runtime-tool danger" id="flushBtn" onclick="flushQueue()" title="Clear queued and waiting tasks" aria-label="Clear queue">
          <span class="runtime-tool-ico" aria-hidden="true">⌫</span>
          <span class="runtime-tool-label">Clear</span>
        </button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab" id="ltQueue" onclick="setLeftTab('queue')">Queue <span class="count" id="cntQueue"></span></button>
      <button class="tab" id="ltHistory" onclick="setLeftTab('history')">History <span class="count" id="cntHistory"></span></button>
    </div>
    <div class="side-inner"><div id="tasks"></div></div>
  </section>
  <section class="co-stage">
    <div class="co-mast">
      <button type="button" class="backlink" onclick="nav('home')">← Home</button>
      <div class="co-mast-row">
        <div class="co-mast-main">
          <div class="co-brand">AI Company OS</div>
          <div class="page-title" id="coName"></div>
          <div class="subtitle" id="coGoal"></div>
        </div>
        <div class="bars" id="bars">
          <div class="bar" id="tokWrap">Tokens remaining <span class="num" id="tokTxt"></span><div class="track"><div class="fill" id="tokBar"></div></div></div>
          <div class="co-pinned" id="coPinnedTools"></div>
          <button type="button" class="grant-btn" id="coExportBtn" onclick="openCompanyExport()" title="Export company as .zip">Export</button>
          <div class="co-tools">
            <button type="button" class="co-tools-toggle" id="coToolsToggle" onclick="toggleCoTools(event)" aria-expanded="false" aria-controls="coToolsMenu">More</button>
            <div class="co-tools-menu" id="coToolsMenu" hidden>
              <div class="co-tools-row" data-tool="grant">
                <button type="button" class="grant-btn" data-co-tool="grant" onclick="grantTokens()">＋ Grant</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('grant', event)" title="Pin Grant" aria-label="Pin Grant" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row" data-tool="data">
                <button type="button" class="grant-btn" data-co-tool="data" onclick="openDbBrowser()">Data</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('data', event)" title="Pin Data" aria-label="Pin Data" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row" data-tool="approvals">
                <button type="button" class="grant-btn" data-co-tool="approvals" onclick="openApprovals()">Approvals</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('approvals', event)" title="Pin Approvals" aria-label="Pin Approvals" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row" data-tool="checkins">
                <button type="button" class="grant-btn" data-co-tool="checkins" onclick="openCheckins()">Check-ins</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('checkins', event)" title="Pin Check-ins" aria-label="Pin Check-ins" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row" data-tool="schedule">
                <button type="button" class="grant-btn" data-co-tool="schedule" onclick="openSchedule()">Schedule</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('schedule', event)" title="Pin Schedule" aria-label="Pin Schedule" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row" data-tool="connectors">
                <button type="button" class="grant-btn" data-co-tool="connectors" onclick="openConnectors()">Connectors</button>
                <button type="button" class="co-tools-pin" onclick="toggleCoToolPin('connectors', event)" title="Pin Connectors" aria-label="Pin Connectors" aria-pressed="false"></button>
              </div>
              <div class="co-tools-row">
                <button type="button" class="grant-btn co-tools-danger" onclick="deleteCurrentCompany()" title="Delete this company">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="co-org-label">Organization</div>
    <div class="org" id="org"></div>
  </section>
  <section class="sidebar agent-sidebar" id="agentSidebar">
    <div class="side-head">
      <div class="accentbar" id="agentAccent"></div>
      <div class="side-head-body">
        <div class="sidebar-header-top">
          <div class="eyebrow">Agents</div>
          <button type="button" class="sidebar-close" onclick="closeAgentSidebar()" aria-label="Close">×</button>
        </div>
        <div class="tabs" id="agentPills" style="border:0;padding:0.4rem 0 0"></div>
      </div>
    </div>
    <div class="tabs" id="agentTabs"></div>
    <div class="side-inner agent-body" id="agentBody"></div>
  </section>
</main>

`;
