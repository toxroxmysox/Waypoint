# M1 Status

**Status:** Closed. Acceptance criteria met 2026-04-24. China dogfood (May 15) reframed as real-world stress test, not a milestone gate. M2 started 2026-04-24 — see `M2_STATUS.md`.

## Sub-milestones

- [x] M1a — Scaffold + PB migrations + hooks + types
- [x] M1b — Auth + app shell
- [x] M1c — Trips list/create + trip detail
- [x] M1d — Phases CRUD
- [x] M1e — Day detail + items CRUD
- [x] M1f — Polish + E2E + final corrections

## Acceptance criteria (per SPEC §6)

- [x] Recreate Spain trip in under 60 minutes
- [x] iPhone Safari + Android Chrome — no horizontal scroll, mobile pass clean
- [x] Basic accessibility (keyboard nav, alt text, semantic HTML)
- [x] Forms validate before submit

## Stress test (post-acceptance)

- [ ] China work trip, May 15. Not a gate. If it surfaces an M1 blocker, pause M2, fix on `main`, rebase M2.

## Deferred to backlog

See `SPEC_BACKLOG.md`:
- Next/previous day navigation (→ M6)
- Multi-day lodging items (spec amendment needed)
- Tri-state booking pill (→ M3)

## Open decisions

None blocking. Tri-state booking pill: migration widens boolean → enum. Deferred to M3.

## Resume prompt (for next session or after a usage limit)

```
Resume Waypoint work.

Current milestone: M1 complete. Starting M2 (Collaboration) OR dogfooding M1 first.
Last commit: <check git log>

Before starting:
1. git status && git log --oneline -5
2. cat M1_STATUS.md && cat SPEC.md (M2 section)
3. pnpm check && pnpm test:e2e

Then confirm: are we dogfooding M1 on a real trip first, or jumping into M2 planning? Per CLAUDE.md, M2 should not start until M1 is dogfooded.
```
