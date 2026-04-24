# M1 Status

**Status:** Complete. Final corrections landed. E2E green (2/2).

## Sub-milestones

- [x] M1a — Scaffold + PB migrations + hooks + types
- [x] M1b — Auth + app shell
- [x] M1c — Trips list/create + trip detail
- [x] M1d — Phases CRUD
- [x] M1e — Day detail + items CRUD
- [x] M1f — Polish + E2E + final corrections

## Outstanding before declaring M1 "done per SPEC"

- [ ] Dogfood on the China work trip (May 15)
- [ ] Recreate Spain trip inside 60 minutes as the acceptance test
- [ ] iPhone Safari + Android Chrome sanity pass (no horizontal scroll confirmed; full pass pending)

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
