# PRD — Item Assignment: Assignee Avatars on Cards, One-Tap Self-Assign, and a Flights Lineup

> Owner: Scott Vanden Warsen
> Created: 2026-06-13 (from the #116 audit; grilled 2026-06-13; charter scenario 14; finding WP-A-017)
> Status: Approved (design grilled + modules/testing confirmed 2026-06-13)
> Glossary: [[Item]], [[Trip Member]], [[Role]], [[Avatar]], [[Vote]], [[Smart List]], and the new **[[Assignment]]** term in CONTEXT.md.
> Records: **ADR-0011** (item-card avatars denote assignees, not voters — reverses CARD_CONTENT_SPEC) + the **CARD_CONTENT_SPEC** reversal (decision #5, the timeline reactor-avatars row, the parking-lot card line) + CONTEXT.md (**Assignment** term, broadened **Smart List**, annotated **Vote**).
> Relationship: rides the **#175** role-matrix tightening (viewer = read-only); sibling to **#200** (the novice "when is our flight" light-lens — separate). No dependency blockers.

## Problem Statement

A flight is already a first-class [[Item]] — it carries its own departure/arrival times, airports, and timezones (AeroDataBox, via the flight lookup). And every Item already has an `assigned_to` field. But none of that reaches the surfaces where it would matter.

**You can't see who's doing what.** Assignees render only on item *detail*. Open the day view and a card tells you the activity and the time, but not who's on it — and for a flight, not *whose* flight it is. The one place the group's division of labor would be legible at a glance (the timeline) is silent about it. Worse, the card's avatars today mean something else entirely (who upvoted), so "who's doing this" has no home on the card at all.

**You can't easily say "I'm doing this."** Declaring yourself on an item means opening the full edit form and finding the member multi-select — friction no traveler will push through to claim a flight or volunteer for an activity. There is no one-tap "count me in."

**Friends arriving separately can't compare flights.** The normal case for a group trip — people booking their own flights, arriving on different days — has no answer to "add my flight and see how it lines up with everyone else's." Flights scatter across whatever arrival day each falls on; there's no single place to scan them together. The fallback is the group text or a shared spreadsheet (the V1 old stack), on a planning job that sits squarely inside what Waypoint exists to own.

## Solution

Make **[[Assignment]]** a first-class primitive — being assigned to an Item means "I am doing this" — and surface it where the work is read and decided.

- **Cards show who's doing what.** The item card's avatar slot now shows **assignees**, everywhere a card renders — the planning timeline, the trip-mode Today card, and parking-lot cards. One glance down the day answers "who's on this." Votes don't vanish: they move to a compact count pill on the card, with the who-voted-what faces still on item detail. A card still carries exactly **one** avatar meaning — we inverted it from voters to assignees, the signal that matters once a plan is committed.

- **One tap to join.** A visible **"+ Me"** target sits in the card's assignee slot; tap it and your avatar joins, tap again to drop off. No form, no hunting. Travelers can self-assign to any item — even one they didn't create — and it takes effect immediately (it's a note about your own participation, never something an owner has to approve). Assigning *other* people stays in the item form, where deliberate "you're booking the car" assignments belong.

- **A flights lineup.** A trip-wide **Flights [[Smart List]]** — sitting beside the booking Smart List — projects every flight in the trip into one chronological view: route, times, and the avatars of who's on it. Add your flight and it slots into the shared timeline; scan the list and you can see who lands when and who overlaps, without hunting day by day. It's a read-only lens — it *shows* you the lineup; it doesn't try to orchestrate carpools.

## User Stories

1. As a trip member, I want to see on a day-view card who's doing each item, so that I can tell at a glance who's on what without opening detail.
2. As a traveler, I want to tap one control on a flight card to say "this is my flight," so that claiming it is a single gesture, not a trip through the edit form.
3. As a traveler, I want to remove myself from an item just as easily, so that I can undo a changed or accidental assignment.
4. As a traveler, I want to assign myself to an item I didn't create, so that I can opt into an activity someone else added.
5. As a traveler on a review-gated (auto-approve-off) trip, I want self-assigning to take effect immediately, so that declaring my own participation isn't stuck waiting for approval.
6. As a viewer, I do NOT want to assign myself or others, so that read-only access stays read-only.
7. As an owner or co-owner, I want to assign other members to an item from the item form, so that I can divvy up responsibilities deliberately.
8. As a member, I want a flight card to show the avatars of everyone on that flight, so that I can see who's traveling together.
9. As a member arriving separately, I want a single Flights list across the whole trip, so that I can see how my flight lines up with everyone else's without checking each day.
10. As a member, I want the Flights list sorted chronologically with each flight's route and times, so that I can see who lands when.
11. As a member, I want each Flights-list row to show who's on that flight, so that I can spot who I'm arriving near.
12. As a member, I want the Flights list to be read-only, so that it stays a quick reference, not another thing to manage.
13. As a member, I want votes to still be visible on a card as a count, so that I can read interest at a glance even though the avatars now mean assignees.
14. As a member, I want to still see who voted what on item detail, so that relocating vote avatars off the card doesn't lose that information.
15. As a phone user, I want the "+ Me" target and the assignee avatars to work one-handed at 375px, so that I can claim a flight from the back of a taxi.
16. As a member, I want assignee avatars to fall back to initials for placeholder members, so that everyone shows consistently (matching the Avatar rules).
17. As a member, I want double-tapping a card to also toggle my assignment, so that the gesture is a fast accelerator on top of the visible control.
18. As an owner, I want the common "I'm in" case to need no approval ceremony, so that low-friction trips stay frictionless.
19. As a member, I want a flight I add to appear in the Flights list immediately, so that the lineup reflects reality as soon as I enter it.
20. As a member, I want assignee avatars on a card to be the same identity I see everywhere else (members list, comments), so that faces are consistent across the app.
21. As a member of a solo or one-person trip, I want assignment to stay hidden when there's only one member, so that the UI doesn't show pointless self-assignment.
22. As an owner, I want assigning *others* to remain in the deliberate edit flow, so that volunteering a teammate is an intentional act, not an accidental tap.
23. As a member, I want the Flights Smart List to live next to the booking Smart List in Lists, so that I find it where trip-wide lenses already live.

## Implementation Decisions

- **`flights-lineup` is a new pure, deep module — the testable core of the Flights Smart List.** It takes the trip's flight Items plus the member roster (with avatars) and returns an ordered lineup: each row a flight with route (departure→arrival airport/label), departure + arrival date-times, and its resolved assignees. Pure, no I/O; chronological sort (departure, then arrival). Mirrors `booking-projection.ts`. Route/time text comes from the flight Item's **stored** fields (the flight lookup persists airport/time data into the item at capture); the module reads what's stored — it never calls the flight API.
- **`assignment` is a new pure, small module — the self-assign brain.** Two functions: `canSelfAssign(role)` → true for traveler/co_owner/owner, false for viewer; and `toggleAssignee(assignedTo, memberId)` → adds the member if absent, removes if present (idempotent, order-stable, no duplicates). Both I/O-free and unit-tested. The server action and any UI optimism call through these so the rule lives in exactly one place.
- **Self-assign is a thin server action over `items.update`, not a [[Suggestion]].** It loads the caller's membership, guards with `canSelfAssign`, computes the new `assigned_to` with `toggleAssignee`, and writes it. Because it edits an existing Item's `assigned_to` (it does **not** create a Suggestion), it bypasses the [[Auto-approve]]/review gate entirely — immediate on every trip. Self-assign only ever adds or removes the **caller**. Assigning *other* members stays the existing `ItemForm` `assigned_to` multi-select (owner/co-owner/traveler edit path), optionally surfaced via the `AssignMemberSheet` pattern already built for Checklist [[Task]] assignment.
- **Card avatars denote assignees (ADR-0011).** Every item-card surface — the itinerary timeline card, the trip-mode Today card, and the parking-lot card — renders the item's assignee avatars in the slot that previously held reactor (vote) avatars. This reverses **CARD_CONTENT_SPEC decision #5** ("card avatars stay votes-only, never assignees"); "one avatar meaning per card" is preserved, inverted to assignment. Assignee avatars appear only when the trip has **>1 member** (mirrors the existing `assigned_to` capture rule). The freed slot is also the **self-assign control**: when the caller isn't assigned it shows a faint "+ Me" / add affordance; tapping toggles them via the self-assign action; double-tapping the card is an optional accelerator for the same toggle.
- **Votes move to a count pill on cards.** Where reactor-avatar stacks rendered on cards, cards now show a compact vote **icon + count**; the who-voted-what avatar stacks remain on item **detail** (unchanged there). Pure rendering reassignment — the `votes`/`goal_votes` collections and `voting.ts` scoring are untouched (**ADR-0004 stands**). The card pill shows a count, not the (still never-numeric) score.
- **Assignee avatars load via the existing `member-avatar` helper.** Card loaders that don't already carry the roster expand `assigned_to` and apply `withAvatarUrls` (the same helper the Lists/members surfaces use), so assignee faces are the app-wide [[Avatar]] identity, with initials / tombstone fallback per the Avatar rules.
- **Flights Smart List is a new read-only route, `lists/flights`, sibling to `lists/booking`.** Its loader fetches the trip's `type='flight'` Items + roster and feeds `flights-lineup`; an index row appears in the Lists surface next to booking. It is a **lens** — no check-off, no write actions. This generalizes the CONTEXT.md **[[Smart List]]** term from "a checklist whose tasks are projected from items" to "a list whose rows are projected from items — *checkable* (booking) or *read-only* (flights)."
- **No schema changes.** `assigned_to`, the `flight` Item Type, and the flight fields all already exist; this PRD is rendering, one server action, two pure modules, and one read-only route. (`paid_by`/`booked_by` stay dead per CARD_CONTENT_SPEC — untouched.)
- **Docs recorded:** ADR-0011 (the avatar reversal); CONTEXT.md gains **Assignment/Assignee**, broadens **Smart List**, annotates **Vote** (card = count, detail = avatars); CARD_CONTENT_SPEC decision #5 + the timeline reactor-avatars row + the parking-lot card line are marked superseded by ADR-0011.

## Testing Decisions

- Good tests assert **external behavior** — items + roster in, ordered lineup out; role in, can-self-assign boolean out; an `assigned_to` array + member id in, toggled array out — not internal structure. The two pure modules are the high-value targets because they're I/O-free and everything else is glue or rendering over them.
- **Vitest — `flights-lineup`:** chronological ordering across multiple days; route/time projection from a flight Item's stored fields; assignee resolution (avatars attached; placeholder → initials); multi-passenger flights (several assignees on one flight); flights with no assignee yet; non-flight items excluded. Prior art: `booking-projection.test.ts`.
- **Vitest — `assignment`:** `canSelfAssign` for every [[Role]] (traveler/co_owner/owner true; viewer false); `toggleAssignee` adds when absent, removes when present, is idempotent and order-stable, never duplicates. Prior art: `item-fields.test.ts`, the pure trip-mode tests.
- **`test:rules` — self-assign permission:** a traveler can add and remove **themselves** on an Item's `assigned_to`; a viewer cannot; ownership resolves via `item → trip`; non-members denied. Extend the rules matrix (expect the count to grow). Prior art: the existing item-rule and `goal_votes` rule tests.
- **Playwright — one critical path:** an auto-approve-off trip → a traveler taps "+ Me" on a flight card → their avatar appears on the card → the flight shows in the Flights Smart List with their avatar → unassign clears both. Visual-verify the card assignee avatars, the vote count pill, and the Flights Smart List at 375px. Prior art: existing collaboration / trip-mode specs.
- **Not separately unit-tested** (covered by the above or too thin to be worth it): the self-assign server-action glue, card/loader rendering, and the Lists index row — consistent with "don't test trivial CRUD / PB glue."

## Out of Scope

- **A day-level "show only my assigned items" filter.** Explicitly deferred (Scott: "that's not the scope of this topic at the moment"). Assignment data + avatars are the foundation that filter would later read; the filter itself is a follow-up.
- **Automatic flight-overlap / ride-share / carpool detection.** The Flights list is a passive lens; spotting "you and Sarah both land at 4pm" is left to the human reader — no matching logic, no suggestions.
- **Resurrecting `paid_by` / `booked_by`.** They stay dead (CARD_CONTENT_SPEC). "Who's doing this" is `assigned_to`; "who paid" is an [[Expense]] concept.
- **Real-time updates.** An assignee change another member made appears on the next load/refresh — no live subscriptions (per CLAUDE.md).
- **Novice "when is OUR flight" findability** (charter scenario 1) — that's the light item-lens work in **#200**, related but a separate finding/issue.
- **Comments or votes on Flights-list rows** — it's a read-only projection; voting and comments live on the real item / its detail.

## Further Notes

- **Origin:** audit #116, finding **WP-A-017** (P2; charter scenario 14, power persona). The finding's stated premise — "items carry no member association (`paid_by`/`booked_by` are unused ghosts)" — overlooked `assigned_to`, which is live and captured; the grill corrected this, which is why the PRD is an assignment primitive + a projection rather than a schema build. Report: `docs/app-audit/v2/index.html`.
- **The grill's key turn:** card avatars meaning **assignees instead of voters** is the load-bearing, hard-to-reverse decision — it overturns a documented CARD_CONTENT_SPEC choice and changes a core rendering convention across every card surface, which is why it earns **ADR-0011**.
- **Charter D1 (no collaboration hub) is honored** — assignment lives on the item/card and the flights lens lives in Lists; nothing here adds a "who's doing what" hub tab.
- **Relationship to #175 and #200:** rides #175's role-matrix tightening for the viewer exclusion (a viewer must not self-assign); sibling to #200 (the novice flight-findability light-lens) — both touch flights but answer different scenarios (compare-mine-to-others vs find-our-flight).
- **Slicing into issues** (via `to-issues` at milestone promotion): natural tracer-bullet first slice = the card-avatar reversal + vote count pill (a card visibly shows an assignee avatar), then the "+ Me" self-assign affordance + permission, then the Flights Smart List. The two pure modules (`flights-lineup`, `assignment`) are the test-first cores.
- **No PR from this session** — audit dispositioning in the research worktree; Scott controls git.
