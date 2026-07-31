# Self-improving skills

Today skills are static SKILL.md files a human writes. The failure data to improve them
already exists on disk: every task transcript shows where an agent misused a tool,
looped, or needed the repair pass.

**Idea:** a `SkillSmith` maintenance company (or a chief action) that periodically:
1. Reads failed/slow task transcripts across companies (`agents/*/workspace/*.md`).
2. Diagnoses the recurring mistake ("agent invents sqlite column names", "fetches the
   same URL repeatedly").
3. Proposes a patch to the relevant workspace skill — as a *plan*, so the human reviews
   the diff in the UI before it lands (skills change agent behavior; silent edits are
   risky).
4. Tracks skill versions in the skill folder (`SKILL.md`, `CHANGELOG.md`) so a bad edit
   can be reverted.

Cheap first step: a `ai-company-os skills doctor` command that clusters error observations from
audit.jsonl by tool and prints "your agents failed 14 sqlite calls with 'no such
column' — consider tightening data-entry skill".
