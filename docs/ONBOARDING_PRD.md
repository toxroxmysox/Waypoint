# PRD — Onboarding: the invited member's first five minutes

> **Status:** Planned (grilled 2026-06-22, supersedes #111's "wizard" framing). Capability: **People & Membership → Onboarding** (`docs/CAPABILITY_MAP.md`). Term: `CONTEXT.md` **Onboarding**. Origin: BUILD_PLAN S4/S5, #111. **No ADR** — the data-model trade-off is recorded in the glossary term + here.

## Problem

A stranger taps a friend's invite link and lands on a **bare planning tool with zero orientation** — no "here's what this trip is, here's that you belong, here's the one thing to do." The 🔴 Onboarding gap in the Capability Map.

**The real defect (code-grounded):** the existing first-run hero (ES-1, `src/routes/(app)/trips/[slug]/+page.svelte:186`) is keyed on `isFresh` = **the trip has zero content**. The moment a trip has any items the hero vanishes for everyone — **including a freshly-invited member who joins a trip that already has plans.** That is the *common* invited case, and today they get **nothing.** ES-1 only covers the creator's brand-new empty trip.

## The job (intent)

Turn an invited member's first five minutes into **orientation + one real contribution**: understand *what you can do in **this** trip* and *do one thing*. **Not** a feature tour, **not** "why Waypoint exists."

## Scope

**In (this PRD, invited-first):**
- The invited member's first-time-in-a-trip experience (primary).
- A **slight polish** to the organic/creator path to get into a trip, where the **same** intro fires (convergence point).

**Out (deferred → separate issue):** the app-home / direct-visitor *acquisition* surface — "why this app / what is it" pitch, heavier curated-create, the "were you invited?" fork. Tracked separately; converges with this once everyone is in a trip.

## Non-goals
- No multi-step wizard / guided tour / tooltip sequence (explicitly rejected — the issue's literal "wizard" title is overturned).
- No pre-auth landing/marketing page.
- No per-trip re-onboarding of veterans.

## Design

### 1. The welcome card
A **single role-aware welcome card** on the trip overview (`/trips/[slug]/+page.svelte`) — **not** a step-through. Copy names the doors ("see the plan · weigh in on ideas · add what you want out of it") with **one** primary CTA. Reuses ES-1's `Card` pattern.

### 2. Keyed on the member, not on trip content
Renders on a member's **first visit**, gated by a **per-user once-ever** complete-signal — **regardless of whether the trip has content.** This is the fix for the ES-1 gap.

### 3. Adaptive primary CTA
- Trip **has votable content** (suggestions/items to vote on) → **"Weigh in on what's been suggested"** (→ swipe/vote). The gentlest first contribution — one tap, instant "I participated" — and the common state of a trip you're invited into.
- Trip is **bare** → **"Add what you want out of this trip"** (→ `/goals/capture`).
- Detection is cheap (overview already fetches items/suggestions).

### 4. Complete-signal (the data-model decision)
- **Scope: per-user, once-ever.** One nullable field on `users` (e.g. `onboarded_at`). `null` → auto-show. The walkthrough teaches *the app*; you learn it once. A veteran invited to a new trip is **never re-nagged.**
- **Set when:** the member completes the suggested first action (vote/goal) **or** taps "Got it" to dismiss.
- **Gates only the auto-show.**
- **Accepted trade-off:** a user whose first trip was self-created (empty → goals CTA) never auto-sees the vote-oriented welcome on a later populated trip. Acceptable — they've learned the app; discovery + re-trigger cover it.
- **Migration:** append-only on `users` (PB rule). **Watch the goja DateField-truthy scar** (`.wolf/cerebrum.md`) — check via `getString`, or model it as a boolean.

### 5. Re-trigger
A **"Replay intro"** entry in Settings / the "More" menu shows the card on demand, **ignoring the flag** (does not depend on / does not clear `onboarded_at`).

### 6. Absorb ES-1 (execution seam)
ES-1's content-keyed empty hero and this user-keyed card both fire for a brand-new creator on an empty trip. **Resolution:** the user-keyed welcome **absorbs** ES-1 — ES-1's role-aware "blank itinerary" owner-tier copy/doors become the **empty-trip branch inside the unified card.** One card, two keys folded; no stacking.

### 7. Organic-path polish
A *light* improvement to the empty `/trips` state (today just *"No trips yet." [New trip]*, `src/routes/(app)/trips/+page.svelte:82`) so a direct user gets into a trip and lands in the **same** welcome card. Minimal — not the deferred curated-create.

## Acceptance
- An invited member landing in a **populated** trip sees the welcome card on first visit (the case ES-1 misses today).
- The card is **one** role-aware surface, not a sequence.
- Primary CTA adapts: vote when votable content exists, else goals.
- Completing the first action **or** "Got it" sets `onboarded_at`; the card does not auto-show again on any trip.
- "Replay intro" in Settings/More re-shows it.
- A brand-new creator on an empty trip sees **one** unified card (ES-1 absorbed, no double hero).
- Verified at **375px**; `pnpm check` green; `pnpm test:e2e` (adds links/buttons).

## Slices → implementation issues (tracer-bullet vertical slices)
1. **Spine (tracer bullet) — #274:** `users.onboarded_at` migration + `needsOnboarding(user)` + the member-keyed welcome card on the trip overview (basic CTA) + set-complete on action/dismiss + **absorb ES-1's empty hero**. End-to-end: a first-visit member sees the card and completes it. *(Blocks the rest.)*
2. **Adaptive CTA — #275:** detect votable content → vote/swipe vs goals.
3. **Re-trigger — #276:** "Replay intro" in Settings / More.
4. **Organic polish — #277:** empty `/trips` → into-a-trip → same welcome card.

Each slice ships its own e2e + 375px verification. **Deferred (separate, #278):** the app-home / direct-visitor *acquisition* surface.
