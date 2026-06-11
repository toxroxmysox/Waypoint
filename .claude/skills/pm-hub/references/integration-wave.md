# Integration wave

Trigger: one or more sessions/agents report done (handoff-issue<N>.md, PR, or agent return). Don't hold a finished migration PR hostage to a slow UI slice — wave when 2–4 PRs are ready OR one urgent fix is.

## Ritual

1. **Inventory.** `git worktree list` + `gh pr list`; match by PR title / issue number. Read every handoff and every diff.
2. **Intent check — before anything merges.** Diff vs the issue's acceptance criteria + the binding contract. Drift → return it to the source with what's off, or fix inline if small. Wrong-but-green does not merge. This is the north star applied.
3. **Integration branch** off current `main`. Merge PRs in collision-aware order (see decision-frameworks).
4. **Seam read.** After merging anything that shares files with another PR or recent main, read the combined hot spots. 0 conflicts ≠ correct — git happily nests a button inside an anchor. Also reconcile cross-session *rules*: UI gating must match hook/rule tightening from sibling PRs.
5. **`pnpm install`** if any PR touched `package.json` — before judging `pnpm check` failures.
6. **Fresh-PB verify** (:8097 via `scripts/e2e-clean-pb.sh` — confirm no session is mid-E2E there first):
   - `pnpm check` → 0 errors — always
   - `pnpm test:unit` — always
   - `PUBLIC_PB_URL=http://127.0.0.1:8097 pnpm test:rules` — if hooks/rules/migrations touched; any red on fresh PB is a real regression
   - `pnpm test:e2e` against :8097 — if DOM/links/navigation touched
7. **Visual smoke.** Preview the touched surfaces at 375px; screenshot for the wave report. Skip only for zero-UI waves.
8. **Fast-forward `main` + push** (= Fly deploy). If migrations merged: restart :8090 — it only applies migrations on boot.
9. **Board + cleanup.** Close issues referencing the commits, prune worktrees, delete merged branches.
10. **Wave report to Scott.** What landed (per issue, one line), screenshots of changed UI, anything escalated, decisions waiting on him. He verifies intent from this in 30 seconds — make it carry that weight.
11. **Debrief** → append to `LEARNINGS.md` (SKILL.md § Self-improvement). Rewrite `handoff-pm-hub.md`.

## Known traps (scar tissue — details in cerebrum)

- :8090 has stale schema mid-session; a migration "bug" reproduced only there is probably not a bug.
- Explicit-field PB migrations silently lack `created`/`updated` autodates.
- New worktrees have no `node_modules` and no `.env.local`.
- `clean:dev-trips` matches by owner-email too — real-data hard stop applies.
