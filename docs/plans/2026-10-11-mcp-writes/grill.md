# MCP connector v3.2 (writes): grill record

Source: [toxroxmysox/Waypoint#503](https://github.com/toxroxmysox/Waypoint/issues/503) · Date: 2026-10-11

## Problem Statement

Since v3.1, Scott's Claude can read his trips but can't change anything. Every decision made in conversation ("booked the 9:40 train, conf ABC123", "dinner was €84, Abby paid, split three ways", "move the museum to Thursday", "push the trip a day later") still means opening Waypoint and re-entering it by hand. Scott wants Claude to act as an extension of himself in Waypoint: able to do almost anything he can do in the app, quickly, from the phone, with a clear look at the change before it lands and an easy undo.

## Intent & Success Criteria

Make the connected AI a capable writer of the user's own decisions, bounded by a few clear prohibitions rather than a list of permitted actions.

Observable outcomes:

- From the Claude app, a member can make any change the app would let them make (items, phases, trip dates, scenarios, closeout statuses, budget, expenses with custom splits, votes they state, tasks, goals, codes, links, text docs, memory thoughts), except the can't-list.
- Before anything is written, the member sees a preview card showing old → new, their own words, the real outcome, and every cascade (e.g. "Day 9 removed; 2 ideas move to Lisbon").
- Nothing is written without a yes in chat or a tap on the card's Confirm.
- A change confirmed on a stale preview is refused, not applied.
- Any AI change can be undone from chat or from Recent AI changes in account settings.
- A traveler's AI behaves exactly like the traveler in the app: item adds go through Suggestions (auto-approved or queued per Auto-approve); item edits, which the app reserves for owners/co-owners, are refused with the reason.
- Other members see the change as the member's own; nothing says "via Claude".
- An owner can turn AI changes off per trip; Scott can turn all AI writes off server-wide.
- Members/invitations, AI settings, emails and tokens are never writable through the connector.

## User Stories

1. As a member, I want to tell Claude a decision in my own words and have it recorded in Waypoint, so that I don't re-enter it in the app.
2. As a member, I want to see a Waypoint-style preview of exactly what will change before it's written, so that I can catch mistakes.
3. As a member, I want changed fields shown old → new, so that I see the difference at a glance.
4. As a member, I want my own words shown on the preview, so that I can tell Claude understood what I said.
5. As a member, I want to confirm by saying yes in chat, so that confirming is as fast as asking.
6. As a member, I want a Confirm button on the preview card, so that I can confirm with one tap instead.
7. As a member, I want the preview to say the real outcome (saved, sent to the owners as a suggestion, added as an idea), so that my yes is informed.
8. As a member, I want changing the trip's dates or a phase to show every cascade (days removed or added, items moved to another phase) before I confirm, so that I understand the knock-on effects.
9. As a member, I want date changes shown as a small calendar where that's clearer, so that the change is easy to read.
10. As a member, I want times shown as "9:40 am", so that previews read like the app.
11. As a member, I want to add, edit, plan, move and mark booked any item I could in the app, so that the itinerary stays current from chat.
12. As a member, I want to add confirmation codes, links and text docs, so that booking details land where the group looks.
13. As a member, I want to record expenses with any split the app allows, including custom splits, so that money is right without the app.
14. As a member, I want to set and edit budgets, so that planning money happens in conversation too.
15. As a member, I want Claude to record a vote I state ("I'd love the cooking class"), so that my preference counts; Claude never votes on its own.
16. As an owner, I want to create and edit phases and change the trip's dates through Claude, with the same tiling rules the app enforces, so that restructuring is as easy as asking.
17. As a member of a dateless trip, I want to create and edit scenarios through Claude, so that ideation can happen in chat.
18. As a member, I want to walk through closeout (marking items done or considered) through Claude, so that the end-of-trip review is conversational.
19. As a member, I want to add tasks, check them off, add goals, day notes and memory thoughts, so that the small stuff is captured on the go.
20. As a traveler, I want my AI to follow my role exactly as the app does (my item adds become Suggestions; an item edit I couldn't make in the app is refused with the reason, and Claude may offer to leave a comment instead), so that owners keep their say.
21. As a traveler on a trip with Auto-approve off, I want my AI adds to go to review like my app adds, so that the rules don't change because I used Claude.
22. As a viewer, I want Claude to be unable to change anything I couldn't change in the app, so that my role means the same thing everywhere.
23. As a member, I want a proposal I confirm after someone else has changed the same fields to be refused and re-proposed, so that I never commit something I didn't see.
24. As a member, I want a multi-change proposal to apply all-or-nothing, so that a trip is never left half-changed.
25. As a member, I want to say "undo that" in chat and have my last AI change reverted, so that a mistake is one sentence to fix.
26. As a member, I want a Recent AI changes list (last 30 days) in Account → Connected apps, collapsed by default, so that I can review and revert without it dominating the page.
27. As a member, I want revert to leave alone any field someone else has changed since and tell me what it couldn't restore, so that undo never clobbers others' work.
28. As a member, I want reverting something Claude created to remove it, so that undo of an add is clean.
29. As a member, I want my AI changes private to me and shown to the trip as plain changes by me, so that using Claude isn't a separate identity.
30. As an owner, I want separate trip settings for "AI can read this trip" and "AI can make changes", both on by default, so that I can allow reading but not changing.
31. As Scott (operator), I want a server-wide switch that turns all AI writes off and removes the write tools, so that a broken write path can be stopped everywhere at once.
32. As any member, I want Claude unable to touch members or invitations, so that people's names, emails and invites stay out of AI hands.
33. As any member, I want Claude unable to change AI settings, so that it can never widen its own access.
34. As any member, I want Claude unable to delete anything it didn't create, so that the worst mistake is reversible.
35. As a member, I want Claude to know who created what (by name), so that it can answer and act sensibly, without being able to change authorship.
36. As a member, I want Claude to be able to ask Waypoint what it can change, so that it doesn't guess at fields.
37. As a member, I want my other members notified of my AI changes exactly as if I'd made them in the app, so that the group stays informed the same way.

## Decisions

- **Posture: anything the user can do, minus a can't-list** (ADR-0025 §1, amends ADR-0024 §3). The can't-list:
  - members and invitations
  - AI settings
  - emails, tokens (soft, join, share)
  - `created_by`/owner fields (readable as names, not writable)
  - deleting anything not AI-created
  - file/photo upload (deferred)
- **Votes:** the AI records a vote the user states and never chooses one (amends ADR-0024 §3's "no AI votes").
- **Generic record ops** (ADR-0025 §2): `create`/`update` on any collection not on the can't-list, run with the user's short-lived PB token. PB rules plus #411 hooks are the gate, the same one the app uses. The server adds only the blocklist and the app's Suggestion routing. Rejected: one typed op per action.
- **Tools:**
  - `describe`: what's writable, in plain terms.
  - `propose_changes`: ops plus the user's words; returns preview and proposal id.
  - `commit_changes(proposal_id)`.
  - `revert_change`.
- **Proposals:** held server-side for 15 minutes. Each stores the before-values of the fields it touches. Commit is refused if any has changed (the AI re-proposes). At most 50 ops per proposal. Commit is all-or-nothing in one PB batch transaction.
- **Confirmation** (amends ADR-0024 §4): the user's yes in chat, or a Confirm button on the MCP Apps card that calls commit. No server-side proof of a human turn. Tool descriptions tell the AI to wait for the yes; Revert is the backstop.
- **Preview:** one card format.
  - Changed fields old → new, the user's words, and the outcome line: "Saved", "Sent to the owners as a suggestion", or "Added as an idea", computed at propose time.
  - Layouts are tuned for the main records: items, expenses, phases, trip.
  - The preview may choose a better view where it communicates more, e.g. a small calendar for trip or phase date changes.
- **Cascades:** trip-date and phase changes list every consequence (days removed or added, items and ideas re-homed), computed with the app's own tiling logic, before confirm.
- **Formats:** AI ↔ server use ISO `YYYY-MM-DD` and 24h `HH:MM`, trip-local. Cards show `9:40 am`. Dates outside the trip are refused with a reason, except an explicit trip-date change.
- **Suggestions:** exactly as in the app. A traveler's item add goes through the suggestion endpoint: "Added as an idea" when Auto-approve is on, "Sent to the owners as a suggestion" when off. Item edits are owner/co*owner only in the app (#175), so a traveler's AI edit is refused with that reason; the AI may offer a comment. *(Corrected 2026-10-11 while planning: the grill assumed an edit-suggestion path; the app has none: suggestions are `new_item` | `comment` only.)\_
- **Attribution:** none. Changes are the member's own. Notifications fire as the app's would.
- **AI Change audit** (glossary [[AI Change]]): each commit records the changes (before → after per field) and the user's words. Private to the author. Recent AI changes covers 30 days, lives in Account → Connected apps, and is collapsed by default.
- **Revert:**
  - Available from chat (`revert_change`) or the list.
  - Restores the fields the AI changed and skips any changed since by someone else.
  - Deletes records the AI created.
  - For cascades it is best-effort and reports what it couldn't restore.
  - Only the author can revert.
- **Switches** (ADR-0025 §6, amends ADR-0024 §2):
  - [[AI Access]] splits into "AI can read this trip" and "AI can make changes". Changes need read. Owner/co_owner only, both default on, existing trips included.
  - Server-wide `MCP_WRITES` env in the on-box `waypoint.env`. Off means the write tools aren't listed; flipping it means a container restart.
- **Closeout:** no wizard over the connector; it's item-status edits.
- **Also in v3.2:**
  - #411 (merged into release/3.2)
  - #512 (v3.1 hardening minors: refresh-rotation race, token sweep, get_trip 50-card cap, resource binding, e2e gaps)
  - #515 (timestamps harness red)
- **#413:** deferred. The import format can reuse the op shape later.
- **Order:** Scott dogfoods v3.1 reads in parallel with the build. Generic ops remove dogfooding as a gate on the plan.

## Testing Decisions

- **Highest seam: the MCP endpoint.** Playwright specs against `/mcp` on the isolated PB, as `tests/e2e/mcp-oauth.spec.ts` and the v3.1 MCP specs do. Cover:
  - propose → commit → record changed
  - stale proposal refused
  - traveler → Suggestion
  - viewer refused
  - can't-list refused (members, AI settings, emails, tokens, created_by, delete of a non-AI record)
  - batch all-or-nothing
  - revert, including a field changed since
  - `MCP_WRITES=off` hides the write tools
  - "AI can make changes" off refuses
- **Vitest for the pure parts** (prior art `src/lib/server/mcp/tools/what-changed.test.ts`, `src/lib/itinerary/*.test.ts`):
  - blocklist decision
  - outcome computation (Saved / Suggestion / Idea)
  - staleness check
  - inverse-op construction for revert
  - cascade preview from the tiling functions
  - time formatting
- **Backend harnesses** (`scripts/backend-harnesses.sh`): the PB rules and hooks remain the gate. Any new collection or field (audit, AI-changes switch) gets rule coverage in `test-rules.mjs`. Hidden fields stay hidden (prior art `test-secrets.mjs`).
- **Test behaviour, not op internals.** Assert on what the trip looks like and what the response says, not on how ops are dispatched.
- **Visual:** a 375px screenshot of Recent AI changes in account settings and of the trip AI settings, via `pnpm verify:visual`. Card layouts for item, expense, phase and trip are checked on Scott's iPhone in the Claude app (MCP Apps rendering can't be screenshotted locally).

## Out of Scope

- Members and invitations: any read of emails, any write.
- Changing AI settings through the AI.
- Deleting anything the AI didn't create.
- File and photo upload (documents with files, memory photos, avatars).
- #413 partial import, templates and JSON Schema.
- Any "via Claude" attribution visible to other members.
- A server check that a human turn happened between propose and commit.
- The ADR-0020 domain cutover.

## Assumptions & Open Questions

- **Assumption (spike in the plan):** the claude.ai MCP Apps view can call a server tool (Confirm → `commit_changes`) on iPhone. If not, the button is dropped and chat yes is the only path.
- **Assumption (spike in the plan):** the view can render a small calendar inside the card. Fallback is a text "Mon 3 → Tue 4" range.
- **Assumption:** the #411 hooks cover every invariant the app enforces for writable collections. The plan audits writable collections for any rule still enforced only in SvelteKit form actions (e.g. scenario, closeout or budget logic) and moves it into PB or the op layer before exposing it.
- **Assumption:** cascade preview can be computed from the same pure tiling functions the trips/phases hooks mirror. Divergence between preview and hook is a bug the e2e catches.
- **Before deploy:** dry-run prod for duplicate phase `start_date` (#411 review M2).
- **Open, not blocking:** whether "AI can make changes" should appear for viewers' trips at all (it's moot, since viewers can't write); UI copy is decided in the plan.
