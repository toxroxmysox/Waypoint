# Glossary catch-up: grill record

Source: [#548](https://github.com/toxroxmysox/Waypoint/issues/548) · Date: 2026-10-27

## Problem Statement

The code and UI use about a dozen domain words that CONTEXT.md doesn't define (Scenario, Promotion, Poll, Digest, Glance, Day Card, Idea, the MCP write flow). Several glossary words also mean two things in the code. Agents and later tickets (#543, #546) argue from the glossary, so a gap or a double meaning there turns into a naming argument or a wrong rename later.

## Intent & Success Criteria

CONTEXT.md is the one dictionary, and it matches what Scott means. It worked when:

- every term #548 lists has an entry, or appears on another entry's Avoid list;
- every naming-drift item has a ruling: amend the glossary, or rename the code (tracked in #571, #546 or #543);
- no entry contradicts an ADR.

This session changes no code.

## User Stories

1. As an agent reading CONTEXT.md, I want **Promotion** to mean only "a forming trip gets its dates", so that I never call putting an Idea on a day a promotion.
2. As an agent, I want **Idea** to be the sanctioned word for an unplanned Item, so that glossary and UI copy agree.
3. As Scott, I want a Scenario's anchor Ideas called **Core Ideas**, not keystones, because that's the word I use.
4. As Scott, I want the author of a Scenario called its **Scenario Creator**, not its champion.
5. As an agent, I want **Decision Record**, **Poll** (with its Respondent tier), **Digest**, **Day Card**, **Cascade** and **Can't-list** defined, so that I can name them without reading the ADRs.
6. As an agent, I want the AI's pending, unconfirmed changes called **Intended Changes**, so that "proposal" stays free of MCP meaning (and a Suggestion is never called a proposal).
7. As an agent, I want **Glance** to mean only the Homepage dashboard feed, so that in-app roll-ups are called summaries.
8. As an agent, I want **Organizer** to mean owner or co-owner, so that "owner" can mean only the owner.
9. As an agent, I want Multi-day Item (data) kept apart from "shows as a Span" (display), so that a red-eye is multi-day but never a Span.
10. As a future implementer, I want every code rename listed in one place, with what must not be renamed, so that the follow-up is mechanical.

## Decisions

- **Promotion** = forming → dated only (ADR-0022). There are three ways in: set dates, pick a window from Availability, or pick a Scenario. An Idea going onto a day is **planning**, never "promoting".
- **Idea** = an Item with status unplanned. It's the user-facing word. The Parking Lot is a Phase's list of Ideas. `unplanned` stays the status value.
- **Core Idea** replaces "keystone" for a Scenario's anchor Ideas. In Capabilities, "keystone" (a capability's core collection) is reworded to "core".
- **Scenario** has a **Scenario Creator** (only they edit it), forks and pros/cons. A **Decision Record** is minted only when a Scenario wins; a Promotion without a Scenario mints none (verified: only `scenarios.pb.js` writes `decisions`).
- **Poll** = the forming trip's shareable Availability link. A Respondent gives a name only and becomes a name-only Placeholder Member; email verification claims them into a full member (ADR-0023). Availability loses its stale "planned" tag (`/poll`, migration 0067 shipped).
- **Digest** = the trip's email update, reminders included. **Notification** = in-app only, no push.
- **Day Card** = the card representing one Day on the trip overview and Phase Detail. It is not an Item Card.
- **Intended Changes** = what Claude lays out for confirmation (held 15 minutes, bound to the connection that made it); each committed write is an AI Change. **Cascade** = the knock-on effects of any trip-date or Phase change, from the app, a Promotion or Claude. **Can't-list** = the ADR-0025 list, with the ADR as the authority.
- **Glance** = the Homepage dashboard feed only. It's a homelab-wide `/api/glance` convention: Payday, Wishlist and Lightbox use it too (`homeserver-stacks/BASECAMP.md`). In-app roll-ups are summaries (the Money summary).
- **Organizer** = owner or co-owner. "Owner" alone means the owner Role.
- **Multi-day Item** vs **shows as a Span**: separate concepts. A red-eye is the worked example (#538).
- **Money Unit**: "group" is added to its Avoid list. `/groups` and `src/lib/collaboration` get renamed to the glossary words.
- **No schema or contract renames.** PB fields `champion`/`keystones`, migrations, and the MCP `propose_changes`/`proposal_id` stay as they are. The glossary notes the stored names next to their terms.
- **Where renames land:** span naming → #546; the Organizer predicate → #543; everything else → #571 (refactor, afk).
- ADR-0001's status is corrected to Accepted (it's implemented).

## Testing Decisions

None for this session: the change is documentation only. #571 carries its own gate (`pnpm check`, vitest, `pnpm test:e2e:clean`, and a `grep` on tests/ for renamed routes and copy).

## Out of Scope

- Any code change. The renames are #571, #546 and #543.
- Showing "Organizer" in the UI. UI copy still says "owner or co-owner".
- Re-auditing glossary entries #548 didn't flag.

## Assumptions & Open Questions

- Q15 (where renames land) and Q16 (flip ADR-0001) were taken at my recommendation. Scott answered every other question and didn't object to these two. They're cheap to revisit.
- Whether "Organizer" should ever appear in UI copy is left open. Nothing depends on it.
