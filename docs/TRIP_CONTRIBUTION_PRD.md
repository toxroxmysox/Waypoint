# PRD — Contribution Loop: Visible Suggestions, Votable Ghost Cards, and Easy Idea Capture

> Owner: Scott Vanden Warsen
> Created: 2026-06-13 (from the #116 audit; grilled 2026-06-13; charter decisions D1/D2; findings WP-B-001, WP-A-009, WP-B-004)
> Status: Approved (design grilled + modules/testing confirmed 2026-06-13)
> Glossary: [[Suggestion]], [[Parking Lot]], [[Item]], [[Trip Member]], [[Vote]], [[Auto-approve]], [[Phase]], and the new **[[Ghost Card]]** term in CONTEXT.md.
> Depends on: **#196** (phase-required invariant — every idea/suggestion has a [[Phase]], so every ghost has a parking-lot home).
> Records: an **ADR** (votable pending contributions + vote-migration-on-approve, referencing ADR-0004) and **SPEC §6 two-gate** + **§4 permission** changes (see Implementation Decisions).

## Problem Statement

A traveler comes to a trip to weigh in — and the app loses them at both ends of the contribution.

**At capture:** a novice who wants to "add an idea I'm not sure about yet" can't find how. The trip Overview's only add affordances are "Add a phase" and "Add a day item" — both commit to a *day* as a *planned* item. The day-view FAB does the same. The one true idea-capture (an idea into a phase's [[Parking Lot]]) is buried two taps deep on Phase Detail, and the words "ideas"/"parking lot" appear nowhere on the Overview. The natural path traps the tentative idea into a committed plan.

**At feedback:** when [[Auto-approve]] is off, a traveler submits a [[Suggestion]], gets a silent redirect to the Overview with no confirmation, and then it vanishes into a void. There is no surface — none — where they can see their suggestion exists, is pending, was approved, or was rejected. The Inbox is owner-only (travelers 403). No notification fires on approve or reject, so the decision never reaches them. Rejection is completely silent. And on approval the new item is mis-attributed: `created_by` is set to the *reviewing owner*, not the traveler who proposed it — the contributor's idea is literally credited to someone else.

This is the V2 "silenced contributor" test failing at the core loop Waypoint exists to own: the group member who *had something to add* is silenced both when adding and after adding.

## Solution

Make the [[Parking Lot]] the contributor's home for the whole round-trip — capture, visibility, and feedback all in the place ideas already live. (Charter D1 keeps contribution surfaces contextual rather than a hub; a traveler seeing *their own* contribution's status is personal feedback, not a group hub, and it lives where the idea lives.)

- **Easy capture.** A consistent "add" affordance — same spot on the Overview, Phase Detail, and day views — opens a sheet that leads with a clear fork: **Add an idea** (→ parking lot, decide the day later) vs **Plan it for a day** (→ a planned item). Adding an idea takes a title, a **phase (required)**, and a type. The tentative idea is no longer trapped into a committed plan.

- **Contributions are seen and heard immediately.** When auto-approve is off, a submitted idea appears at once as a **[[Ghost Card]]** — a dotted-border placeholder in its phase's parking lot, visible to *every* member and **votable**. The group can rally behind it (or not) before the owner decides. The contributor is heard the moment they contribute, instead of waiting in a void.

- **Approval makes it real; rejection is explained, never silent.** The owner reviews from the Inbox (now a Pending / Approved / Rejected queue with vote tallies) *or* right on the ghost card in context. **Approve** turns the ghost into a real [[Item]] — carrying its [[Vote]]s over and crediting the **author**. **Reject** requires a one-line note, archives the suggestion in the Rejected tab, removes the ghost, and notifies the author with the reason. Either way the author gets a notification and closure.

- **The common case stays trivial.** Auto-approve is on for most trips, so most contributions skip all of the above: the idea becomes a real parking-lot item immediately, credited to its author, votable like any other. The ghost/vote/reject machinery is the deliberate-gatekeeping edge case.

## User Stories

1. As a traveler, I want one obvious "add" button in the same place on every planning screen, so that capturing an idea is muscle memory instead of a hunt.
2. As a traveler, I want the add sheet to ask up front whether I'm adding a loose idea or planning something for a day, so that a "maybe" doesn't get forced onto the calendar as a commitment.
3. As a traveler adding an idea, I want to pick which phase it belongs to and nothing else required, so that capture is two fields, not a ten-field form.
4. As a novice, I want the word "ideas" to appear on the trip home, so that I learn the parking lot exists at all.
5. As a traveler, I want to add an idea straight from the Overview, so that I don't have to drill into a specific phase to contribute.
6. As a traveler on a trip with review on, I want my submitted idea to appear immediately as a clearly-marked pending card, so that I can see my contribution landed instead of wondering if it sent.
7. As a traveler, I want a confirmation when I submit, and to land on the phase where my idea now sits, so that the submit moment has a visible result.
8. As any member, I want to see other members' pending ideas as ghost cards in the parking lot, so that the group's thinking is visible as it forms, not hidden until an owner blesses it.
9. As a member, I want to vote on a pending ghost card, so that I can signal support and help shape what gets approved.
10. As a contributor, I want the votes my idea gathered while pending to carry over when it's approved, so that the group's early enthusiasm isn't thrown away.
11. As a contributor, I want a ghost card to look visibly different (dotted, "pending") from a real idea, so that nobody mistakes a proposal for a settled plan.
12. As a contributor, I do NOT want to vote on my own pending idea, because submitting it is already my endorsement.
13. As a trip owner, I want pending ideas to show up in my Inbox with their vote tallies, so that I can see what the group thinks before I decide.
14. As a trip owner, I want to approve or reject an idea right from the ghost card in the parking lot, so that I can act where I'm already looking instead of going to the Inbox.
15. As a trip owner, I want approving an idea to turn it into a real item credited to the person who suggested it, so that contributors get credit for their ideas.
16. As a trip owner, I want approving an idea that named a day to land it as a planned item on that day, and one with no day to land in the parking lot, so that approval respects what the contributor intended.
17. As a trip owner, I want rejecting to require a short reason, so that I don't silently kill someone's idea — and because if I can't say why, maybe I shouldn't reject it.
18. As a contributor whose idea was rejected, I want a notification with the owner's reason, so that I understand the decision instead of watching my idea disappear.
19. As a trip owner, I want rejected ideas archived in a Rejected tab rather than deleted, so that there's a record of what was considered and why.
20. As a contributor, I want a notification when my idea is approved, so that I know it made it in without having to watch the parking lot.
21. As a member, I do NOT want notifications about other people's rejections, so that the feed isn't cluttered with decisions that aren't mine.
22. As a trip owner with auto-approve on, I want a traveler's idea to just become a real parking-lot item immediately (credited to them), so that low-friction trips stay frictionless.
23. As a viewer, I want to see ghost cards and their votes read-only, so that I stay informed without being able to add or vote.
24. As a trip owner, I want my Inbox split into Pending / Approved / Rejected, so that I can triage what needs action separately from the history.
25. As a contributor, I want to find my pending idea right where it would live (its phase's parking lot), so that there's no separate "my submissions" place to learn.
26. As a phone user, I want the whole loop — add, see pending, vote, get notified — to work one-handed at 375px, so that I can contribute from the back of a taxi.
27. As a trip owner, I want a rejected idea's ghost (and its votes) to leave the shared parking lot on rejection, so that the board reflects only live ideas.
28. As a member, I want an approved idea's ghost to seamlessly become its real card in place, so that the transition reads as "it got promoted," not "a new thing appeared."

## Implementation Decisions

- **`parking-lot-cards` is a new pure, deep module — the testable core.** It merges a phase's real unplanned [[Item]]s and its pending [[Suggestion]]s into one ordered card list, each entry tagged `kind: 'item' | 'ghost'` and carrying its [[Vote]] stack. Signature shape (from the grill): `parkingLotCards(unplannedItems, pendingSuggestions, { phaseId, viewerRole }) → Card[]`. Pure, no I/O; every parking-lot surface (Phase Detail, the day-view parking zones, the Overview ideas affordance) renders through it. Ghosts are sourced from suggestions whose `payload.phase === phaseId`; all members get ghosts (the dotted/"pending" treatment is in rendering, not in the data). Sort reuses the existing vote-score parking-lot order.
- **[[Ghost Card]] = a pending suggestion rendered in the parking lot.** Visible to all members, dotted-border, votable. It is a *view* over a `suggestions` row — no new "draft item" is written to the `items` collection while pending (keeps every existing `items` query honest; pending content never leaks into "real" item lists).
- **Votable ghosts use a new `suggestion_votes` collection — per ADR-0004, NOT a polymorphic `votes` table.** Shape mirrors `goal_votes`: `suggestion` (relation, cascade) + `member` + `value` (love/like/flexible/dislike), unique `(suggestion, member)`. Ownership rule is single-parent (`suggestion → trip`), branch-free, added to the `test:rules` matrix. The target-agnostic `voting.ts` scoring/avatar-stack logic is reused as-is. A `goal_votes`-style rule applies: **a member cannot vote on a suggestion they authored** (authorship = implicit endorsement).
- **Approval migrates votes and fixes attribution.** When an owner/co-owner approves, the hook creates the [[Item]] (planned if the payload named a day, unplanned otherwise — existing behavior), then **copies each `suggestion_vote` into a `votes` row** on the new item (same member + value), and sets the item's **`created_by` to the suggestion's author, not the reviewer** — fixing the attribution bug (previously the reviewing owner was credited). The suggestion row + its `suggestion_votes` freeze as history. This vote-copy-on-promote is a one-time transfer, distinct from ADR-0004's "votes don't roll up a link"; the new ADR records it.
- **Rejection requires a note and archives.** A new nullable `suggestions.review_note` (text) holds the reason; the reject action requires it (no one-tap reject). On reject: status → rejected, note stored, the ghost leaves every member's parking lot, and a notification goes to the **author only** (group gets no rejection noise). The suggestion is retained for the Inbox Rejected tab.
- **Two new notification types, author-facing:** `suggestion_approved` (links to the new item where it landed — its day or the parking lot) and `suggestion_rejected` (carries the `review_note` in its body; links to the phase for context). The existing `suggestion_added` (to owners on submit) is unchanged.
- **The Inbox becomes tabbed: Pending / Approved / Rejected**, each showing vote tallies; and approve/reject becomes available **contextually on the ghost card** in the parking lot (same endpoints, second entry point). The Inbox stays owner/co-owner-only; the contextual ghost actions are owner/co-owner-only too (other members see the ghost read-only-but-votable).
- **Capture: one consistent add affordance, an idea/plan fork, phase required.** The add entry sits in the same on-screen position across the Overview, Phase Detail, and day views; it opens a sheet leading with **Add an idea** (title + phase **required** + type → unplanned) vs **Plan it for a day** (→ the existing fuller flow). This generalizes the existing buried Phase-Detail "+ Add idea" quick-add rather than inventing a new mechanism. The phase-required rule is the same invariant #196 enforces — this PRD assumes it and applies it at the idea-capture point.
- **Submit moment:** replace today's silent redirect-to-Overview with a redirect to the phase where the contribution now lives, plus a toast — "Sent for review — pending in [Phase]" (auto-approve off) or "Added to [Phase]" (auto-approve on).
- **Auto-approve scoping.** Ghosts, `suggestion_votes`, the Inbox, and rejection exist only when auto-approve is off. With it on (the default, common case), a contribution becomes a real unplanned item immediately, credited to its author (this path already sets `created_by` correctly) — no ghost, no review.
- **Schema migrations are append-only** (next free number): the `suggestion_votes` collection and `suggestions.review_note`. No deletions, consistent with the never-delete rule.
- **SPEC changes this PRD records:** §6 two-gate model — **Gate 1 is redefined**: it gates whether a suggestion becomes a *real, votable item*, no longer whether the group can *see* it (pending is now visible as a ghost). §4 permission table — a traveler's pending suggestions are now group-visible; voting on ghosts is allowed for all members except the author. CONTEXT.md gains the **Ghost Card** term, updates **Suggestion** (pending is group-visible), and adds the two notification types to **Notification**.

## Testing Decisions

- Good tests assert **external behavior** — inputs in, card list / vote tally / lifecycle transition out — not internal structure. The pure merge module is the high-value target because it's I/O-free and every parking-lot render depends on it.
- **Vitest, dense — `parking-lot-cards`:** real-item + ghost merge; pending vs approved vs rejected handling (rejected never appears; approved appears as a real item, not a ghost); phase scoping (a ghost only shows in its own phase); vote-stack attachment and sort order; the all-members audience (ghosts present regardless of viewer role, with viewer read-only). Prior art: `now-state.test.ts`, the sort-order/parking tests.
- **`test:rules` — `suggestion_votes`:** a member can read and cast a vote; a member **cannot** vote on a suggestion they authored; ownership resolves via `suggestion → trip`; non-members are denied. Extend the matrix (expect the count to grow). Prior art: the `goal_votes` rule tests.
- **Playwright — two critical paths:** (1) **approve** — auto-approve off → traveler adds an idea (phase required) → ghost appears dotted → a second member votes → owner approves → it becomes a real item attributed to the author, carrying the vote → author gets the approved notification. (2) **reject** — owner rejects → note required → ghost leaves the parking lot, lands in the Rejected tab → author gets the rejected notification with the note. Prior art: existing trip-mode/collaboration specs. Visual-verify the ghost card and the add sheet at 375px.
- **Not separately unit-tested** (covered by the E2E paths): the vote-migration/attribution hook logic, notification creation, the Inbox tabbing, and the capture sheet UI — consistent with "don't test trivial CRUD / PB-hook glue in isolation."

## Out of Scope

- **Comments on ghost cards.** Comments attach to real items; a pending ghost isn't commentable. Votes are the only pre-approval signal. (Comments on real items are unchanged.)
- **Changing the `votes` or `goal_votes` collections.** `suggestion_votes` is additive; the others are untouched (ADR-0004 stands).
- **A "my contributions" hub / aggregated contribution tab.** D1 stands — feedback lives in the parking lot where ideas live, not a new hub. (The owner Inbox is the only aggregated queue, and it's owner-scoped.)
- **The offline bucket** (WP-B-010/A-004) — separate PRD.
- **Viewer comment permissions, auto-approve toggle UX, and the two-gate "Gate 2 / planning" mechanics** — unchanged except where noted.
- **Full item search / a global items index** (WP-B-022, → #200) — unrelated findability work.
- **Real-time updates** — a ghost appearing for other members follows the app's existing load/refresh model (no live subscriptions, per CLAUDE.md).

## Further Notes

- **Origin:** audit #116. Absorbs **WP-B-001** (P1 — silent submit, no traveler surface, no approve/reject notification, `created_by` attribution bug), **WP-A-009** (P2 amended — no surface for own pending/approved/rejected; silent rejection), and **WP-B-004** (P2 — buried idea capture, day-FAB pre-commit trap, "ideas" absent from Overview). Report: `docs/app-audit/v2/index.html`.
- **Charter D1/D2:** D1 (no collaboration hub — surfaces stay contextual) is honored: the loop lives in the parking lot, not a new tab; A-009's verdict already held that D1 doesn't excuse hiding a contributor's *own* status. D2 (first-five-minutes onboarding) is adjacent and tracked separately on #111.
- **The grill's key turn:** making pending suggestions group-visible *and votable* (rather than a private "your suggestions" surface) is a deliberate redefinition of the two-gate model — approval now means "make it real," not "reveal to the group." This is the load-bearing decision and the reason for the new ADR.
- **Relationship to #196 and #195:** depends on #196's phase invariant (every ghost has a home); shares nothing with #195 (wrap-up) but both use the parking lot as a first-class surface.
- **Slicing into issues** happens at milestone promotion via `to-issues` (the wrap-up / replanning PRD precedent). Natural first slice: the `suggestion_votes` collection + `parking-lot-cards` module (tracer-bullet: a votable ghost visibly appears), then capture, then the approve/reject + notifications + Inbox tabs.
- The **`created_by` attribution fix** is folded into this PRD's approve flow (it's inseparable from approve → attribute-to-author → migrate-votes), not the separate quick-fix bug it was tentatively slated as.
