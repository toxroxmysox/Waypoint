# MCP connector, v3.1 reads: grill record

Source: [toxroxmysox/Waypoint#412](https://github.com/toxroxmysox/Waypoint/issues/412) → build [toxroxmysox/Waypoint#502](https://github.com/toxroxmysox/Waypoint/issues/502) · Date: 2026-10-10
ADR: [ADR-0024](../../adr/0024-agent-access-posture.md) (amends ADR-0017). Glossary: **AI Access**, **Connection** (`CONTEXT.md`).

## Problem Statement
Looking things up in Waypoint from a phone means tapping through trip → phase → day → item. Questions like "what hotel did we stay at in Lucerne?", "when's our flight tomorrow?", "who owes whom?" or "what's still unbooked?" are faster to ask than to navigate, especially across past trips. Scott and Abby both use the Claude phone app already.

## Intent & Success Criteria
From the Claude app on a phone, with no computer, a member asks about any of their trips (current or historical) and gets a correct answer faster than opening Waypoint. AI reads and transcribes; it never plans.

Success, observable:
- Scott adds the connector once on claude.ai, logs in with his email code, and the connector works from the Claude iPhone app.
- Abby does the same with her own Claude account and sees exactly what her role sees in the app.
- Asked the opening examples (Lucerne hotel, tomorrow's flight, unbooked items, who owes whom), Claude answers correctly from Waypoint data.
- Results read as Waypoint-flavoured cards, not raw JSON or plain lists.
- No email address and no photo ever appears in any tool output.
- An owner switches AI Access off on a trip; Claude then says that trip's AI access is off and reveals nothing inside it.
- Disconnecting in account settings stops the connector working immediately.

## User Stories
1. As a member, I want to add Waypoint as a connector in Claude and log in with my email code, so that Claude can answer questions about my trips.
2. As a member, I want the connector to work from the Claude phone app after adding it once on the web, so that I never need a computer.
3. As a member, I want Claude to act as me with my role, so that it sees what I see and nothing more.
4. As a viewer, I want to read my trips through Claude, so that being a viewer doesn't lock me out of lookups.
5. As a member, I want Claude to list my trips (past and upcoming, with my role), so that I can refer to any of them by name.
6. As a member, I want a trip overview (phases, where we sleep each night, members by name, goals, ideas with vote counts), so that I can ask big-picture questions.
7. As a member, I want any day's timeline in trip-local time, including today and tomorrow and multi-day stays, so that "when's our flight" is one question.
8. As a member, I want to search across all my trips by text and by filters (type, country, date range, status, booked, cost), so that I can find "every restaurant in Lisbon" or "the hotel in Lucerne".
9. As a member, I want search to cover items, item notes, day notes, confirmation codes, expenses and goals, so that historical lookups find what we wrote.
10. As a member, I want search to skip comments, so that results aren't buried in chatter.
11. As a member, I want to open one item in full (notes, comments, codes, who's going, votes, linked expenses), so that I get everything about it, including what others said.
12. As a member, I want balances, who owes whom, spend vs budget and spend by category, computed by Waypoint, so that money answers match the app exactly.
13. As a member, I want a trip audit (nights without lodging, unbooked items, flights missing codes, overlaps, unplaced ideas, open tasks), so that I can ask "what are we missing?".
14. As a member, I want to ask what changed on a trip since a time, so that I can catch up on what others added.
15. As a member, I want my trip's lists and open tasks with assignees, so that I can ask "what's still on the packing list?".
16. As a member, I want the trip's memory thoughts and captions, so that I can ask what we wrote about a day.
17. As a member, I want a one-call trip brief (where we are, what's next, tonight's lodging and address, relevant codes), so that "what's happening" needs no follow-ups.
18. As a member, I want results shown as Waypoint-style cards, so that answers are quick to scan on a phone.
19. As an owner or co-owner, I want an AI Access switch per trip, on by default, so that I can close a trip to connected AI.
20. As a member, I want Claude to tell me plainly when a trip's AI access is off, so that I'm not left thinking the trip is missing.
21. As a member, I want my historical and archived trips readable from day one, so that search across my history works.
22. As a member, I want my Connection listed in account settings with a Disconnect button, so that I can cut off a lost phone or a connector I no longer use.
23. As a member, I want no email address and no photo to reach the AI, so that the most sensitive data stays in the app.

## Decisions
- **Release sequencing:** v3.1 = reads (this record) → v3.2 = writes (+ #411 hardening, #413 decision) → v3.3 = phase planning (#401, #391). Writes start after reads are dogfooded.
- **Surface:** claude.ai custom (remote MCP) connector; syncs to iOS/Android. Host: `/mcp` routes inside the existing Waypoint container. No new stack. (#412)
- **Host:** `app.vandenwarsen.com` for now. The ADR-0020 cutover waits until Abby's trip ends; afterwards each user re-adds the connector.
- **Auth:** Waypoint is a minimal OAuth 2.1 authorization server: CIMD, PKCE S256, login = existing email + 6-digit code, **no consent screen**. Opaque tokens stored hashed. Each tool call runs as the user via a short-lived user-scoped PB token that never leaves the server. Refresh-token rotation. (#412, ADR-0024)
- **Identity and permission:** the AI acts as the user with their role (ADR-0024 §1). Viewers read.
- **AI Access:** one per-trip switch, owner/co_owner only, default on for new and existing trips. Off → the trip appears to the AI as name + dates + "AI access is turned off for this trip by its owner"; no other data. (ADR-0024 §2)
- **Tools (v3.1, all read-only):** `list_trips`, `get_trip`, `get_day`, `search`, `get_item`, `get_money`, `audit_trip`, `what_changed`, `get_lists`, `get_memories`, `trip_brief`. A few broad tools rather than one per use case. `trip_brief` composes the same server logic as the others; no separate logic.
- **Search scope:** items, item notes, day notes, codes, expenses, goals; across trips; text plus filters. No comments. Comments appear only in `get_item`.
- **Memories:** text and captions only, all members' (they're visible to all members in the app). Photos never.
- **Never sent to the model:** emails (all layers from #412: field allowlists, no tool touches users/invites/membership/auth, email-shape scrub on every outbound string, test seeding addresses everywhere) and photos of any kind. (ADR-0024 §5)
- **Server-computed answers:** money balances, audit gaps and trip-local times are computed by Waypoint's existing modules, not left to the model.
- **Presentation:** results render as Waypoint-style cards via MCP Apps if the Claude iPhone app renders them; otherwise as formatted text cards (type emoji, bold title, time/place lines). Card-like, not an exact replica.
- **Connections UI:** "Connected apps" section in account settings: list of the user's connections, Disconnect each (revokes tokens immediately).
- **Instructions:** the MCP server's `instructions` field and tool descriptions carry the posture (answer from Waypoint data; never plan the trip), so every user gets them without setup.
- **Spike first:** on Scott's Mac dev copy behind a temporary `cloudflared` URL, live app untouched. Must prove: email-code login in Claude's in-app browser on iPhone; the token endpoint vs SvelteKit's CSRF origin check; Cloudflare bot protection not blocking; refresh; whether MCP Apps cards render on iPhone. **If phone login fails: stop and rethink with Scott**, no automatic fallback.

## Testing Decisions
- Highest seam: the MCP tool layer. Call each tool as a seeded user against a disposable PB (`pnpm test:e2e:clean` / `scripts/e2e-clean-pb.sh` pattern) and assert on output, not internals.
- Email/photo isolation test: seed email-shaped strings into every text field and a photo everywhere one fits; assert zero addresses and zero photo URLs across every tool's output.
- Role tests: viewer reads; non-member gets nothing; AI Access off returns only name + dates + notice.
- OAuth flow: one Playwright/HTTP test for the authorize → code → token → refresh → revoke path, including the form-urlencoded token request with no Origin header.
- Reuse existing Vitest-covered domain modules (money, now-state, trip-time) rather than re-testing them; test that tools return their results.
- The phone itself is verified by hand in the spike and at release (Scott + Abby).

## Out of Scope
- Any write (v3.2): propose/commit, previews of changes, audit log, Revert, kill switch, #411, #413.
- Phase planning (v3.3).
- The ADR-0020 cutover.
- Photos to the model; comments in search.
- Scheduled/automatic briefs or AI digests (#414).
- Delete, invite, publish, closeout tools (never in v1).
- Splitting MCP into its own stack.

## Assumptions & Open Questions
- **Assumed:** the Claude iPhone app supports custom remote connectors added on the web and completes OAuth in its in-app browser. The spike verifies.
- **Open (spike answers):** whether the iPhone app renders MCP Apps UI; whether Cloudflare's bot/AI settings need an exception for Anthropic's egress range on `/mcp` and `/oauth/token`.
- **Open (v3.2 grill):** write-op vocabulary vs #413's importer; where Recent AI changes → Revert lives; kill-switch shape.
