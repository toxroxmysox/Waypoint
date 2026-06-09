# HANDOFF — Issue #79: Trip Goals capture wizard (prompt + reaction cards on SwipeDeck)

## What shipped

The goal-capture **wizard** at `/trips/[slug]/goals/capture`, built on the shipped
`SwipeDeck` engine. One deck interleaves two card kinds:

- **Prompt card** — a location-injected question; the member types **0..n wishes**, each
  persisted **per-add** as a `trip_goal` authored by them. Advances on a single adaptive
  button (the one asymmetry vs. auto-advancing vote cards). Skip allowed.
- **Reaction card** — a goal the member didn't create and hasn't voted on; casts a
  `goal_vote` via the same swipe/compass interaction as the harvest deck; auto-advances.

Cards **alternate 1:1** (reaction/prompt), degrading to all-prompts (new trip) or
all-reactions (prompts spent), draining to a "you're all caught up" completion with
**wishes-added · goals-rated** tallies. No migration — reuses `trip_goals` + `goal_votes`.

## Files

**Pure engine (Vitest-tested):**
- `src/lib/collaboration/swipe-deck.ts` — added `buildCaptureDeck(reactions, promptIds)`:
  pure 1:1 interleave, reactions ordered by Resolution 8 (vote-qty desc, oldest-first via
  the now-shared `byVoteQtyThenOldest` comparator). `buildDeck` behavior unchanged.
- `src/lib/collaboration/swipe-deck.test.ts` — +9 tests (alternation, both degrade modes,
  stream-drain, ordering, no-mutation).
- `src/lib/itinerary/goal-prompts.ts` — curated 8-prompt core set + `locationPhrase` /
  `buildGoalPrompts` (location injection from `location_summary`/`countries`, degrades to
  generic when blank).
- `src/lib/itinerary/goal-prompts.test.ts` — +8 tests (injection, degrade, country fold).

**Engine component (backward-compatible):**
- `src/lib/collaboration/components/swipe/SwipeDeck.svelte` — added prompt-card support:
  `kindOf` prop (defaults all cards to `'vote'` → harvest unchanged), `promptControls`
  snippet (replaces the compass rose for prompt cards), `onrewindPrompt` callback, and
  `history` now records prompt advances (`vote: null`) so **rewind stays uniform** across
  mixed cards. Drag/keyboard vote-intercept disabled on prompt cards; footer (peek/details)
  hidden. **The harvest deck's vote path is untouched** (the default branch).

**Route + UI:**
- `src/routes/(app)/trips/[slug]/goals/capture/+page.server.ts` — load (reaction
  eligibility = not-own + not-voted; vote counts; shuffled location prompts; interleave) +
  actions `addWish` / `deleteWish` (comma-list, for rewind) / `vote` / `unvote` (goal_votes,
  mirroring the harvest item-vote actions).
- `src/routes/(app)/trips/[slug]/goals/capture/+page.svelte` — the wizard: prompt-card face
  (input + per-add chips + adaptive "Add N & continue / Continue / Skip" label), reaction
  face (goal title + author), completion tallies, "Go again" (remounts the deck via a key +
  `invalidateAll`). Background persistence via hidden progressive-enhancement forms.
- `src/routes/(app)/trips/[slug]/goals/+page.svelte` — added the "Add & review wishes"
  wizard entry at the top of the Goals tab.

## Verification

- `pnpm check` — **0 errors** (the 6 `PUBLIC_PB_URL` errors on first run were a missing
  worktree `.env.local`, since copied; gitignored).
- `pnpm test:unit --run` — **280 passed / 24 files** (incl. 17 new). Harvest deck tests green.
- **375px preview** (authed e2e trip, location "Barcelona, Spain"): prompt card renders;
  location injection works ("A place in **Barcelona, Spain**…"); typing a wish + Enter
  creates a moss chip and **persists a `trip_goal`** server-side (verified via PB); the
  primary label is count-reflecting ("Add 1 & continue" → "Continue"). Console clean.

## ⚠️ Design checkpoint (flagged per the brief)

**The prompt-card primary action sits ~28px below the mobile fold** (controls at y≈798–840 in
an 812px viewport). Cause: the deck's `min-h-[100dvh]` lives **inside `AppShell`**, which adds
the `ModePill` (active trips) above and the `BottomNav` below — so the focused minigame fights
the app chrome. **This is shared with the harvest Swipe-Quiz deck** (identical structure), so
it's a pre-existing condition, not a regression — but the wizard makes it visible. Decision
worth a design pass: should both minigames become a **true full-screen takeover** (suppress
`BottomNav`/`ModePill` via a layout reset) rather than rendering inside the tab chrome? That's
a cross-cutting layout call affecting harvest too, so I did **not** unilaterally change it here.

Secondary, lower-stakes: the "Add N & continue" multi-flush currently counts
comma/newline-separated input segments (so "paella, wine" → "Add 2"); the richer
type-several-then-continue feel from the PRD ("Add 2 & continue") is approximated, not a
dedicated multi-row composer. Confirm the intended prompt-card input affordance in the same pass.

## Not done here (by scope)

- **Live reaction-card seeding** needed a foreign-authored goal, which requires a second
  trip member (superuser-gated; the mint was correctly denied). The reaction path is covered
  by Vitest (interleave) + shares the proven harvest `SwipeDeck` engine and vote-action
  pattern. Worth a quick manual pass on a real multi-member trip before merge.
- Gesture E2E for the deck remains deferred (PRD "Testing Decisions").

## Test-data note

Verification mutated the shared local dev PB: set `location_summary`/`countries` on e2e trip
`u3u6t7236x49n78` and created one `trip_goal` ("See the Sagrada Família at sunset"). Harmless
e2e scratch data; delete if it bothers you.
