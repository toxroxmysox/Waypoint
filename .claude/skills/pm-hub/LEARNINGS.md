# PM-hub learnings log

Orchestration **process** learnings only — technical scars go to `.wolf/cerebrum.md` Do-Not-Repeat.

Rules of this file:
- One debrief block + one metrics row per integration wave. ≤5 lines of debrief.
- A learning that appears **twice** gets promoted into SKILL.md or the starter template, then its entries are deleted here. This file should stay short — growth means promotion isn't happening.
- Every `escaped > 0` row requires a root-cause line: which ritual step should have caught it?

## Metrics

| date | wave | PRs | seam-bugs | verify-failures | escaped | escalations |
|------|------|-----|-----------|-----------------|---------|-------------|
| 2026-06-11 | skill-adoption | 1 | 0 | 0 | 0 | 0 |
| 2026-06-12 | C: parking-scope | 2 | 0 | 0 | 0 | 1 |

## Debriefs

<!-- Append newest at top. Format:
### YYYY-MM-DD wave <n>
- Caught-for-a-session: <what I fixed that the brief should have prevented — or "none">
- Boundary: <over-asked / over-reached / clean>
- Ceremony: <step that cost time and caught nothing — or "all earned">
- Root cause (only if escaped > 0): <which step failed>
-->

### 2026-06-12 wave C: parking-scope (#159 + #160)
- Caught-for-a-session: none — both PRs matched AC exactly and self-verified green.
- Seam tip (worth keeping): `git diff --name-only <PRtip>..main` lists the PR's OWN files, so #164's `DragDropTimeline.svelte` looked overlapped. The real check is `git diff <merge-base>..main -- <file>` — empty there = main never touched it = no seam. That distinction turned a 2-file "collision" into a confirmed clean merge in one command.
- Boundary: clean. The lone "escalation" was harness-forced (auto-mode classifier blocks direct-to-main push), NOT a judgment call — Scott chose to allowlist `Bash(git push origin main)` so future waves deploy promptless. Not a recurring escalation; shouldn't inflate the metric next wave.
- Ceremony all earned: fresh-PB rules run correctly skipped (no hooks/migrations/deps); live-drag for #164 correctly NOT re-run (session Playwright-proved it; re-running mutates the dnd-test trip). Visual smoke paid off — confirmed the `page.data.parkingLotItems` contract live.

### 2026-06-11 wave: skill-adoption
- Caught-for-a-session: handoff-pm-hub.md was stale + didn't point at the skill (the build session flagged it deferred); folded it into a lean pointer + live-state file.
- Boundary: clean — docs-only adoption, no scope crossed, no real-data touched.
- Ceremony: the metrics table is the verdict-flagged risk; too early to judge — first review (after wave 5) decides whether it ever changed a decision, else cut per the skill's own instruction.
- Note: log starts here; prior session waves (phase-redesign, membership, Now slice A, bug fixes) predate the practice and aren't backfilled.

## Reviews

Every 5 waves (or 10 learnings, whichever first): read this whole file, propose ≤3 skill edits to Scott, each citing rows/entries above. Two consecutive empty reviews → double the interval and note it here.

- Next review due: after wave 5.
