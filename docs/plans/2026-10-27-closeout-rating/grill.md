# Closeout Rating: grill record

Source: https://github.com/toxroxmysox/Waypoint/issues/576 · Date: 2026-10-27

## Problem Statement

After the Africa trip, Abby wanted to say more about each activity than "we did this." Closeout records only whether something happened, never whether it was worth doing, so the group can't look back on what they thought, and the Public Archive (whose job is recommendations) can't tell a highlight from a dud. Worse, closeout's **Skip** leaves an item `planned`, and **Finish** turns every still-planned item into `done`: a skipped activity is recorded as done.

## Intent & Success Criteria

For the group and for others: to know what we thought of each activity, and to share our point of view with anyone reading the record.

- In the closeout walk, each planned activity is resolved with one of **Recommend / Don't recommend / Didn't do**.
- An activity marked Didn't do never appears as done in the Record or Public Archive.
- The closed trip's Record and the Public Archive show 👍 / 👎 on rated done activities.
- An already-closed trip (Africa) can be rated without reopening it.
- Claude can read ratings and set them through the existing propose → confirm path.

## User Stories

1. As a traveler doing closeout, I want to mark an activity Recommend, so that the record says it was worth doing.
2. As a traveler doing closeout, I want to mark an activity Don't recommend, so that the record says we did it and wouldn't again.
3. As a traveler doing closeout, I want to mark an activity Didn't do, so that it is not recorded as done.
4. As a traveler who did something else instead, I want Didn't do to offer "did something else instead? + add", so that the replacement is recorded as done.
5. As a traveler, I want to rate a replacement or spontaneously added activity, so that everything we did can carry our verdict.
6. As a traveler, I want to rate multi-day stays (lodging, rentals) and transport, so that "recommend this hotel" is captured.
7. As an Organizer, I want the same rating controls as travelers, so that anyone who traveled can record the verdict.
8. As a viewer, I see no rating controls, so that only people who went decide the verdict.
9. As a member of an already-closed trip, I want a "Rate activities" walk from the closed trip, so that I can rate Africa (and change a rating later) without reopening the trip.
10. As a member in the rating walk, I want each done activity listed with its current rating selected, so that I can review and change it.
11. As a member, I want a later rating to replace the earlier one, so that the item carries one group verdict.
12. As a reader of the closed trip's Record, I want 👍 / 👎 on rated done activities, so that I know what the group thought.
13. As a stranger reading the Public Archive, I want the same 👍 / 👎, so that I can use the group's recommendations.
14. As a reader, I see nothing on an unrated activity, so that "no opinion yet" isn't mistaken for a verdict.
15. As a user of Claude, I want trip and day reads to include each item's rating, so that Claude can answer "what did we recommend in Cape Town?"
16. As a user of Claude, I want to say "mark the safari as recommended" and confirm the preview, so that I can rate by conversation, on a closed trip too.
17. As a traveler finishing closeout with activities left unmarked, I want them recorded as done and unrated, as today, so that nothing silently disappears.

## Decisions

- **Term: Rating** (glossary, `CONTEXT.md`). Values Recommend / Don't recommend, or not rated. "Didn't do" is not a rating; it is Item Status `considered`.
- **One rating per item, not per member; last save wins.** Keep it simple: the rating is the group's verdict. No per-member collection, no tallies.
- **Rating lives on the item** as an optional field: recommend | not_recommend | empty. No new collection.
- **Only `done` items carry a rating.** Any status change away from `done` clears it, and returning to `done` leaves it unrated. Enforced server-side (PB hook), so app, MCP and any later path obey it.
- **No middle option** ("it was fine"): two values plus not rated.
- **Closeout row = Recommend · Don't recommend · Didn't do**, replacing Done / Swap / Skip. Recommend / Don't recommend → `done` + rating. Didn't do → `considered` (kills the Skip-becomes-done bug). Swap moves inside Didn't do as "Did something else instead? + Add"; the replacement is added `done` and is itself rateable.
- **Finish still resolves leftover planned items to `done`, unrated** (the #240 done-leak guard is unchanged).
- **Every done item is rateable**, any type, including planned, replacements, spontaneous adds, multi-day stays and transport. Considered ideas are not.
- **Who:** owner, co-owner, traveler. Not viewers. Matches who may walk closeout.
- **Where set: closeout only.** Not mid-trip (Today, day pages). On a closed trip, a **rating walk** reached by a "Rate activities" link (travelers and Organizers only) lists every done activity with its current rating selected. The Record view itself stays read-only.
- **Where shown:** the closed trip's Record and the Public Archive mark rated done rows 👍 / 👎; unrated shows nothing; Didn't do items appear under "what we considered" like swapped-out items today. No aggregate counts.
- **Claude:** ratings included in trip/day reads; writes go through the existing generic item update (propose → commit), closed trips included.
- **No reason/comment field.** The item's existing notes cover it.
- **No backfill.** Existing done items are unrated.
- No ADR: a field on items with a status invariant is easy to reverse.

## Testing Decisions

- **Unit (Vitest):** the pure mapping from a closeout outcome to status + rating, and the archive/record view's rating output. Prior art: `archive-view.test.ts`, `lodging-nights` tests.
- **PB hook harness:** the invariant at the data seam: setting a rating on a non-done item is refused or cleared, and a status change away from `done` clears the rating, whatever the client.
- **E2E (Playwright, `test:e2e:clean`):** closeout walk Recommend → Record shows 👍; Didn't do → finishing leaves it out of done (regression for the Skip bug); rating walk on a closed trip changes a rating; viewer sees no rating controls. Seed via API, `networkidle` before clicking.
- **MCP:** rating appears in `get_trip`/`get_day` output; a propose/commit sets it.
- Renamed closeout labels (Done/Swap/Skip): grep `tests/` and fix assertions in the same commit.

## Out of Scope

- Per-member ratings, tallies ("2 of 3 recommend"), disagreement display.
- A neutral/middle value.
- Rating mid-trip (Today, Now, day pages) or from the Record view directly.
- A rating reason field.
- Rating considered ideas / the owner curation step.
- Backfilling ratings for existing done items.

## Assumptions & Open Questions

- **Assumed:** the rating walk on a closed trip changes ratings only (Recommend / Don't recommend, tap again to clear). It does not offer Didn't do or Add, so a closed trip's done/considered sets don't change there. Flagged for Scott's skim.
- **Assumed:** Q13 (no backfill; leaving `done` clears the rating) accepted without objection.
- **Assumed:** a rating on the Public Archive carries no name (it is per item, so there is none to show).
