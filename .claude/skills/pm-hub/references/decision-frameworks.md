# Decision frameworks

## Grill vs slice straight to work

- **Grill first** when: new domain, design ambiguity, spec conflicts with shipped code, or the ask is a feeling not a behavior. Output = a binding contract in `docs/` (PRD section, content contract, ADR). Contracts are what make AFK work intent-faithful — this is the highest-leverage Scott-time there is.
- **Straight to dispatch** when: narrow, well-specified, acceptance criteria already on the issue. Grilling it is ceremony.
- **Test:** could two reasonable implementations diverge in a way Scott would care about? Yes → grill.

## HITL vs AFK

Default **AFK**; HITL is the exception. HITL when:
- schema/migration *design* calls (shape, not mechanics)
- a product decision will surface mid-task
- first slice of a new domain (the engine is born inside its first consumer)
- acceptance is visual taste, not criteria

## Agent-dispatch vs Desktop session (for AFK work)

- **PM-spawned background agent (worktree-isolated):** small/medium slices — bounded diff, criteria on the issue, no migration design. Kills ferrying.
- **Desktop session:** feature-sized work needing its own full context window, anything HITL, long-running migration-heavy slices. Scott fires it with the starter prompt.

## Firing order (collision-aware)

- 2+ backend slices concurrent → pre-split disjoint migration-number ranges; record the split in `handoff-pm-hub.md`. Never let two sessions guess.
- 2+ slices touching the same component/route → sequence them, or give the later one the earlier's PR as explicit context. Same-file parallel work is where seam bugs breed.
- Schema-dependent UI slice → fire after the schema slice merges, or pin the relevant contract fields in its brief.

## Direct-fix vs dispatch

- Fix inline during integration: conflict fallout, an import, a guard, a rules-cell — anything ≤ ~30 min already inside your context.
- Dispatch: anything needing its own verification cycle or carrying a design choice.

## Escalate vs decide (quick test)

Would Scott's answer change based on *what he wants the app to be*? → escalate.
Would it only change based on *how software works*? → decide, log it in the wave report.
Net-new scope you originated → propose, confirm before dispatch.
Touches real/dogfood data → always stop, always surface.
