# Plan: Externe Agenten als Mitarbeiter (agent-agnostisch)

Stand 2026-10-29. **Umgesetzt: Phase 0–7** (Branch `external-agents`).
Abweichungen vom ursprünglichen Plan stehen in Abschnitt 8. Spezifikation: [docs/AGENT-CONTRACT.md](../docs/AGENT-CONTRACT.md).

Ziel: Claude Code, Codex, Cursor, Gemini-CLI, Claude-Chats, Cloud-Bots und
Menschen können als **Mitarbeiter im Organigramm** einer Company arbeiten – über einen neutralen
Vertrag (Dateien + CLI/MCP), nicht über eine Claude-spezifische API.

> Grundsatz: **Neutral ist der Vertrag, nicht das Modell.** Wer `ai-company-os --json …` aufrufen
> oder MCP sprechen kann, kann mitarbeiten.

---

## 0. Ziel und Nicht-Ziele

**Ziel**
- Ein Agent im Organigramm kann intern (heute: ein LLM pro Schritt) oder **extern** sein (ein
  eigenständiger Agent, der eine *ganze Aufgabe* übernimmt und mit eigenen Tools löst).
- Externe Agenten benutzen dieselben vier Aktionen wie interne: `complete`, `delegate`, `message`,
  `fail` (plus `heartbeat`).
- Gemischte Companies: z. B. Chief = Claude Code, Fleißarbeit = gemma4 lokal, Prüfer = Codex,
  Freigaben = du selbst.
- Bestehende Stärken bleiben: Dateien als Zustand, Audit-Hash-Kette, Budgets, Freigaben, Pause.

**Nicht-Ziele (vorerst)**
- Kein Ersatz der internen Schritt-Engine. Kleine Modelle bleiben der Standard.
- Kein Datenbank-Backend, kein Multi-User-Server, keine Cloud-Plattform.
- Keine Fernsteuerung von claude.ai-Chats ohne MCP (die können nicht von außen geweckt werden).

---

## 1. Ist-Zustand (relevant für den Plan)

| Stelle | Befund | Konsequenz |
|---|---|---|
| `src/core/tick.ts:24` `storeLocks` | Mutex nur **im Prozess** | Daemon, UI, MCP, CLI und externe Agenten können sich gegenseitig überschreiben |
| `src/core/store.ts` `audit()` | liest `audit.head`, rechnet, hängt an – ohne Sperre | parallele Prozesse **zerbrechen die Hash-Kette** |
| `src/util.ts` `writeJson`, `saveTask` | `writeFileSync` direkt, nicht atomar | Absturz mitten im Schreiben = kaputte Datei |
| `src/core/queue.ts` `claimReadyWave` | ein Task pro Assignee, `running` ohne Besitzer | kein Konzept „wer hält diesen Task, bis wann“ |
| `requeueStuckRunning(co, 10)` | alles >10 Min. in `running` wird zurückgestellt | würde lang laufende externe Agenten fälschlich „retten“ |
| `src/llm/providers/claude.ts` | `claude -p --tools ""`, neuer Prozess je Schritt | Claude nur als dummes LLM – bleibt als Option, ist aber nicht der Weg für Mitarbeiter |
| `src/core/agent-actions.ts` | `delegate`/`message`/`complete` hängen am Tick-Kontext | Logik muss herausgelöst werden, damit externe Aufrufe dieselben Regeln nutzen |
| `src/mcp/*` | MCP ruft die CLI als Kindprozess auf (`runCli`) | gutes Muster: CLI bleibt die einzige Wahrheit, MCP ist nur Hülle |

---

## 2. Entscheidungen

Jede Entscheidung: Optionen → **Empfehlung** → Begründung. Die mit ★ brauchen deine Zustimmung, der
Rest ist mein Vorschlag, den ich ohne Rückfrage so umsetzen würde.

### E1 ★ Auf welcher Ebene wird ein externer Agent eingebunden?
- **A** Schritt-Ebene: externer Agent liefert pro Schritt ein JSON (so wie heute `claude -p`).
- **B** Aufgaben-Ebene: externer Agent bekommt die ganze Aufgabe und meldet ein Ergebnis.
- **C** Beides, pro Agent wählbar.

**Empfehlung: C**, wobei „extern“ immer B bedeutet. A bleibt als normaler Provider bestehen.
Begründung: Starke Agenten arbeiten nur gut mit eigener Schleife, eigenem Kontext und eigenen Tools.

### E2 ★ Wie wird ein externer Agent aktiv?
- **A Pull**: Der Agent holt sich selbst Arbeit (`work next`) – z. B. eine offene Claude-Code-Sitzung.
- **B Push**: ai-company-os startet den Agenten per Befehlsvorlage (`codex exec "{prompt}"`).
- **C Manual**: ein Mensch oder ein Chat; ai-company-os benachrichtigt nur (Telegram), Ergebnis kommt per CLI/UI.

**Empfehlung: alle drei, in der Reihenfolge A → C → B bauen.** A und C brauchen nur den Vertrag;
B baut darauf auf. A allein deckt schon jede Sitzung ab, die MCP oder eine Shell hat.

### E3 Über welchen Kanal läuft der Vertrag?
- **A** CLI `--json` (jeder Agent mit Shell)
- **B** MCP (Claude Code, Claude Desktop, Cursor, Codex)
- **C** HTTP-API (Cloud-Agenten, Webhooks)
- **D** Agent schreibt direkt in `tasks/*.md`

**Empfehlung: A als einzige Wahrheit, B als dünne Hülle (wie heute), C später, D verbieten.**
Begründung: Direktes Schreiben umgeht Validierung, Sperren und Audit-Kette. Lesen der Dateien bleibt erlaubt.

### E4 ★ Wie werden parallele Prozesse sicher?
- **A** so lassen (Mutex nur im Prozess)
- **B** Datei-Sperre pro Company (`.lock` mit `O_EXCL`, PID + Zeit, verwaiste Sperre erkennen) + atomare Schreibvorgänge (tmp + rename)
- **C** Zustand nach SQLite verschieben
- **D** ein Broker-Prozess (Daemon) besitzt alle Schreibrechte, alle anderen reden per HTTP mit ihm

**Empfehlung: B.** Hält das Prinzip „alles sind lesbare Dateien, Ordner zippen und teilen“.
C würde das brechen, D macht den Daemon zur Pflicht und ist für ein Ein-Personen-Setup zu schwer.
Kosten: kurze Sperrzeiten, weil der Store synchron ist – passt.

### E5 Wie gehört ein Task einem externen Agenten?
- **A** Status `running` ohne Ablauf
- **B** Lease (Reservierung) mit Ablaufzeit + Heartbeat; Ablauf → zurück in die Warteschlange, zählt als Versuch
- **C** neuer Status `claimed`

**Empfehlung: B, ohne neuen Status.** `running` bleibt, dazu ein Feld `lease`.
Standard-TTL: 30 Min. (push/pull), 24 Std. (manual). Weniger Änderungen an UI und Queue-Logik.

### E6 Identität und Berechtigung
- **A** keine – `--as Researcher` reicht
- **B** Token pro Agent, Wert in Env-Var (`tokenEnv:` im Profil, wie bei Connectors)
- **C** signierte Anfragen

**Empfehlung: A lokal, B Pflicht für HTTP/Remote-MCP.** Begründung: Lokal kann jeder mit Shell die
Dateien ohnehin ändern – ein Token schützt dort nichts, macht nur Ärger. Wichtig ist, dass die
**Lease-ID** jede Aktion bindet: wer `done` ruft, muss die Lease-ID des Claims mitgeben. Das
verhindert Verwechslungen zwischen Sitzungen.

### E7 ★ Freigaben (Governance) bei Agenten mit eigenen Tools
Problem: `approveTools` greift nur bei Tools von ai-company-os. Claude Code mit Shell kann alles.
- **A** vertrauen, nur protokollieren, was gemeldet wird
- **B** Sandbox über die Flags des jeweiligen Tools (z. B. erlaubte Tools, Schreibschutz außerhalb des Arbeitsordners), pro Profil konfiguriert
- **C** Agent bekommt *nur* die ai-company-os-Tools (per MCP), keine eigenen
- **D** Ergebnis-Freigabe: Ergebnis landet erst bei dir, `done` erst nach deinem OK (`approveResults: true`)

**Empfehlung: B als Standard + D optional pro Agent + C als Modus `tools: company`.**
Außenwirkung (E-Mail, Telegram, Webhook) läuft weiter **nur** über die Company-Tools, denn die
Zugangsdaten liegen dort – so bleiben Sendungen freigabepflichtig.

### E8 Budget und Kosten externer Agenten
- **A** ignorieren
- **B** Selbstauskunft: `work done --tokens 12345`
- **C** Adapter liest den Verbrauch aus der Ausgabe (wo das Tool ihn ausgibt)
- **D** Obergrenzen nach Zeit und Anzahl: `maxTasksPerDay`, `maxMinutesPerTask`

**Empfehlung: C wo möglich, sonst B, immer zusätzlich D.** Begründung: Im Dauerbetrieb mit starken
Agenten sind Kosten das größte Risiko. Zeit- und Anzahlgrenzen funktionieren bei jedem Agenten.

### E9 Arbeitsordner externer Agenten
- **A** immer `agents/<Name>/workspace/`
- **B** frei wählbar im Profil (`cwd:`), z. B. `~/privat/patund`

**Empfehlung: A als Standard, B erlaubt mit Allowlist in `ai-company-os.json` (`allowedCwds`).**
Ergebnisse/Artefakte gehören nach `data/` der Company.

### E10 Was bekommt ein externer Agent als Auftrag?
**Empfehlung: ein einziger Renderer `brief`** (Markdown) für Push, Pull und Manual: Rolle, Ziel
der Company, Kette der Eltern-Aufgaben bis zum Ziel, Aufgabe, Posteingang, Skills, Mitarbeiter
(für `delegate`), Vertrag (welche Befehle, Lease-ID). Pull-Agenten holen ihn per `work brief`,
Push bekommt ihn als Prompt-Datei, Manual per Telegram/UI zum Kopieren.

### E11 Dürfen externe Agenten delegieren?
**Empfehlung: ja, nach denselben Regeln** (nur an direkte Mitarbeiter, Tiefenlimit, max. 6
Unteraufgaben). Das ermöglicht den wichtigsten Fall: starker externer Chief, billige interne Worker.

### E12 Wie viele Tasks gleichzeitig pro externem Agenten?
**Empfehlung: einer, wie heute.** Für mehr Durchsatz: mehrere Agenten anlegen (`Researcher-1..3`).
Ein Feld `concurrency:` erst, wenn es wirklich gebraucht wird.

### E13 Fallback, wenn ein Push-Agent endet, ohne `done` aufzurufen
- **A** streng: Task gilt als fehlgeschlagen (Retry)
- **B** locker: Exit 0 → stdout ist das Ergebnis
- **C** pro Adapter einstellbar

**Empfehlung: C, Standard B** (markiert als „Ergebnis aus stdout“ im Audit). Einfache CLIs
funktionieren damit ohne jede Anpassung; Agenten, die delegieren sollen, stellt man auf streng.

### E14 ★ Claude-Chats (claude.ai / Desktop)
- **A** nur als `manual`: du kopierst den Brief in den Chat und das Ergebnis zurück (oder sagst dem Chat, er soll die MCP-Tools nutzen, falls Desktop)
- **B** Remote-MCP über HTTP (mit Token, öffentliche URL/Tunnel nötig)

**Empfehlung: A jetzt, B erst wenn du es oft brauchst.** Ehrlich: Ein Chat wacht nie von selbst auf.

### E15 ★ Strategie
`ideas/positioning-vs-paperclip.md` sagt „wir sind *nicht* bring-your-own-agents“.
**Empfehlung: Positionierung anpassen zu „bring your own agent – aber unter Kontrolle“:**
kleine Modelle für Dauerarbeit, externe Agenten für Chef- und Spezialrollen, und alles mit Lease,
Budget, Freigaben und Audit. Damit bleibt der Unterschied zu Paperclip erhalten.

---

## 3. Datenmodell

**Agent-Profil (`profile.md`, neue Felder, alle optional)**
```yaml
runtime: external          # internal (Standard) | external | manual
adapter: codex             # Name aus ai-company-os.json → agentRuntimes (nur bei push)
cwd: ~/privat/patund       # nur mit allowedCwds
leaseMinutes: 30
maxTasksPerDay: 20
maxMinutesPerTask: 45
approveResults: true       # Ergebnis erst nach Owner-OK
tools: native              # native (eigene Tools + Sandbox) | company (nur ai-company-os-Tools)
tokenEnv: AICOS_TOKEN_REVIEWER   # nur für HTTP/Remote
```

**Task (neues Feld)**
```ts
lease?: { id: string; holder: string; via: "pull" | "push" | "manual";
          claimedAt: string; until: string; heartbeatAt?: string; pid?: number };
```

**Workspace-Konfiguration (`ai-company-os.json`, parallel zu `providers`)**
```json
"agentRuntimes": {
  "codex":       { "type": "command", "argv": ["codex", "exec", "--json", "{prompt}"], "usage": "codex-json", "onExit": "stdout" },
  "claude-code": { "type": "command", "argv": ["claude", "-p", "--output-format", "json", "{prompt}"], "usage": "claude-json", "onExit": "stdout" },
  "cursor":      { "type": "command", "argv": ["cursor-agent", "-p", "{prompt}"], "onExit": "stdout" }
},
"allowedCwds": ["~/privat"]
```
Platzhalter: `{prompt}`, `{promptFile}`, `{taskId}`, `{agent}`, `{company}`, `{cwd}`.
Env für den Kindprozess: `AI_COMPANY_OS_ROOT`, `…_COMPANY`, `…_AGENT`, `…_TASK`, `…_LEASE`.
(Die genauen Flags der Tools ändern sich oft – bei der Umsetzung mit `--help` prüfen.)

---

## 4. Der Vertrag (wird `docs/AGENT-CONTRACT.md`)

```
ai-company-os --json work next      -c SLUG --as NAME [--wait 60]   → { task, lease, brief } | exit 3 (nichts zu tun)
ai-company-os --json work brief     TASK --lease ID                 → Markdown-Auftrag
ai-company-os --json work heartbeat TASK --lease ID                 → { until }
ai-company-os --json work done      TASK --lease ID (--result TEXT | --result-file F) [--tokens N]
ai-company-os --json work fail      TASK --lease ID --reason TEXT [--retry]
ai-company-os --json work delegate  TASK --lease ID --subtasks subtasks.json
ai-company-os --json work message   --as NAME --to OTHER --text TEXT [--task TASK]
ai-company-os --json work release   TASK --lease ID                 → Task zurück in die Queue
ai-company-os --json work inbox     --as NAME
```
Exit-Codes: `0` ok · `2` Fehler in Eingabe · `3` nichts zu tun · `4` Lease ungültig/abgelaufen · `5` Company pausiert/Budget.
MCP-Tools gleichen Namens mit Präfix `work_`. Identität für MCP pro Server-Instanz über `AI_COMPANY_OS_AGENT`.

Lebenszyklus:
```
queued ──claim──▶ running(lease) ──done──▶ done ─▶ Manager-INBOX, Eltern wecken
                      │  ├─delegate─▶ waiting ─(Kinder fertig)─▶ queued
                      │  ├─fail────▶ queued (Retry) | failed
                      │  ├─release─▶ queued
                      │  └─Lease abgelaufen─▶ queued (+1 Versuch, Audit lease.expired)
                      └─approveResults─▶ waiting (Freigabe) ─OK─▶ done
```

---

## 5. Umsetzungsplan (granular)

Schätzungen sind grob und meinen konzentrierte Arbeitszeit.

### Phase 0 – Vorbereitung (≈ 0,5 Tag)
- [ ] 0.1 Entscheidungen mit ★ festhalten (Abschnitt 2), dieses Dokument aktualisieren.
- [ ] 0.2 `npm run check` grün als Ausgangsbasis.
- [ ] 0.3 `ideas/positioning-vs-paperclip.md` gemäß E15 anpassen.

### Phase 1 – Sicher über Prozessgrenzen (≈ 1 Tag) — *Voraussetzung, nützt auch ohne externe Agenten*
- [ ] 1.1 `util.writeJson` + `Company.saveTask`/`sendMessage`/`saveAgent` atomar: in `*.tmp` schreiben, dann `renameSync`.
- [ ] 1.2 `src/core/lock.ts`: `withCompanyLock(co, fn)` – synchron, `openSync(lock, "wx")`, Inhalt `{pid, ts}`, verwaiste Sperre bei totem PID oder > 30 s übernehmen, kurze Wartezyklen (`Atomics.wait`), Timeout mit klarer Fehlermeldung.
- [ ] 1.3 Kritische Abschnitte umhüllen: `claimReadyWave`, `completeTask`, `failTask`, `retryOrFail`, alle `enqueue*`/`dequeue*`, `audit()`, `addSpent()`, Freigaben in `governance.ts`. Der `AsyncMutex` bleibt für den Prozess, die Datei-Sperre liegt darunter (re-entrant pro Prozess über Zähler).
- [ ] 1.4 Test `scripts/race-test.mjs`: 4 Prozesse claimen gleichzeitig 50 Tasks → kein Task doppelt, `audit verify` intakt. In `npm run check` aufnehmen.

### Phase 2 – Kern für externe Laufzeit (≈ 1,5 Tage)
- [ ] 2.1 `types.ts`: neue Felder in `AgentSpec` und `Task` (Abschnitt 3); `store.ts` `loadAgent`/`saveAgent` lesen/schreiben sie.
- [ ] 2.2 `src/core/lease.ts`: `claimFor(co, agent, via)`, `heartbeat`, `release`, `assertLease`, `expireLeases`.
- [ ] 2.3 `claimReadyWave` überspringt Tasks externer/manueller Assignees (die interne Engine fasst sie nie an).
- [ ] 2.4 `requeueStuckRunning` respektiert Leases: nur abgelaufene zurückstellen, als Versuch zählen, Audit `lease.expired`, Manager benachrichtigen.
- [ ] 2.5 Logik aus `agent-actions.ts` herauslösen in `src/core/work.ts`: `doDelegate`, `doMessage`, `doComplete`, `doFail` – Tick und externe Aufrufe nutzen dieselben Funktionen (keine doppelten Regeln).
- [ ] 2.6 `src/core/brief.ts`: Auftrag rendern (nutzt Teile aus `prompts.ts`: Profil, Skills, Posteingang, Eltern-Kette, Mitarbeiter, Vertragstext). Posteingang wird erst beim Claim als gelesen verschoben.
- [ ] 2.7 Grenzen aus E8 prüfen: `maxTasksPerDay`, `maxMinutesPerTask` (Lease-TTL ≤ maxMinutes), Company pausiert, Budget.
- [ ] 2.8 Audit-Events: `task.claimed`, `task.heartbeat` (nur jede 5. loggen), `task.released`, `lease.expired`, `task.completed` mit `runtime`, `via`, `adapter`.
- [ ] 2.9 `approveResults`: `done` legt Freigabe an, Task → `waiting`; `approve` schließt ab, `deny` → zurück an den Agenten mit Notiz im Posteingang.

### Phase 3 – CLI, MCP, Doku (≈ 1 Tag)
- [ ] 3.1 `src/cli/work.ts` mit allen Befehlen aus Abschnitt 4, in `cli/main.ts` registrieren (Namespace `work`, weil `agent` schon belegt ist).
- [ ] 3.2 `work next --wait N`: wartet bis N Sekunden auf Arbeit (Polling alle 2 s) – damit Pull-Sitzungen nicht ständig neu fragen müssen.
- [ ] 3.3 MCP: `work_next`, `work_brief`, `work_heartbeat`, `work_done`, `work_fail`, `work_delegate`, `work_message`, `work_release`, `work_inbox` in `src/mcp/tools.ts`.
- [ ] 3.4 `docs/AGENT-CONTRACT.md` (die neutrale Spezifikation), `docs/CLI.md`, `docs/MCP.md`, `AGENTS.md` ergänzen.
- [ ] 3.5 Skill für Host-Agenten: `.agents/skills/work-as-company-agent/SKILL.md` („hol dir Arbeit, halte die Lease warm, melde Ergebnis“) – über die vorhandenen Symlinks auch für Claude Code und Cursor.
- [ ] 3.6 Smoke-Test erweitern: externer Agent wird im Test über CLI-Aufrufe simuliert (claim → delegate an internen Mock-Worker → Worker fertig → Eltern wieder bei externem Agenten → done).

### Phase 4 – Push-Adapter (≈ 1,5 Tage)
- [ ] 4.1 `agentRuntimes` + `allowedCwds` in `config.ts` (laden, validieren, `config get/set`).
- [ ] 4.2 `src/core/adapters/command.ts`: Brief als Datei in `workspace/<TASK>.brief.md`, Platzhalter ersetzen, Kindprozess starten, stdout/stderr nach `workspace/<TASK>.log`, Heartbeat übernimmt der Elternprozess solange das Kind lebt, Timeout = `maxMinutesPerTask`.
- [ ] 4.3 Ende des Kindprozesses: Task schon erledigt (Agent rief `work done`) → fertig; sonst `onExit` gemäß E13.
- [ ] 4.4 Verbrauch auslesen (`usage: claude-json | codex-json`), sonst Selbstauskunft.
- [ ] 4.5 In `tickWave` einhängen: Push-Assignees werden mit geclaimt und laufen parallel (zählen gegen `maxParallel`); Daemon und `run` übernehmen das automatisch.
- [ ] 4.6 Vorlagen dokumentieren (Codex, Claude Code, Cursor, Gemini, OpenCode) inkl. Sandbox-Flags – jeweils mit `--help` gegenprüfen.
- [ ] 4.7 `ai-company-os doctor` prüft, ob die Befehle der Adapter auffindbar sind.

### Phase 5 – UI und Telegram (≈ 1 Tag)
- [ ] 5.1 Organigramm: Abzeichen intern / extern / manuell, Adaptername.
- [ ] 5.2 Task-Detail: Lease-Inhaber, Restzeit, Log-Datei des Push-Laufs; Knöpfe „Freigeben“ (Release) und „Ergebnis eintragen“ (für manuelle Agenten).
- [ ] 5.3 Telegram: Nachricht an dich, wenn ein manueller Agent (du oder ein Chat) eine Aufgabe hat, mit Brief und Knopf „Erledigt“.

### Phase 6 – optional: Remote (≈ 2 Tage)
- [ ] 6.1 HTTP-Endpunkte für den Vertrag im UI-Server (`/api/work/*`), Pflicht-Token (E6).
- [ ] 6.2 Remote-MCP (Streamable HTTP) für Claude Desktop / claude.ai / Cloud-Agenten.
- [ ] 6.3 Anleitung Tunnel (z. B. über den Dokploy-Server) + Rate-Limit.

### Phase 7 – Feinschliff
- [ ] 7.1 Monatliche Budget-Fenster statt nur Lebenszeit-Grenzen.
- [ ] 7.2 Kosten pro Agent im Dashboard (intern Tokens, extern Tokens/Minuten).
- [ ] 7.3 Vorlage „gemischte Company“ als Plan-JSON (siehe Abschnitt 6).

**Summe Phase 0–5: ≈ 6–7 Tage. Mit Phase 6: ≈ 8–9 Tage.**
Sinnvoller erster Meilenstein: **Phase 1–3** (≈ 3,5 Tage) – danach kann jede offene Claude-Code- oder
Codex-Sitzung schon als Mitarbeiter arbeiten (Pull).

---

## 6. Abnahme-Szenario

Company `patund-kosovo-leads`:
| Agent | Laufzeit | Aufgabe |
|---|---|---|
| Chief | extern, push, Claude Code | plant, delegiert, fasst zusammen |
| LeadScout | intern, gemma4:12b | Google Maps / Portale → `leads`-Tabelle |
| Verifier | extern, push, Codex | prüft Websites, Kontaktdaten, Dubletten |
| Owner (Sanel) | manual | gibt Anschreiben frei (`approveResults`) |

Erfolgreich, wenn: Ziel „50 verifizierte Bauträger/Makler“ erreicht, kein Task doppelt bearbeitet,
`audit verify` intakt, Budget/Zeitgrenzen greifen, ein absichtlich abgeschossener Codex-Lauf nach
Lease-Ablauf neu startet.

---

## 7. Risiken

- **Prompt-Injection mit Shell-Zugriff:** gescrapte Websites landen im Kontext eines Agenten, der
  Befehle ausführen darf. Gegenmittel: Sandbox (E7), `cwd` eingeschränkt, keine Secrets in der Umgebung
  des Kindprozesses außer den nötigen, Außenwirkung nur über freigabepflichtige Company-Tools.
- **Kosten im Dauerbetrieb** mit starken Agenten → Zeit/Anzahl-Grenzen (E8) ab Tag 1.
- **Flags fremder CLIs ändern sich** → Adapter sind nur Konfiguration, `doctor` prüft sie.
- **Umfang wächst** → Phase 6 bewusst optional; zuerst nur Pull.
- **Sperren unter Last** → Sperren kurz halten (nur Dateizugriffe, nie LLM- oder Tool-Aufrufe darin).

---

## 8. Umsetzung und Abweichungen (2026-10-29)

- **Profilfeld `toolMode` statt `tools: native|company`** — `tools:` ist im Profil schon die Tool-Liste.
- **Push-Agenten melden sich per JSON-Antwort** (`{"action":"done"|"fail"|"delegate",…}` am Ende
  der Ausgabe) statt über `work done`. Dadurch brauchen gestartete Agenten keine Shell-Rechte für
  die Company; `work …` funktioniert zusätzlich, wenn sie eine Shell haben.
- **Verbrauch:** nur `usage: "claude-json"` wird ausgelesen; Codex/andere melden über `--tokens`
  oder gar nicht — dafür greifen `maxTasksPerDay`/`maxMinutesPerTask`.
- **Codex- und Gemini-Vorlagen** sind nach Doku gebaut, aber ungetestet (nicht installiert);
  Claude Code und Cursor wurden gegen die installierten CLIs geprüft.
- **Zusätzlich:** `set-runtime` (CLI) und `set_agent_runtime` (MCP), `AI_COMPANY_OS_ROOT` für die
  CLI, `ownerReport`/`ownerRelease` (Dashboard: „Ergebnis eintragen“, „Take back“),
  `readyCandidates` liest die Aufgaben nur noch einmal pro Durchlauf (läuft jetzt unter der Sperre).
- **Tests:** `npm run check` = Build + Grenzen + Smoke (inkl. externer Agenten) + Race-Test
  (6 Prozesse; ohne Sperre schlägt er nachweislich fehl).
- **Phase 6 als eigener Server** (`serve-agents`) statt im UI-Server: Der UI-Server hat kein Login,
  er darf nie öffentlich erreichbar sein. `serve-agents` zeigt nur den Vertrag, mit Pflicht-Token
  (`agent-token`), Zuständigkeitsprüfung pro Aufgabe, Rate-Limit pro Agent und gegen Durchprobieren
  pro IP (`--trust-proxy` hinter einem Tunnel), Remote-MCP zustandslos über Streamable HTTP.
  Token alternativ im Pfad `/mcp/<slug>/t/<token>` für Clients ohne eigene Header.
- **Phase 7:** Monatsfenster für Company (`budget --monthly`) und pro Agent (`monthlyBudgetTokens`)
  zusätzlich zu den Lebenszeit-Grenzen; Reservierungszeit (Minuten) wird beim Ende jeder Reservierung
  dem Agenten gebucht; Kostenübersicht pro Agent in `budget` und im Dashboard (Usage-Box, Monatsdeckel
  im Budget-Dialog); Vorlage `templates/mixed-lead-company.plan.json`, startbar mit
  `launch mixed-lead-company`, Liste mit `templates`.
- **Offen:** Abnahme-Szenario mit echten Agenten (Abschnitt 6) — braucht installiertes Codex und
  einen echten Lauf mit Kosten.
