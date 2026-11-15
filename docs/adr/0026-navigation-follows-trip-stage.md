# ADR-0026: One bottom nav for both modes, with a Stage Slot; the date picks the mode

**Status:** Accepted (Scott, 2026-11-15)
**Date:** 2026-11-15
**Deciders:** Scott
**Context:** #584 (shell and navigation), from the 2026-11-14 design review. Grill record `docs/plans/2026-11-14-shell-nav/grill.md`.

Before this, Planning Mode and Trip Mode had different tab sets (5 tabs vs 4, with Trip Mode's add button off centre), and a "To Trip Mode" / "To Planning Mode" pill floated above every screen of an active trip, duplicated by a "Trip Mode" button on the Overview. The chrome took about a quarter of the 657px folded Duo viewport.

## Decision

1. **One five-slot bottom nav for both modes:** home · Money · + · More · Stage Slot. Home is Itinerary in Planning Mode and Now in Trip Mode. The + is centred in both modes and opens the same add sheet. It replaces the floating action button.
2. **Docs, Members and Lists move under More** (in both modes). Lists also stays an Overview sub-tab.
3. **Stage Slot.** The fifth slot follows the trip's lifecycle: planning → Ideas (voting), active → the mode switch ("Plan" / "Trip"), wrap-up → Closeout, closed → Memories. Forming trips keep their own tab set.
4. **The date picks the mode.** Opening an active trip lands on Now. The manual switch is in-memory and resets on a cold launch. The floating pill and the Overview "Trip Mode" button are removed.
5. **Colour is the mode signal:** moss = Planning, clay = Trip, including section labels.

## Alternatives considered

- **A mode toggle in the top bar.** Rejected: the bar keeps its title centred, so every slot added on the right costs the same width on the left. At 373px that truncates trip names.
- **No mode at all, with a "Now:" banner as the door.** Rejected: Scott wants an explicit, consistently placed way between modes.
- **Six tabs in Planning Mode.** Rejected: labels truncate at 373px.
- **Members in slot 5 outside the trip.** Rejected: members are rarely revisited while planning. Voting is the most frequent group action.
- **Remembering the manual switch until trip-local midnight.** Rejected by Scott: the cold-launch reset is fine.

## Consequences

- A tab's destination now depends on lifecycle, so `nav-tabs.ts` takes the lifecycle stage, not just the mode.
- Members and Docs are one tap deeper. Now still shows member contacts, and item documents stay on Item detail.
- Closeout (#576) gets a findable door during wrap-up instead of living in More.
- E2E specs that click the Members or Docs tabs, the mode pill, or the FAB must change in the same PR (grep `tests/`).
