/** Plan studio view markup */
export const PLAN = `<main id="viewPlan">
  <section class="plan-stage">
    <div class="plan-mast">
      <button type="button" class="backlink" onclick="nav('home')">← Home</button>
      <div class="plan-brand">AI Company OS</div>
      <div class="page-title" id="planTitle">New plan</div>
      <div class="subtitle">Describe the goal in chat. A roster drafts here — then launch it to disk.</div>
    </div>
    <div id="planDoc">
      <div class="plan-empty">
        <div class="plan-empty-title">Start in the conversation</div>
        <div class="plan-empty-body">Tell the planner what you want accomplished. The living plan and org preview will appear here.</div>
      </div>
    </div>
    <div class="planbar" id="planBar" style="display:none">
      <span class="plan-budget-display" id="planBudgetDisplay" tabindex="0" role="button" title="Click to edit token budget"></span>
      <input type="number" id="planBudgetTokens" class="plan-budget-input" min="1" step="1" style="display:none" aria-label="Token budget">
      <span class="planbar-divider" aria-hidden="true"></span>
      <label class="planbar-label muted" for="planName">Company name</label>
      <input type="text" id="planName">
      <span class="planbar-divider" aria-hidden="true"></span>
      <label class="planbar-label muted" for="agentsProviderSel" title="Default LLM for agents without a per-agent override">Agents</label>
      <select id="agentsProviderSel" title="Default agent LLM source" style="font-size:0.72rem"></select>
      <select id="agentsModelSel" title="Default agent model" style="font-size:0.72rem;max-width:9rem"></select>
      <button class="btn" id="launchBtn" onclick="launchPlan()">Launch company</button>
      <button class="btn danger" id="planDeleteBtn" onclick="deleteCurrentPlan()" title="Delete this plan">Delete plan</button>
    </div>
  </section>
  <section class="sidebar">
    <div class="side-head">
      <div class="accentbar"></div>
      <div class="side-head-body">
        <div class="eyebrow">Studio</div>
        <div class="side-title">Plan
          <select id="providerSel" title="Planning LLM source" style="margin-left:0.5rem;font-size:0.72rem"></select>
          <select id="planningModelSel" title="Planning model" style="margin-left:0.35rem;font-size:0.72rem;max-width:9rem"></select>
        </div>
      </div>
    </div>
    <div class="side-inner" style="display:flex;flex-direction:column;overflow:hidden;padding:0">
      <div class="chatbox">
        <div class="setup-chat-sidebar-log" id="planLog"></div>
        <div class="setup-chat-dock">
          <form class="setup-chat-composer" id="planChatForm" onsubmit="event.preventDefault();sendPlanMsg();">
            <div class="chat-attach-chips" id="planAttachChips" hidden></div>
            <textarea id="planInput" rows="1" placeholder="Describe what you want to accomplish..." aria-label="Message"></textarea>
            <div class="setup-chat-composer-bar">
              <span class="setup-chat-composer-hint" id="planChatHint">Enter to send · drop plan sections for context</span>
              <div class="setup-chat-composer-actions">
                <input type="file" id="planAttachFile" accept=".json,.geojson,.csv,.tsv,.txt" style="display:none" onchange="if(this.files[0])uploadToPlan(this.files[0]);this.value='';">
                <button type="button" class="setup-chat-attach" title="Attach data for your next message (overpass-turbo JSON/GeoJSON/CSV)" onclick="document.getElementById('planAttachFile').click()">📎</button>
                <button type="submit" class="setup-chat-send" id="planSend" disabled aria-label="Send message"></button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </section>
</main>

`;
