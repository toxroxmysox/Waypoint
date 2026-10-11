# Invariant audit for AI writes (#503, plan Task 4)

ADR-0025 lets a connected AI write any collection not on the can't-list with the user's own PB token. A rule that only a SvelteKit form action enforces is therefore an AI hole. #411 already moved items, phases, trips (tiling, cascades), expenses, settlements, checklists/tasks, votes and suggestions into PB. This audit covers the rest and classifies every collection.

Method: for each collection, the SvelteKit write paths (`grep collection('<c>').create|update` under `src/routes` and `src/lib`) were read for `fail(...)` checks and server-set fields, then compared with the collection's PB rules (dumped from a fresh PB) and its `pb_hooks/*.pb.js`.

Verdicts: **hook** = moved into PB with a `test-rules.mjs` cell; **registry** = kept in `src/lib/server/mcp/writes/registry.ts` (`validate`, `stamp`, `blockedFields`); **block** = not writable through the connector; **covered** = PB already enforces it.

## Findings

| Collection | App-only rule found | Verdict |
|---|---|---|
| trips | `start ≤ end` (settings, availability promote) | **hook**: `trips.pb.js` create + update refuse an end before the start (`trip_dates_reversed_*`) |
| trips | timezone must be a real IANA zone (settings) | **registry** `validate`. goja has no `Intl`; an invalid zone falls back to UTC at read time anyway |
| trips | `slug`, `last_digest_at`, `digest_state` server-managed | **registry** `blockedFields` |
| trips | create (new/clone/import flows) | **registry** `updateOnly`: the connector edits a trip, never makes one |
| money_units | `created_by` = caller; members offered from this trip only (groups form) | **hook**: `money_units.pb.js` create pins `created_by` to the caller's membership and refuses another trip's member (`money_unit_*`) |
| money_units | budget positive | **registry** `validate` |
| scenarios | create only while the trip is dateless; dates both-or-neither and ordered; budget positive (scenarios/new) | **registry** `validate`. Not a hook: the rules matrix creates scenarios on its dated fixture, and a stray scenario on a dated trip is invisible, not corrupting. Promote (`/api/scenarios/promote`) re-checks dates itself |
| scenarios | `status` changes only through promote | **registry** `blockedFields: ['status']` |
| scenarios | champion = caller | covered (create rule `champion.user = @request.auth.id`); also **registry** `stamp` |
| scenario_votes / scenario_points | viewer denied; value/kind enums; text ≤ 200 | covered (rules + schema) |
| availability | poll closed once the trip has dates | **registry** `validate`. Writing it on a dated trip is harmless (nothing reads it) |
| availability | member = caller | covered (rule `member.user = @request.auth.id`) |
| decisions | written only by promote | **block** |
| trip_budgets | categories shape, owner/co_owner only | covered (`budgets.pb.js`) |
| tasks / checklists / checklist_items | viewer denied | covered (#283 hooks) |
| checklists | `kind` (booking lists are app-made) | **registry** `blockedFields` |
| trip_goals / goal_votes | viewer denied, own vote, not on own goal | covered (rules + `trip_goals.pb.js`) |
| memories | author = caller, viewer denied, day in trip, one per (day, author), photo or thought | covered (rules + `memories.pb.js`); photo is a blocked field |
| documents | viewer denied, uploader pinned, item in trip, code needs `code_value` | covered (`documents.pb.js`); file upload deferred → **registry** `validate` (code only), `createOnly` (update rule null) |
| days | notes only for travelers; dates from the trip | covered (#411 `days.pb.js`); **registry** `updateOnly` |
| closeout | marks item `status` done/considered; trip `archived` | covered: item edits (#175 owner/co_owner) and the trips protected-field gate |
| suggestions | create/update rules null; only the app's routes | **block**; a traveler's item add routes through `/api/suggestions/create` (`viaSuggestion`) |
| suggestion_votes | viewer denied, not own suggestion | covered (rule) |
| votes | own vote, item in trip | covered (`votes.pb.js`) |
| items, phases, expenses, settlements | — | covered (#411, #175) |

## Blocked collections (can't-list + server-only)

`trip_members`, `pending_invites`, `join_tokens`, `users` (people data, ADR-0025 §1); `mcp_connections`, `mcp_tokens`, `ai_changes`, `notifications` (server-only); `vault_entries` (retired 0031); `suggestions`, `decisions` (app routes only).

## Author fields

`created_by`, `uploaded_by`, `author`, `champion`, `member` are blocked for the AI and filled by the write layer (`stamp`) on create. Hooks pin most of them anyway (expenses, documents, money_units).

## Hook moves: 2 (under the plan's ~6 scope check)

## Corrections after the final review (2026-10-11)

- **Field modifiers.** PB accepts `field+` / `+field` / `field-` on relation, select, number and file fields. The can't-list compared exact names, so `created_by+` or `trip+` slipped past it (reproduced over REST). The write layer now accepts only each collection's real field names (`WritableSpec.fields` is the allowlist, plus the day field and `trip`).
- **Cross-trip links.** Several relation fields have no PB hook checking that their target is in the record's trip: `trip_goals.items`, `scenarios.keystones`/`fork_of`, `tasks.assignee`, `checklist_items.checked_by`, and the member fields on items (`booked_by`, `paid_by`, `assigned_to`). "Covered" above was wrong for these. The write layer now checks every link an op sets (`compile.ts` `LINKS`). The same gap over raw REST predates #503 and is filed separately.
- **Required fields the forms fill.** `checklists.kind`, `scenarios.status`, `trip_goals.manual_status`, and an item's `status`/`phase` are filled by the app's forms. The write layer now fills them the same way.
- **Trip title/dates/timezone** stay member-writable, as PB has them (#280). Scott's call: follow PB defaults.
