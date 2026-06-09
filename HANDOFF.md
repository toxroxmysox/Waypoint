# HANDOFF — SwipeDeck engine + Swipe-Quiz harvest (#76)

**Branch:** `feat/swipedeck` · **PR:** https://github.com/toxroxmysox/Waypoint/pull/96 (open, **not merged**)
**Status:** Done — built, tested, 375px feel-checked with Scott (HITL). Awaiting review.

---

## What shipped

The shared `SwipeDeck` engine (Direction B "Compass", ported React → Svelte 5), built inside its first consumer — the phase-scoped item **Swipe-Quiz harvest**.

| File | Role |
|------|------|
| `src/lib/collaboration/swipe-deck.ts` | Pure `buildDeck(items, myVotes, scope)` + `voteFromIntent` + `COMMIT_PX` |
| `src/lib/collaboration/swipe-deck.test.ts` | 25 Vitest cases |
| `src/lib/collaboration/components/swipe/SwipeDeck.svelte` | The engine (interaction, motions, a11y) |
| `…/swipe/CompassRose.svelte` | Love N / Like E / Pass W / Flexible S buttons (≥56px) |
| `…/swipe/RadialProgress.svelte` | Countdown ring |
| `…/swipe/FlyingCard.svelte` | Voted-card fly-off layer |
| `…/swipe/vote-meta.ts` | Compass dressing (glyph/label/dir/colors) |
| `src/routes/(app)/trips/[slug]/swipe/[phaseId]/+page.{server.ts,svelte}` | Harvest wrapper + `vote`/`unvote` actions |
| `src/routes/(app)/trips/[slug]/phases/+page.{server.ts,svelte}` | Launch card ("Swipe through N unrated") |
| `src/routes/layout.css` | `wp-rise` / `wp-fly` keyframes + reduced-motion fade |

**Acceptance criteria (#76):** all met. Buttons+keyboard+SR usable with no gestures (WCAG 2.1 AA), `aria-live` per vote, 88px commit + dead down-swipe, Flexible button-only, rapid-tap ref-gated, distinct rise/fly motions, peek (no count), Rewind restores+deletes, writes `votes`, completion = spread + continue + parking-lot.

---

## Decisions locked during the grill → **update PRD / cerebrum**

1. **Label = "Pass"** — open flag in the engine handoff is **closed**. Matches shipped `VoteButtons` + migration `0029` (`value: dislike` → label "Pass"). Not a choice; it's what ships.
2. **`buildDeck` vote-quantity input** — items arrive **loader-decorated with `voteCount`** (count of all members' votes). Keeps the 3-arg signature pure/testable. `myVotes` is only used for the unvoted filter.
3. **Eligible statuses = `planned` + `unplanned` ONLY.** `done`/`considered` are **closeout-only** (post-trip); Swipe-Quiz runs before/during, so they never appear. (Sharpens the PRD's "planned+unplanned inclusion" — it's an exhaustive list, not examples.)
4. **No skeleton** — deck mounts with the first card, or an "All caught up" empty-state at zero unvoted items.
5. **Completion = three agreed elements only** (rose spread + continue-to-next-phase + jump-to-parking-lot). No streaks/stats.
6. **Tablet+ = centered modal** for the detail overlay (mobile = bottom sheet), via a `(min-width: 900px)` check. Same compass.
7. **Next-phase hand-off skips empty phases** — `nextPhaseId` = next phase in order that still has unvoted eligible cards (null if none). More useful than naive "next."

### Design changes made live during the 375px checkpoint (HITL)
- **Fly-from-release-position** — the voted card now flies off continuously from where the drag was released (was snapping back to center first). `fromX/fromY/fromRot` threaded into `FlyingCard`.
- **Commit-threshold cue** (Scott's request) — past 88px the card snaps to a colored **ring** (moss for Love/Like, clay for Pass) + a filled **✓ chip**, signalling "release casts the vote" vs. "springs back" below it.
- **Physics constants locked as-is** from the prototype (88px / ×0.8 up-bias / ×0.22 down rubber-band / `cubic-bezier(.16,1,.3,1)` / 400ms fly).

---

## Verification

- `pnpm check`: **0 errors, 0 warnings.**
- Vitest: **227/227 pass** (25 new in `swipe-deck.test.ts`).
- 375px live feel-check (deck, peek, vote→advance, completion rose, drag spring, commit cue) via a throwaway harness route — **removed before the PR**.

## ⚠️ What's left / risk

- **No end-to-end DB run.** This worktree has **no PocketBase binary, no `pb_data` seed, no `.env.local`** — there was no authed trip to drive the real route against. The harvest path (auth, `votes` persistence, hand-off navigation, parking-lot) is covered by **unit tests + type-clean `pnpm check`**, and the `vote`/`unvote` actions **mirror the shipped item-detail vote action exactly**. Still, **a live authed smoke test is pending** before this is trusted in prod. Recommend the reviewer (or a follow-up session with a seeded backend) run: launch from Phases sub-tab → swipe a phase → verify `votes` rows → rewind deletes → continue-to-next-phase.
- **`.wolf/` is absent in this worktree** — OpenWolf isn't initialized here, so cerebrum/anatomy/buglog were not updated. The locked decisions above should be folded into the canonical `docs/V4_GROUP_INPUT_PRD.md` Resolutions + cerebrum by the PM hub.
- **Note/checklist item types** are not specially excluded — any `planned`/`unplanned` item in the phase is swipeable, mirroring item-detail voting. Flag if those types shouldn't be votable.

## Suggested new issues to file

1. **Goal-capture wizard on the same engine** (the substrate's raison d'être) — interleaved prompt cards + reaction cards, drains to "you're all caught up." Engine is ready (`#77`-adjacent; was OPEN-2 in the engine handoff). The `SwipeDeck` already supports a `face` snippet per card; a `prompt`-card kind + 1:1 alternation (Resolution 8) is the remaining work.
2. **Whole-trip sweep scope** (deferred in v4 per Resolution 5) — `buildDeck`'s `scope` already takes `phaseOrder`; widening to a trip scope is small.
3. **Live integration test / E2E** for the harvest path once a seeded backend is available (Playwright critical-path).
