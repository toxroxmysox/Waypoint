# Trip App — v1 Specification

> Codename: Waypoint
> Owner: Scott Vanden Warsen
> Last updated: 2026-05-29

---

## 1. Mission

A self-hosted, mobile-first PWA that replaces the Google Doc / Google Sheet / Splitwise / pinned-message stack Scott and Abby use for trip planning, execution, and post-trip sharing. Must be polished enough that non-technical friends will actually contribute, structured enough that nothing gets lost between planning and trip day, and shareable enough that the trip lives on as a public archive afterward.

**Two modes, one view:**
1. **Planning Mode** — collaborative itinerary building. Default mode. 5-tab moss nav (Itinerary, Money, Activity, Vault, More). Available in every lifecycle state.
2. **Trip Mode** — live-trip execution. Phone-first, one-handed, large cards, offline-capable read. 4-tab clay nav (Now, Money, Add, Docs). Available only when the trip's **derived lifecycle** is `active` (there is no stored `status` field — the lifecycle is computed from dates + `archived`; see §Data Model / CONTEXT.md Trip). Default mode for active trips; user can switch to Planning Mode and back. **Now** absorbed Today (#244): it is one weighted whole-day tab with sub-tabs **Today** (default — the weighted view at `/now`) and **Next 3 days** (`/today/upcoming`); `/today` redirects to `/now`. The **Money** tab is the read-only Trip-Mode per-person money glance at `/trips/[slug]/money` (clay chrome via `resolveChromeMode`) — see §Money; merging Now+Today freed its slot (375px can't hold a 5th tab + the centre Add FAB).
3. **Public Archive** — read-only post-trip view of what actually happened. Not a mode — rendered automatically for closed trips and via public share link. Linkable from Scott's website.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | **SvelteKit** (TypeScript) | Lighter than Next, great PWA support, gentler learning curve for first webapp |
| UI | **Tailwind CSS** + custom design tokens | Fast iteration, no CSS-in-JS overhead |
| Component primitives | **Melt UI** or **shadcn-svelte** | Headless, accessible, themeable |
| Backend | **PocketBase** (Go binary, SQLite under the hood) | Auth, DB, file storage, realtime, admin UI in one binary; matches open-source/self-hosted preference |
| Auth | PocketBase email + 6-digit code | No passwords; less friction; sidesteps magic-link device trap |
| Maps / Places | **Google Maps Platform** (Places API New, with session tokens) | Best worldwide coverage; usage well within free tier |
| Flight data | **AeroDataBox** (RapidAPI) | Freemium, sufficient for personal volume |
| Email delivery | **Resend** | Free tier 3000/month; clean API |
| Analytics | **Umami** (self-hosted) | Privacy-first, no cookies, lightweight |
| Reverse proxy + SSL | **Caddy** | Auto Let's Encrypt; trivial config |
| Hosting (production) | **Home server "basecamp"** — self-hosted, public via Cloudflare Tunnel. Infra → `homeserver-stacks/BASECAMP.md`; deploy → `docs/NAS_MIGRATION_RUNBOOK.md` | Open-source, self-hosted, low cost |
| Hosting (preview) | Local dev / isolated PocketBase over Tailscale | — |
| Backups | Nightly cron rsync of PocketBase SQLite to second location (B2/S3 or another box) | Cheap, simple, sufficient |

---

## 3. Dev Environment

### Start servers (two terminals)

**Terminal 1 — PocketBase:**
```bash
./backend/start.sh
```
`start.sh` sources `.env.local` automatically. **Do not use `./backend/pocketbase serve` directly** — it won't pick up `RESEND_API_KEY`, `RESEND_FROM`, or `WAYPOINT_DEV_MODE`.

**Terminal 2 — SvelteKit:**
```bash
pnpm dev
```

### Required `.env.local` keys

```
PUBLIC_PB_URL=http://127.0.0.1:8090
PUBLIC_APP_URL=http://127.0.0.1:5173
WAYPOINT_DEV_MODE=true
E2E_TEST_EMAIL=e2e@waypoint.local
E2E_TEST_EMAILS=rules-owner@e2e.test,rules-coowner@e2e.test,rules-traveler@e2e.test,rules-viewer@e2e.test,rules-nonmember@e2e.test,e2e@waypoint.local
RESEND_API_KEY=<from resend.com dashboard>
RESEND_FROM=<verified sender address>
```

### Verification commands

```bash
pnpm check              # TypeScript + Svelte type check — expect 0 errors
pnpm test:rules         # PB collection rules matrix — expect 240/240
pnpm test:invites       # Invite hook harness — expect 41/41
pnpm test:members       # Members hook harness — expect 31/31
pnpm test:e2e           # Playwright M1 happy path — expect 2/2
```

All test harnesses require PocketBase running via `./backend/start.sh` with `WAYPOINT_DEV_MODE=true` and the test emails whitelisted in `E2E_TEST_EMAILS`.

---

## 4. User Roles & Permissions

| Action | Owner | Co-Owner | Traveler | Viewer | Public (archive link) |
|---|:---:|:---:|:---:|:---:|:---:|
| Create/edit trip metadata | ✓ | ✓ | — | — | — |
| Add/edit/delete items | ✓ | ✓ | suggest only*; edit OWN immediate‡ | — | — |
| Self-assign (toggle own `assigned_to`) | ✓ | ✓ | ✓ (immediate)† | — | — |
| Book / unbook items | ✓ | ✓ | suggest only | — | — |
| Mark done / use closeout wizard (item walk) | ✓ | ✓ | ✓§ | — | — |
| Publish public record (closeout publish step / Publish control) | ✓ | ✓ | — | — | — |
| View Trip Vault | ✓ | ✓ | ✓ (with trip password) | — | — |
| Edit Trip Vault | ✓ | ✓ | — | — | — |
| Add expenses | ✓ | ✓ | ✓ | — | — |
| View expense ledger | ✓ | ✓ | ✓ | — | — |
| Settle up | ✓ | ✓ | ✓ | — | — |
| Submit suggestions | ✓ (auto-approve) | ✓ (auto-approve) | ✓ (queued) | comment only | — |
| Approve suggestions | ✓ | ✓ | — | — | — |
| Comment on items | ✓ | ✓ | ✓ | ✓ | — |
| Vote on items | ✓ | ✓ | ✓ | — | — |
| Invite Travelers / Viewers | ✓ | ✓ | ✓ | — | — |
| Invite Co-Owners | ✓ | ✓ | — | — | — |
| Promote Traveler → Co-Owner | ✓ | ✓ | — | — | — |
| Remove members | ✓ | ✓ | — | — | — |
| View archive (post-trip) | ✓ | ✓ | ✓ | ✓ | ✓ (when `archive_publish_at` reached, #241) |

*Traveler-suggested items can be auto-approved via per-trip setting (default: yes).

†**Self-assign exception (#226, ADR-0011):** the suggest-only gate on item edits has one narrow carve-out — a Traveler (and Co-Owner/Owner) may add or remove **their own** `trip_members.id` in an item's `assigned_to`, even on an item they didn't create, and it takes effect **immediately** (no review queue). Declaring "I'm doing this" is a note about one's own participation, not a plan change an owner must approve. The exception is self-only: it is enforced in `items.pb.js` (the update hook compares old-vs-new `assigned_to` server-side and rejects any change to another member's id or to any other field), and Viewers are excluded. Assigning *other* members stays the deliberate owner/co-owner edit-form path.

‡**Creator-edit exception (#219):** "suggest only" governs contributing to *others'* plans. A Traveler may **edit ALL fields of an item they created** (`created_by` == the caller's own `trip_members.id`) **directly and immediately** — including booking/money fields — with no suggestion queue. Enforced in `items.pb.js` (the update hook allows the write when `created_by` matches the caller's member id) and mirrored in the edit-form UI gate (the Edit affordance and the `…/edit` route both check the same condition, so a Traveler reaches and submits the form for their own item, while another member's item still 403s). **Delete remains owner/co-owner only** — a creator can edit but not delete. Editing items created by *others* stays suggest-only.

§**Closeout opens to travelers (#240, TRIP_WRAPUP_PRD Grill Resolution #13):** the closeout wizard's day-by-day done/considered **item walk** is open to **owner/co-owner/traveler** (anyone who traveled contributes to the record); **viewers** are redirected to the read-only record view, never the wizard. The wizard's loader and `finishCloseout` both gate server-side, and run only when the trip is `wrap-up` or `closed` (lifecycle gate — a planning/active trip can't reach closeout). Travelers walk **planned items only** and never see the unplanned [[Parking Lot]] ideas; their flow ends at "submit review → closed" with **no publish step**. The **publish decision** (the optional final closeout step AND the standalone "Publish record" control) stays **owner/co-owner only**, gated on role alone and enforced server-side (Slice 3).

**Notes:**
- Owner and Co-Owner are functionally identical. Distinction exists only for "who can promote others."
- The original creator is the Owner; they can promote Travelers to Co-Owner. A trip can have any number of Co-Owners.
- Co-Owners cannot remove the original Owner. Owner cannot demote themselves if they are the only Owner.
- Travelers can invite (lowers friction for "tell your friend Jake to join the trip"). They invite as Traveler/Viewer, not as Co-Owner.
- Public archive link is **not live by default** (#241). The owner publishes it **explicitly** — a binary Keep-private (default) / Publish choice with an inline date defaulting to today (today = publish now; a future date schedules), offered as the final closeout step and as a standalone "Publish record" control. The gate is `archive_publish_at`; the legacy `end_date + archive_publish_after_days` auto-publish is retired (derived/legacy field only). Closed-and-private is a normal terminal state.

---

## 5. Data Model

PocketBase collections. Field types use PocketBase notation. All collections include `id`, `created`, `updated` automatically.

### `users`
| Field | Type | Notes |
|---|---|---|
| email | email, unique, required | Login identifier |
| name | text | Display name |
| avatar | file, single | Optional |

### `trips`
| Field | Type | Notes |
|---|---|---|
| slug | text, unique, required | URL identifier (e.g. `italy-2026`) |
| title | text, required | Display title |
| start_date | date, required | Trip start (in trip timezone) |
| end_date | date, required | Trip end |
| timezone | text | IANA tz, e.g. `Europe/Rome` |
| location_summary | text | Free-text "Spain", "Switzerland Alps" |
| countries | json (array of ISO codes) | For filtering, archive metadata |
| cover_image | file | Optional |
| photo_album_url | url | Linkout to Apple/Google Photos |
| archive_enabled | bool | Owner toggle — sharing on/off |
| archive_publish_at | date, nullable (#241) | **The publish gate.** "" = unpublished (default + reopen-pause); a date = the moment the public `/archive/[token]` route opens (today/past = live, future = scheduled). Owner-set at closeout or via the Publish control. |
| archive_show_budget | bool, default off (#241/#243) | Opt-in public budget summary (trip total + rough per-person only; never itemized expenses or who-owes-whom). |
| archive_publish_after_days | int, default 7 | **Derived/legacy (#241).** No longer the gate — import/export/clone-compat only; may seed `archive_publish_at` when an owner picks "wait N days". |
| public_share_token | text, unique | URL-safe random token for public archive |
| vault_password_hash | text | Argon2 hash; null = vault unused |
| auto_approve_suggestions | bool, default true | Per-trip toggle |
| created_by | relation→users | Original Owner |
| archived | bool, default false | Trip is "done", read-only mode |

### `trip_members`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| user | relation→users, nullable | Null = placeholder, not yet a user |
| placeholder_name | text, nullable | Used when user is null |
| placeholder_email | email, nullable | Used for auto-merge when they sign up |
| display_name | text | Nickname for this trip; defaults to user.name or placeholder_name |
| role | enum: owner, co_owner, traveler, viewer | |
| joined_at | datetime | |

**Merge logic:** when a user signs up with email matching a `placeholder_email`, prompt: "Join trip [X] as [placeholder_name]? You can change your display name." On confirm, link `user`, clear placeholder fields.

**Removal (ADR-0008 + ADR-0013):** a `removed_at` timestamp tombstones a removed member so authored records keep their identity ("Bob paid $40"). But a member that **nothing references** — a typo'd placeholder, a vote-only member (votes always drop on removal) — is **hard-deleted** instead of tombstoned: with no record to preserve, the tombstone is pure clutter. So the **Former-members** roster disclosure only ever holds members who left data behind. Any reference (incl. a share in an `expenses.split_data`) → tombstone; reassign is the only escape for money. Forward behavior only — existing tombstones are not retroactively purged.

### `phases`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| name | text, required | "Barcelona", "Granada" |
| location | text | City name |
| country_code | text | ISO 3166-1 alpha-2 |
| start_date | date | The phase boundary — the only field the user sets (ADR-0021) |
| end_date | date | **Derived + maintained:** the next phase's `start_date` (the shared travel day), or the trip's `end_date` for the last phase (ADR-0021) |
| order | int | **Derived** from start order (ADR-0021) — no manual reorder |

Phases **tile** the trip (ADR-0021, #323): they partition it with no gaps, and adjacent phases share only their boundary day (the travel day). A phase is defined by its **start day**; adding one splits the covering segment, deleting one merges into the previous neighbour. A trip always has ≥1 phase (seeded as "Phase 1" spanning the trip, subdivided as you plan). Arbitrary overlap is impossible by construction.

Phase indicators use the active mode's accent color (moss in Planning Mode, clay in Trip Mode), not per-phase colors. See GitHub issue #11.

### `days`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| phase | relation→phases, nullable | Computed from date if null |
| date | date, required | |
| notes | text | Day-level free notes |

Days are auto-generated from trip start/end dates and re-bucketed (multi-relation `day.phases`) whenever phases change. Under tiling (ADR-0021) a day belongs to **exactly one phase, or two on a shared travel day** (a phase boundary).

### `items`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| phase | relation→phases, required | Every item belongs to a phase |
| day | relation→days, nullable | Required when status is planned or done. Optional when unplanned or considered. |
| type | enum: lodging, transportation, flight, activity, meal, note, checklist | |
| subtype | text, nullable | "tour", "guided", "train", etc. — drives icon/color |
| title | text, required | |
| description | text | |
| location_name | text | |
| location_address | text | |
| location_coords | json `{lat, lng}` | |
| google_place_id | text | For re-fetch / deep-link to Maps |
| start_time | datetime, nullable | Anchor time — trip-local. See glossary "Anchor Time." |
| end_time | datetime, nullable | Anchor time — trip-local. See glossary "Anchor Time." |
| end_date | date, nullable | For multi-day items (e.g. hotel stay). Item spans from day.date to end_date and appears at top of each spanned day. |
| start_tz | text, nullable | For flights crossing zones |
| end_tz | text, nullable | |
| status | enum: unplanned, planned, done, considered | Default unplanned. Lifecycle: unplanned → planned → done or considered. |
| booked | bool, default false | Only meaningful for lodging/transportation/flight/activity |
| booked_by | relation→trip_members, nullable | Who made the reservation |
| paid_by | relation→trip_members, nullable | If pre-paid; for budget tracking |
| confirmation_codes | json (array of `{label, value}`) | "Booking ref", "PIN", etc. — supports multiple |
| reservation_url | url | Link to original booking |
| free_cancellation | bool, nullable | Optional metadata |
| cost_estimate_usd | number, nullable | Per-item estimated cost |
| cost_actual_usd | number, nullable | Filled in after booking/spending |
| assigned_to | relation→trip_members, multiple | Subset of members this applies to (room assignments, sub-group activities) |
| sort_order | int | Drag-to-reorder position for untimed items within a day view |
| parent_item | relation→items, nullable | For multi-leg transit (flight with layover) |
| created_by | relation→trip_members | |

**Notes on items:**
- A single-segment flight = one item. A multi-leg flight (DTW→FRA→ZRH) = parent item with 2 child items via `parent_item`. Flight type integrates with AeroDataBox for autofill of airline, departure/arrival airports, times, and timezones.
- A `meal` or `note` cannot be `booked` (UI hides the toggle).
- The parking lot is a filtered view of items where `status = unplanned` within a phase. Not a separate data structure.
- `assigned_to` supports the "sub-group activity" pattern (only Mary/Pat/Laura/Gayle on the Lucerne train).
- A multi-day item (has `end_date`) is "ongoing" during Trip Mode when the current date/time falls within its span. Single-day items with anchor times are ongoing when the current time is between start_time and end_time. Ongoing is a display state, never stored.

### `checklist_items` (for items where `type=checklist`)
| Field | Type | Notes |
|---|---|---|
| item | relation→items, required | The parent checklist item |
| text | text, required | |
| checked_by | relation→trip_members, nullable | Who checked it off |
| checked_at | datetime, nullable | |
| order | int | |

### `suggestions`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| author | relation→trip_members, required | |
| target_type | enum: new_item, comment | |
| target_item | relation→items, nullable | For comments; null for new_item |
| payload | json | Full proposed item structure (for new_item) |
| comment_text | text | For comments |
| status | enum: pending, approved, rejected | |
| reviewed_by | relation→trip_members, nullable | |
| reviewed_at | datetime, nullable | |

**Auto-approval:** if author role is owner or co_owner, OR trip has `auto_approve_suggestions=true` and author is traveler, status auto-set to `approved` and the item is created/comment posted immediately. The suggestion record is still kept for audit/notification purposes.

### `votes`
| Field | Type | Notes |
|---|---|---|
| item | relation→items, required | |
| member | relation→trip_members, required | |
| value | enum: love, like, flexible, dislike, required | Love (+2), Like (+1), Flexible (0), Dislike (-2) — weights used for sort, never displayed |
| created | datetime | |

Unique constraint on (item, member). One vote per member per item. Updating a vote replaces the previous value. UI shows avatar stacks per vote option, not aggregate scores. Unplanned items sort by aggregate vote score as the default ordering.

### `expenses`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| paid_by | relation→trip_members, required | |
| amount_usd | number, required | All amounts USD only |
| description | text, required | |
| date | date, required | |
| category | enum: lodging, transportation, food, activity, other | |
| linked_item | relation→items, nullable | Optional link to itinerary item |
| split_mode | enum: equal, by_share, by_amount, by_percent | |
| split_data | json | Per-mode payload; see below |

**Split data formats:**
- `equal`: `{members: [id1, id2, ...]}` — split evenly among listed members
- `by_share`: `{shares: {id1: 2, id2: 1, ...}}` — proportional shares
- `by_amount`: `{amounts: {id1: 40.00, id2: 35.00, ...}}` — exact amounts (must sum to total)
- `by_percent`: `{percents: {id1: 50, id2: 50}}` — must sum to 100

### `settlements`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| from_member | relation→trip_members, required | |
| to_member | relation→trip_members, required | |
| amount_usd | number, required | |
| date | date, required | |
| note | text | |

A settlement is treated as a reverse-flow expense for balance calculation.

### `vault_entries` — **RETIRED (M7, 2026-06-07)**

> Removed entirely and replaced by the `documents` collection. See `docs/V4_DOCUMENTS_PRD.md` and
> ADR-0005. Schema below kept for historical reference only; do not build against it.

| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| label | text, required | "Rental car confirmation", "Passport — Scott" |
| value_encrypted | text, required | AES-GCM encrypted with trip-password-derived key |
| category | enum: contact, document, reservation, reference, other | |
| order | int | |

Vault items are decrypted client-side after user enters trip password. Server never sees plaintext.

### `notifications`
| Field | Type | Notes |
|---|---|---|
| user | relation→users, required | |
| trip | relation→trips, required | |
| type | text | "suggestion_added", "comment_added", "item_booked", etc. |
| payload | json | Type-specific |
| read_at | datetime, nullable | |

In-app only for v1. Display: bell icon with unread count, dropdown list. No email/push.

### `pending_invites`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| email | email, required | |
| role | enum: co_owner, traveler, viewer | |
| invited_by | relation→trip_members, required | |
| code | text, unique | URL token for accept link |
| expires_at | datetime | |

---

## 6. Item Types & Status Model

### Item types
| Type | Bookable? | Time-anchored? | Examples |
|---|:---:|:---:|---|
| lodging | ✓ | sometimes (check-in time) | Hotel, Airbnb, chalet |
| transportation | ✓ | usually | Train, bus, car rental, rideshare |
| flight | ✓ | usually | Air travel — AeroDataBox integration for autofill of airline, airports, times, timezones |
| activity | ✓ | sometimes | Tour, museum, hike, ski day, cooking class |
| meal | — | sometimes (reservations) | Breakfast, lunch, dinner, drinks |
| note | — | — | Free-text reminders, day notes |
| checklist | — | — | Grocery list, packing list, to-book list |

### Subtype tags (color/icon hints)
- transportation: `train | bus | car_rental | rideshare | walk`
- activity: `tour | museum | outdoor | sport | shopping | spa | nightlife | sightseeing`
- meal: `breakfast | brunch | lunch | dinner | drinks | snack | coffee`
- lodging: `hotel | airbnb | hostel | resort | chalet`

### Status model
- `status: unplanned | planned | done | considered`
  - **unplanned** — on the trip as an idea/option. Phase required, day optional. Colloquially "ideas."
  - **planned** — committed to the itinerary. Phase and day required.
  - **done** — closeout: we did it. Day required.
  - **considered** — closeout: we didn't do it (covers both skipped-planned and never-planned items). Day optional.
- `booked: true | false` (independent boolean for bookable types)

### Sort order

**Today view — two zones:**

1. **Planned timeline (top):** Items with `status = planned` for the current day, arranged chronologically morning → evening. Anchored items (with start_time) are pinned to their position on the timeline. Untimed planned items fill remaining space within their time slot evenly. Sort within untimed planned items: `sort_order` (manual drag-reorder).

2. **Parking lot (bottom):** Items with `status = unplanned` for the current day's phase. Sorted by aggregate vote score descending, then `sort_order` as tiebreak.

**Time Slot headers** (Morning / Afternoon / Evening / Anytime) are soft display groupings derived from anchor times, never stored. Items without anchor times appear in "Anytime."

**Derived views:**
- "To-book list" = items where `booked = false` AND `status = planned` AND type ∈ {lodging, transportation, flight, activity}
- "Today" view = see sort order above
- "Parking lot" = items where `status = unplanned` within a phase. A filtered view, not a separate data structure.
- Archive view = items where `status = done`, plus `status = considered` items shown as "what we considered"

---

## 7. Feature Milestones

Each milestone is **independently shippable**. Do not start Mn+1 until Mn has been used on a real (or fake) trip and you've tightened any pain points.

> **Note:** Milestone descriptions below are a historical build log. Some domain language (slots, rank, alternates, parking_lot_scope) was superseded by the v3 design alignment (2026-05-29). For current data model and terminology, see Sections 5–6 above and CONTEXT.md.

### M1 — Skeleton (target: by May 1)
**Goal:** Manually enter a trip and view it on your phone. No collaboration, no money, no offline.

**Features:**
- Email + 6-digit code auth
- Create / edit / delete trip
- Trip metadata: title, dates, timezone, location, countries, cover image
- Phases CRUD with reorder
- Days auto-generated from date range, re-bucketed when phases change
- Items CRUD: all 6 types, all fields except expenses-related and vault-related
- Slot-based planning view (morning/afternoon/evening/anytime)
- Day detail view
- Phase detail view (list of days)
- Trip detail view (list of phases)
- PWA manifest + basic service worker (cache shell)
- Mobile-first responsive layout
- Confirmation codes as multi-value field
- "Booked by" / "Paid by" fields on bookable items
- Multi-leg transit via parent_item
- assigned_to for sub-group items

**Acceptance:**
- Scott can recreate the Spain trip in the App in under 60 minutes
- Can be used on iPhone Safari and Android Chrome with no horizontal scroll
- Basic accessibility: keyboard nav, alt text, semantic HTML
- All forms validate before submit

**Dogfood:** China work trip, May 15 (runs on the M1.5 re-skinned build).

---

### M1.5 — Design System (target: by May 10, before China dogfood)
**Goal:** Replace ad-hoc slate Tailwind styling with the Waypoint design system from the Claude Design handoff. Zero product surface change; zero feature regression. The China dogfood runs on this re-skinned build.

**Features:**
- Design tokens in Tailwind v4 `@theme`: paper, surface, surface-2, ink, ink-soft, ink-muted, line, moss, moss-soft, moss-tint, clay, gold, sky; radii sm/md/lg/xl; card shadow; 8pt spacing scale
- Google Fonts: Fraunces (display), Inter (UI), JetBrains Mono (codes / times / money)
- Primitive components in `src/lib/components/ui/`: `Pill`, `Card`, `Button`, `SectionH`, `TypeIcon`, `Avatar`, `NavBar`, `FAB`
- `<NavBar>` context-aware per route (title, subtitle, back, right) — back is historical (`history.back`) with a logical, mode-aware fallback on cold-load — see ADR-0012
- Trip subtitle renders `location_summary` in Fraunces italic (handoff-style tagline; carries through to the archive view in M5)
- Phase color picker locked to the accent palette (moss, clay, gold, sky); storage stays hex text
- Empty trip starter actions: only what M1 supports (Add a phase, Add a day item)
- Re-skin all M1 routes: trips list, trip overview, phase detail, day detail, item detail, item form, login
- `app.html` theme-color and apple-touch-icon refreshed to the paper/ink palette

**Out of scope (deferred to future milestones — add when the underlying feature lands):**
- `<BottomNav>` — keep top `<NavBar>` until M4 introduces a second top-level surface (Trip Mode "Today" home)
- `<AvatarStack>` rendering of multiple members — only the single-user case is exercised pre-M2
- Empty-trip CTA: "Invite a member" → M2; "Add an expense" → M3; "Open vault" → M4
- Trip Mode state machine, NOW divider, clay accent swap — M4
- Pill variants for `pending` / `to_book` — M3 (paired with tri-state booking pill backlog item)
- Decisions screen, suggestions inbox UI, parking-lot drawer — respective milestones
- Feature-flag infrastructure — introduced when the first flag is actually needed

**Acceptance:**
- All M1 acceptance criteria still pass
- `pnpm check` clean, `pnpm test:e2e` 2/2 green
- No horizontal scroll at 375px on any M1 route
- All form controls remain ≥16px font-size on mobile (iOS auto-zoom guard)
- Manual sanity pass on iPhone Safari
- Existing test phase color values updated to palette values (one-time data fix, not a migration)

**Dogfood:** Carried by the M1 China trip — same trip, re-skinned build.

---

### M2 — Collaboration (target: by June 15)
**Goal:** Abby and friends can plan with you.

**Features:**
- Invite Travelers / Viewers / Co-Owners by email (creates `pending_invites`)
- Invite acceptance flow (email → magic code → join)
- Placeholder member creation (add by name, no email)
- Auto-merge when placeholder email matches a sign-up
- Suggestions inbox with approve / reject / edit-and-approve
- Auto-approval for owners and co-owners
- Toggle for traveler auto-approval (default on)
- Comments on items
- Notification skeleton: bell icon, unread count, in-app list
- Notification triggers: suggestion added, comment added, member joined
- Promote traveler → co-owner

**Acceptance:**
- Abby can be added as Co-Owner and her edits appear immediately
- A non-user friend can be added as a placeholder, then claim their identity on signup
- Suggestions inbox shows clear diff for new items
- Notifications never sent via email in v1

---

### M3 — Money (target: by August 1)
**Goal:** Splitwise replacement works.

**Features:**
- Budget view: line items with cost_estimate_usd, totaled per category
- Per-person and per-couple derived columns (configurable: who's a "unit"?)
- "Without flights" filter toggle (mirrors the pattern from Scott's Spain sheet)
- Expense entry: amount, paid_by, description, date, category, link to item (optional)
- Split modes: equal, by_share, by_amount, by_percent
- Per-expense member toggle (exclude people who didn't participate)
- Running balance per member
- Debt simplification (greedy minimum-cash-flow algorithm)
- "Settle up" action creates settlement record
- Expense list view with filter by member, category, date range
- Budget vs actual comparison view
- **Trip-Mode Money summary** (`/money`, #227) — a read-only per-person glance for the road, in Trip-Mode (clay) chrome, answering "how much do *I* have left to spend?". My budget = group budget total (NET-NEW `groupBudgetTotal` helper: per_day × tripDays + total) ÷ member count; my spent = my **reconciliation-aware** share of logged expenses (the `computeBalances` split attribution — what I consumed/owe, not out-of-pocket). Shows **N1** (left to spend = my budget − my share) and **N2** (left for unplanned = N1 − my share of remaining unbooked/unlinked estimates), each as a per-day rate over the trip-local remaining days (the hero) plus a total. Pure core in `money-glance.ts`; every figure deep-links to /budget and /expenses (no editing on the glance). Its bottom-nav tab landed with #244 (the Now+Today merge freed the slot): Trip nav = `Now · Money · Add · Docs`.

**Acceptance:**
- 3-person uneven dinner split (Scott $40, Abby $30, Jake $0 — Scott paid €120 = $130) settles correctly
- Adding a settlement zeros the relevant balance
- Algorithm produces minimum number of payments to settle group

**Dogfood:** India work trip, August 15 (vault + offline + expenses for solo trip).

---

### M4 — Execution (target: by September 15)
**Goal:** Usable on a real trip.

**Features:**
- Trip Mode: today-focused view, large cards, optimized for one-handed phone use
- Tomorrow / next-3-days quick views
- "Now" indicator showing next time-anchored item
- Service worker: read-only offline for the one active trip — the SW caches what it serves (navigations + their `__data.json`, network-first behind a precached app shell) and prefetches the whole active trip on app-open during its active window. *(Shipped via #203; the M4-era "full offline read mode, all trip data cached" claim never held against SSR — see §Offline for the real contract.)*
- ~~Offline toggle: explicit user-controlled "go offline" mode~~ — **dropped (WP-A-004).** It was inert against the SSR architecture and buried in planning-only nav. Offline is automatic now (an app-wide banner keyed off `navigator.onLine`); there is no toggle.
- Background revalidation: navigations are network-first, so the moment signal returns they refetch fresh and the whole-trip prefetch re-runs on the next online app-open. (No background job while the app is closed.)
- "Add to Home Screen" first-visit banner (iOS + Android variants)
- Trip Vault: encrypted entries, password-gated access
- Vault password setup and forgot-password warning
- Voting on alternates (heart/star/thumbs UI TBD)
- Promote alternate to primary; demote primary to alternate
- Drag/move between day slots
- Move items between phases / days

**Acceptance:**
- Trip Mode loads in <1s on a 4-year-old phone
- The **one active trip** works read-only offline after one online open during its active window (cold launch + in-app navigation render the cached trip, never a raw 503); editing offline is blocked with a toast. Inactive/future trips are not bulk-prefetched. *(See §Offline.)*
- Vault entries encrypted at rest; password required per session *(superseded — Vault retired in M7, ADR-0005)*
- Cannot accidentally lose vault data without explicit clear *(superseded — Vault retired in M7)*

**Dogfood:** Traverse City wine trip, October — first real group trip.

---

### M5 — Closure (target: by November 1)
**Goal:** Trip ends well; archive lives on.

**Features:**
- Trip Closeout Wizard: walks day by day through planned items — mark each done or considered. At end of each phase, reviews unplanned items: keep for archive (mark considered) or remove, with bulk auto-consider option. New items can be added during closeout for things that happened spontaneously.
- Inline quick-add during closeout for spontaneous items
- ~~Auto-publish public archive after `end_date + N days`~~ → **explicit owner publish** via `archive_publish_at` (#241, TRIP_WRAPUP_PRD); auto-publish retired
- Public archive view: done items, day/phase structure, photo link, title/dates/location only
- Public URL = `/archive/{public_share_token}` (absolute link surfaced on the closed Record view's Share panel, #242)
- **Closed trip home = read-only Record view (#242):** reuses the archive builder, visibly marked closed, with the Share affordance (copyable absolute link + `publishStatus` line + change-date/disable) and a low-emphasis **Reopen** control. Reopen sets `archived:false` (re-derives lifecycle from dates) and clears `archive_publish_at` (publish paused until re-closeout) — closed is reversible, not a trap.
- **"What we considered" = public recommendations (#243):** the public record's considered section = explicitly-`considered` items + **kept parking-lot ideas** (an OPTIONAL owner/co_owner closeout step, skipped by default, marks each unplanned idea keep→`considered` or drop; bulk "keep all"). Never stray `planned`, never `done` mislabeled. These are recommendations for outsiders asking "what'd you do?", not group nostalgia. Travelers never see this step. **Goals review is NOT built** (killed — goals don't appear in the record for v1).
- **Opt-in public budget summary (#243):** `archive_show_budget` (default off) toggled at publish. When on, the public record + the closed Record view show a **summary only** — trip total + rough per-person (`archiveBudgetSummary`) — **never** itemized expenses or who-owes-whom (those stay members-only).
- Bulk actions: "mark all planned → done" for days that went as planned
- JSON export of full trip (per-trip download)
- JSON import (load trip from backup)

**Acceptance:**
- Closeout wizard completes a 7-day trip in <5 minutes
- Public archive contains zero member names, zero expenses, zero vault entries
- Archive URL works without login
- Trip JSON export round-trips losslessly via import

---

### M6 — Polish & Nice-to-Haves (ongoing after M5)
- Trip cloning with per-category checklist of what to bring over
- Google Places autofill on item create (across types)
- AeroDataBox flight number lookup → autofill departure/arrival/timezones
- Checklist item type fully fleshed out (grocery, packing, to-book templates)
- Recommendations / saved-options sidebar per location (Pinterest-style; mirrors "RECS" sections in your docs)
- "Phase parking lot" view, "Trip parking lot" view (separate from day-slot alternates)
- Share archive link directly to social (Open Graph metadata)
- Dark mode
- Print-friendly itinerary view (for the "print Excel pages" backup pattern from forum reviews)

### M7 — Documents & Vault retirement

> Scope change registered 2026-06-07. Full spec: `docs/V4_DOCUMENTS_PRD.md` (ready-for-agent).
> Decision record: `docs/adr/0005-retire-vault-no-client-side-encryption.md`.

- **Retire Vault entirely** — delete `vault_entries` collection, `vault_password_hash`, `crypto.ts`,
  `vault-password.ts`, `/api/vault/unlock`, and the vault route/screens. (Deliberate exception to the
  append-only migration rule — no production data.) Supersedes all `vault_entries`/Vault references in
  Sections 4, 5, 8, 9 below.
- **New `documents` domain** — plain (unencrypted) PDF/image artifacts, membership-gated, one file per
  record, attached to an Item or the Trip. Takes the retired Vault nav slot (Planning + Trip Mode).
- **Offline:** active-trip Document files auto-precached by the service worker; planning = cache-on-view. *(Now folded into the whole-trip prefetch — see §Offline / PRD #203.)*
- See the PRD for data model, permissions, views, offline, and the design grill decisions.

---

## 8. Screen Inventory

### Authenticated app
1. **Login** — email entry → code entry → in
2. **Home / Trips list** — cards for active, upcoming, past trips
3. **Create Trip** — wizard (title, dates, location, cover, optional clone-from)
4. **Trip Overview** — phases, key stats, members, mode toggle (Planning / Trip)
5. **Phase Detail** — days within phase, phase-level parking lot (unplanned items)
6. **Day Detail** — timeline of planned items with anchor times, untimed items by sort_order, parking lot below, comments, day notes
7. **Item Detail** — full item view + edit form
8. **Item Quick-Add** — bottom sheet on mobile, slide-over on desktop
9. **Suggestions Inbox** — list of pending suggestions for trips you own/co-own
10. **Members** — list, role management, invite, remove
11. **Budget** — line items, categories, per-person summary
12. **Expenses** — entry form, list, balances, settle-up
13. **Vault** — password unlock screen, then list of entries
14. **Trip Settings** — slug, archive toggle, auto-approve toggle, vault password setup, danger zone
15. **Notifications** — list, mark read
16. **Closeout Wizard** — day-by-day planned items (done/considered), phase-level unplanned review with bulk auto-consider, inline item add
17. **Trip Mode — Now** — what's happening now, next up, ongoing items
18. **Trip Mode — Today** — today timeline, planned items + parking lot
19. **Trip Mode — Add** — quick-add item during trip
20. **Trip Mode — Money** (`/money`) — read-only per-person glance: "how much do *I* have left to spend?" Two labeled figures — **N1** left-to-spend (my budget − my reconciliation-aware share) and **N2** left-for-unplanned (N1 − my share of remaining planned estimates) — each as a per-day rate (the hero) + a total. Deep-links to /budget and /expenses to settle/edit. Bottom-nav tab landed with #244 (#227).
21. **Trip Mode — Vault** — password-gated encrypted entries

### Public
19. **Public Archive** — read-only trip retrospective, no login
20. **Invite Accept** — email + code → join trip

---

## 9. Cross-Cutting UX Patterns

### Autofill from external source
Every "add item" form has an optional **lookup field** at the top.
- For lodging/activity/meal: Google Places search → pick → autofill name, address, coords, place_id, phone, website.
- For flight: AeroDataBox flight # lookup → autofill airline, dep/arr airports, times, timezones, duration.
- For transportation: manual entry (train, bus, car rental, rideshare).
- Manual entry always remains available below the lookup.
- Edits to autofilled fields are always allowed.

### Suggestions inbox (two-gate model)
- One inbox per trip (shared by Owner + Co-Owners; not per-user).
- Items: who suggested it, when, the diff/payload, [Approve] [Edit & Approve] [Reject] buttons.
- **Gate 1 — Suggestion approval:** pending → approved. Auto-approve (default on) skips this gate for traveler contributions. When auto-approve is off, UI tells the traveler their contribution will be reviewed.
- **Gate 2 — Planning:** Approved suggestions become **unplanned items** (not planned). Promoting unplanned → planned is a separate action (drag to day, or explicit "plan this").
- Auto-approved suggestions land in the inbox marked "auto-approved" so reviewers can see history.

### Parking lot
- The parking lot is a filtered view: `status = unplanned` within a phase. Not a separate data structure.
- Visible on day views as phase-scoped suggestion cards.
- Sorted by aggregate vote score descending, then sort_order.

### Mode switching
- Planning Mode ↔ Trip Mode toggle in trip header. Mode is UI state, not data.
- Trip Mode available only when the trip's **derived lifecycle** (`getTripLifecycle` → planning/active/wrap-up/closed; only `archived` persists) is `active`. Default mode for active trips.
- Planning Mode: 5-tab moss nav (Itinerary, Money, Activity, Vault, More).
- Trip Mode: 4-tab clay nav (Now, Money, Add, Docs). Now is one weighted whole-day tab with Today / Next 3 days sub-tabs (#244); Money = the Trip-Mode money glance at `/money`.
- Archive view auto-rendered for closed trips (also accessible via public share link). Not a mode.

### Mobile-first interaction patterns
- Bottom sheets for forms on mobile, slide-overs on tablet+
- Floating action button for "Add item" on relevant screens
- Swipe-to-edit on item rows (with desktop-friendly fallback)
- Sticky bottom nav: see Mode switching section for per-mode tab structure

### Add-to-home-screen prompt
- iOS: detect Safari, show banner with screenshots of the share menu steps
- Android: use `beforeinstallprompt` event, show in-app prompt
- Dismissable; remembered for 30 days

### Offline behavior

**Shipped** via PRD **#203** (slices #253/#254/#255), decision **ADR-0010**. This section is the real contract — earlier SPEC claims ("full offline read mode, all trip data cached", "Full trip works offline after one online load") were aspirational and **never held** against the SSR architecture (server-side `locals.pb` loads bypass the service worker; pre-#203, only document bytes cached, and only after a Documents-tab visit — the #116-audit live-doc lie, findings WP-B-010 + WP-A-004). The strategy meets SSR where it is — cache the rendered output + data payloads + proactively prefetch — rather than rearchitecting to a client-fetch / IndexedDB model (rejected in the ADR).

- **Read-only offline for the one active trip.** After the traveler opens it online once during its active window, the **whole active trip is available read-only offline** — the itinerary (Now, every day, every item, the overview) and every [[Document]] (boarding pass, hotel vouchers). On the plane they open Waypoint and see their day and their boarding pass, not a 503.
- **The service worker caches what it serves.** Navigations and their SvelteKit `__data.json` payloads are cached **network-first** (fresh online, last-seen offline). A minimal **app shell is precached** at install, so a cold launch offline always renders the app. Document bytes are **cache-first** (immutable per record). Routing is a pure `cache-policy` module; the SW is a thin executor (slice #253).
- **The whole active trip is prefetched on app-open.** A pure `offline-manifest` module turns the active trip's loaded data into the exact URL set — every day route, item-detail data payload, the overview, the Documents list, and every document-byte URL. On app-open during the active window (from **any** Trip-Mode surface, gated by the tz-correct `isTripActive`, #167), the SW best-effort (`allSettled`) pulls that whole list into cache, **scoped to the one active trip** (slice #254). The day-1 flight is covered without the traveler having hunted through tabs.
- **Offline is automatic and honest.** There is **no toggle** (the inert manual toggle + its `SET_OFFLINE` plumbing and localStorage flag were removed — closes WP-A-004). An app-wide banner keyed off `navigator.onLine` + the online/offline events shows "Offline — showing [Trip] as of [snapshot time]," prominent in Trip Mode; the snapshot revalidates the moment signal returns (slice #255).
- **Read-only, gracefully.** Any attempt to mutate offline is short-circuited with a toast ("You're offline — reconnect to make changes"); read navigation is unaffected. No offline edit queue or sync. A page that genuinely wasn't cached shows a friendly "not available offline" state, never a raw 503 (slice #255).
- **Device-scoped; cleared on logout.** The cached HTML is authenticated SSR output, so caches are device-scoped and wiped on sign-out (mitigates a shared-device leak); old cache versions are evicted by the per-build version scheme (slice #253).
- **Inactive/future trips are not bulk-prefetched.** They work offline only for the specific pages visited online (cache-on-visit), which is acceptable — the promise is the one active trip on a plane.

---

## 10. Captured From Existing Docs (patterns you didn't articulate)

Items found in your Switzerland and Spain docs that are now folded into the spec:

1. **Multi-leg flights** — your Switzerland doc has Lufthansa LH 443/6906 with a Frankfurt connection. Modeled via `parent_item` on items.
2. **"Booked by" ≠ "Paid by"** — your Spain doc has "train booked by Scott", "Dad booked 3 rooms" — separate from who pays. Both fields exist on items.
3. **Multiple confirmation codes per item** — Spain doc: "Finder SYN2447-122559 Pin BZVPG99A9N", booking refs, order IDs. Modeled as `confirmation_codes` array of `{label, value}`.
4. **Free cancellation flag** — flagged in your Airbnb bookings. Optional `free_cancellation` boolean.
5. **Sub-group items** — "Mary, Pat, Laura, Gayle train to Lucerne", "Susan/Mary watch Aiden & Bri", car assignment groups. Modeled via `assigned_to` on items.
6. **Pre-booked alternates** — Spain doc: "Dinner Reservation Option booked at Bar Thonet" + "Dinner Reservation Option booked at El Nacional" for same night. Both can be `booked = true`, with `rank: 0` and `rank: 1` until you decide.
7. **Per-person ticket pricing** — Switzerland trains ($145ea, $140ea). Item `cost_estimate_usd` is the unit cost; per-person derivation in Budget view.
8. **Reference / recommendation lists per location** — "Restaurants" / "Things to do in Nendaz" / "Après-ski" sections in Switzerland; "Location-Specific Recommendations" in Spain. Modeled as parking-lot alternates with `parking_lot_scope = phase`. M6 polish: render as a sidebar "saved options" view.
9. **Day-trip menus** — "Day trip suggestions: Interlaken, Lucerne, Thun, Bern, or Zermatt" with sub-recommendations. Modeled as multiple `activity` alternates with `parking_lot_scope = day` for that day.
10. **Pending status** — "Check in instructions are pending" in Switzerland doc. Captured via comments on items + `booked = false`. (Considered a `pending` status — rejected in favor of clearer two-state model. Use comment thread for in-flight notes.)
11. **Train + car combo for one leg** — Switzerland: "Train to Sion, then rent a car." Each is a separate item; can be parent/child if you want to nest.
12. **Grocery list** — explicit shared checklist in Switzerland doc. Modeled as `checklist` item type, scoped to trip (no day).
13. **Budget structure** — your Spain sheet has cost_per_person / cost_per_couple / cost_for_all. Per-person and total are computed; "per couple" is not a first-class concept (just per-person × 2 for a 2-person unit). M3 budget view shows per-person and total; "couple" view is a UI grouping if you want it.
14. **"Costs without flights" filter** — your Spain sheet has this row. Useful pattern: budget view has a "exclude flights" toggle.
15. **Different flights for different members** — Spain doc: Abby&Scott / Sam&Mark / Debi&Rick all on different flights. Items are scoped via `assigned_to` to the relevant subset.
16. **Preferred vs backup options** — Spain doc: "los gallos preferred then tablas el arenal". Maps to primary + alternate with rank.
17. **Restaurant near-anchor recs** — "local eats nearby" sub-bullet under Sagrada Familia. Could model as comment on the activity, or as nearby alternates. Default: comment.
18. **Doc clutter / duplicate content** — your Spain doc has Saturday Nov 22 content duplicated at the bottom. Sign of how docs degrade. The App's structured model prevents this by construction.

---

## 11. External Integrations

| Service | Use | Auth | Notes |
|---|---|---|---|
| Google Maps Places (New) | Place search/autofill, place details | API key, restricted by domain | Use session tokens for free autocomplete; keep within free tier |
| AeroDataBox (RapidAPI) | Flight # → flight details | API key | Free tier: ~100 calls/month, enough |
| Resend | Transactional email (auth codes, invites) | API key | Free tier: 3,000/month |
| Self (Pocketbase) | Everything else | — | Single binary, SQLite |

API keys live in Pocketbase env vars or `.env` file, never in client code. Frontend calls Pocketbase endpoints which proxy external APIs server-side (so keys never leak).

---

## 12. Non-Functional Requirements

- **Accessibility:** WCAG 2.1 AA. Semantic HTML, keyboard nav, focus visible, ARIA where needed, color contrast ≥4.5:1, alt text on images, form labels, screen-reader-friendly errors.
- **Performance:** First contentful paint <1.5s on 4G mobile. Trip Mode interactive in <1s after cache. Lighthouse score ≥90 across the board.
- **Offline:** The **one active trip** is fully read-only offline after one online open during its active window (whole-trip prefetch: every day, item, the overview, the Documents list + all bytes). Other (inactive/future) trips are read offline only for the specific pages visited online (cache-on-visit). Editing offline is blocked. See §Offline for the full contract.
- **Browser support:** Last 2 versions of Chrome, Safari (iOS + macOS), Firefox, Edge.
- **Mobile:** iPhone (iOS 16+), Android (Chrome 110+). Tablet and desktop fully supported.
- **Privacy:** No third-party trackers. Self-hosted analytics only. No data sold or shared.
- **Security:**
  - All traffic HTTPS (Caddy auto)
  - Pocketbase auth tokens 30-day sliding expiration
  - Vault entries AES-GCM encrypted client-side with PBKDF2-derived key from trip password
  - Public archive token is unguessable random URL-safe string (≥32 bytes entropy)
  - Rate limit on auth endpoints
- **Backups:** Nightly SQLite snapshot to off-site storage. Per-trip JSON export available to users.

---

## 13. Out of Scope (v1)

Explicitly not building. Each is a future consideration but **must not creep in**:

- Multi-currency (USD only)
- Real-time collaborative editing (suggestions inbox is the model)
- Email parsing for auto-import of bookings (TripIt's killer feature; reconsider in v2 if missed)
- Push notifications (in-app badge only)
- Email notifications (in-app only)
- Embedded interactive maps (linkout to Google Maps via place_id is sufficient)
- Native mobile apps (PWA only)
- Flight delay/gate alerts
- Photos hosted in-app (linkout to external album)
- Comments / messaging beyond per-item comments
- Trip discovery / public trip browsing (only specific shared archive URLs)
- Trip templates marketplace
- AI itinerary generation
- Direct booking integrations
- Splitwise import/export
- Automatic timezone conversion for cross-zone flights beyond storing per-segment tz
- Trip cover photo cropping/editor
- User profile pages

---

## 14. Open Decisions (defer until forced)

1. **Vote display UI** — **Closed 2026-05-29.** Love/Like/Flexible/Dislike model. Avatar stacks per option, no visible numeric score. Unplanned items sort by aggregate vote score. See CONTEXT.md.
2. **Color palette / typography** — **Closed 2026-04-25.** Adopted the Waypoint design system from the Claude Design handoff: paper/ink/moss/clay/gold/sky palette, Fraunces (display) / Inter (UI) / JetBrains Mono (mono). Implemented in M1.5; tokens live in `src/routes/layout.css` `@theme`.
3. **App name** — placeholder. Decide before public archive launch (M5).
4. **Domain** — `trips.scottvandenwarsen.com` recommended. Confirm before M4 deployment.
5. **Server location** — home server vs VPS. Decide before M4.
6. **Dark mode timing** — M6 unless trivially free.
7. **Per-couple unit toggle in budget** — does it earn its weight in UI complexity? Decide during M3.

---

## 15. Acceptance Definition for v1 Done

v1 = M1 through M5. Considered done when:

- [ ] Traverse City October trip planned, executed, and archived entirely in the App
- [ ] At least 3 non-Owner members (any role) successfully used it on phone
- [ ] No fallback to Google Docs / Sheets / Splitwise / group chat for any of the original 5 use cases
- [ ] Public archive URL linked from scottvandenwarsen.com
- [ ] Zero data loss across the trip lifecycle

---

## 16. Changelog

| Date | Summary | Reference |
|---|---|---|
| 2026-06-19 | **§Offline truthed up to shipped behavior (live-doc lie closed).** Offline shipped (PRD #203 / ADR-0010): read-only active trip after one online open, whole-trip prefetch on app-open (`offline-manifest`), SW caches what it serves behind a precached shell (`cache-policy`), automatic offline banner (no toggle — WP-A-004 closed), editing blocked offline, friendly "not available offline" state, device-scoped caches cleared on logout. Rewrote §Offline + the stale M4/M5 "full offline read mode / all trip data cached / full trip works offline" claims that never held against SSR. CONTEXT.md [[Document]] offline note verified accurate (unchanged). | docs/SPEC.md §Offline, PRD #203, ADR-0010, slices #253/#254/#255 |
| 2026-06-07 | **M7 — Documents & Vault retirement registered.** Vault (`vault_entries`, `vault_password_hash`, client-side crypto, vault route) retired entirely; new `documents` domain (plain PDF/image artifacts, membership-gated, Item/Trip-scoped, offline-precached for active trip) takes its nav slot. Design handoff (*The Ledger*) grilled into the PRD. Supersedes Vault refs in §§4, 5, 8, 9. | docs/V4_DOCUMENTS_PRD.md, ADR-0005 |
| 2026-05-29 | **v3 design alignment.** Slot → anchor time + time slot (derived). Status lifecycle expanded: unplanned → planned → done/considered. Flight promoted to first-class item type with AeroDataBox integration. Votes redesigned: Love/Like/Flexible/Dislike with avatar stacks, no visible score. Rank and parking_lot_scope removed — parking lot is now a filtered view (status = unplanned). Multi-day items via end_date. Phase colors removed (mode accent instead). Three modes → two modes + archive view. Closeout rewritten for new status lifecycle. Suggestion two-gate model (approved → unplanned, not planned). Ferry removed from transportation subtypes. | CONTEXT.md, GitHub #11 |
| 2026-04-25 | Design system adopted. Paper/ink/moss/clay/gold/sky palette, Fraunces/Inter/JetBrains Mono fonts. | M1.5 milestone |
