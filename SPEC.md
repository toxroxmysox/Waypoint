# Trip App — v1 Specification

> Codename: TBD. Working name in this doc: **the App**.
> Owner: Scott Vanden Warsen
> Last updated: 2026-04-15

---

## 1. Mission

A self-hosted, mobile-first PWA that replaces the Google Doc / Google Sheet / Splitwise / pinned-message stack Scott and Abby use for trip planning, execution, and post-trip sharing. Must be polished enough that non-technical friends will actually contribute, structured enough that nothing gets lost between planning and trip day, and shareable enough that the trip lives on as a public archive afterward.

**Three modes on one data set:**
1. **Planning Mode** — collaborative editing with suggestions inbox, voting, alternates, budget.
2. **Trip Mode** — day-of execution view, phone-first, one-handed, large cards, offline-capable read.
3. **Archive Mode** — public read-only post-trip view of what actually happened. Linkable from Scott's website.

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
| Hosting (production) | Home server when ready; Hetzner CX22 (~$5/mo) as fallback | Open-source, low cost |
| Hosting (preview) | Vercel/Netlify free tier for frontend; PocketBase on Fly.io free tier or your laptop via Tailscale | Bridge until production server is up |
| Backups | Nightly cron rsync of PocketBase SQLite to second location (B2/S3 or another box) | Cheap, simple, sufficient |

---

## 3. User Roles & Permissions

| Action | Owner | Co-Owner | Traveler | Viewer | Public (archive link) |
|---|:---:|:---:|:---:|:---:|:---:|
| Create/edit trip metadata | ✓ | ✓ | — | — | — |
| Add/edit/delete items | ✓ | ✓ | suggest only* | — | — |
| Book / unbook items | ✓ | ✓ | suggest only | — | — |
| Mark done / use closeout wizard | ✓ | ✓ | — | — | — |
| View Trip Vault | ✓ | ✓ | ✓ (with trip password) | — | — |
| Edit Trip Vault | ✓ | ✓ | — | — | — |
| Add expenses | ✓ | ✓ | ✓ | — | — |
| View expense ledger | ✓ | ✓ | ✓ | — | — |
| Settle up | ✓ | ✓ | ✓ | — | — |
| Submit suggestions | ✓ (auto-approve) | ✓ (auto-approve) | ✓ (queued) | comment only | — |
| Approve suggestions | ✓ | ✓ | — | — | — |
| Comment on items | ✓ | ✓ | ✓ | ✓ | — |
| Vote on alternates | ✓ | ✓ | ✓ | — | — |
| Invite Travelers / Viewers | ✓ | ✓ | ✓ | — | — |
| Invite Co-Owners | ✓ | ✓ | — | — | — |
| Promote Traveler → Co-Owner | ✓ | ✓ | — | — | — |
| Remove members | ✓ | ✓ | — | — | — |
| View archive (post-trip) | ✓ | ✓ | ✓ | ✓ | ✓ (after end_date + N days) |

*Traveler-suggested items can be auto-approved via per-trip setting (default: yes).

**Notes:**
- Owner and Co-Owner are functionally identical. Distinction exists only for "who can promote others."
- The original creator is the Owner; they can promote Travelers to Co-Owner. A trip can have any number of Co-Owners.
- Co-Owners cannot remove the original Owner. Owner cannot demote themselves if they are the only Owner.
- Travelers can invite (lowers friction for "tell your friend Jake to join the trip"). They invite as Traveler/Viewer, not as Co-Owner.
- Public archive link is **not live by default**. Owner enables it, and it auto-publishes `end_date + N days` (default 7, configurable).

---

## 4. Data Model

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
| archive_enabled | bool | Owner toggle |
| archive_publish_after_days | int, default 7 | Days after end_date until public |
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

### `phases`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| name | text, required | "Barcelona", "Granada" |
| location | text | City name |
| country_code | text | ISO 3166-1 alpha-2 |
| start_date | date | |
| end_date | date | |
| color | text | Hex, for UI tabs |
| order | int | Manual order, for reorderable phases |

### `days`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| phase | relation→phases, nullable | Computed from date if null |
| date | date, required | |
| notes | text | Day-level free notes |

Days can be auto-generated from trip start/end dates and re-bucketed when phases shift.

### `items`
| Field | Type | Notes |
|---|---|---|
| trip | relation→trips, required | |
| phase | relation→phases, nullable | Denormalized for query speed |
| day | relation→days, nullable | Null = unscheduled (parking lot) |
| slot | enum: morning, afternoon, evening, anytime | Within a day |
| type | enum: lodging, transportation, activity, meal, note, checklist | |
| subtype | text, nullable | "tour", "guided", "flight", "train", etc. — drives icon/color |
| title | text, required | |
| description | text | |
| location_name | text | |
| location_address | text | |
| location_coords | json `{lat, lng}` | |
| google_place_id | text | For re-fetch / deep-link to Maps |
| start_time | datetime, nullable | Trip-local time |
| end_time | datetime, nullable | Trip-local time |
| start_tz | text, nullable | For book-end flights crossing zones |
| end_tz | text, nullable | |
| status | enum: planned, done | Default planned |
| booked | bool, default false | Only meaningful for lodging/transportation/activity |
| booked_by | relation→trip_members, nullable | Who made the reservation |
| paid_by | relation→trip_members, nullable | If pre-paid; for budget tracking |
| confirmation_codes | json (array of `{label, value}`) | "Booking ref", "PIN", etc. — supports multiple |
| reservation_url | url | Link to original booking |
| free_cancellation | bool, nullable | Optional metadata |
| cost_estimate_usd | number, nullable | Per-item estimated cost |
| cost_actual_usd | number, nullable | Filled in after booking/spending |
| assigned_to | relation→trip_members, multiple | Subset of members this applies to (room assignments, sub-group activities) |
| rank | int, default 0 | 0 = primary, 1+ = alternates within (day, slot) |
| parking_lot_scope | enum: none, trip, phase, day | If non-`none`, this is an alternate not a primary; combined with day field for day-scoped |
| parent_item | relation→items, nullable | For multi-leg transit (flight with layover) |
| created_by | relation→trip_members | |

**Notes on items:**
- A single-segment flight = one item. A multi-leg flight (DTW→FRA→ZRH) = parent item with 2 child items via `parent_item`.
- A `meal` or `note` cannot be `booked` (UI hides the toggle).
- `parking_lot_scope` answers "what's the scope of this alternate?" — `trip` = trip-wide alternate, `phase` = scoped to phase, `day` = day-slot alternate. The parking lot view at level X unions everything at level X and below.
- `assigned_to` supports the "sub-group activity" pattern (only Mary/Pat/Laura/Gayle on the Lucerne train).

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
| created | datetime | |

Unique constraint on (item, member). One vote per member per item. Promoting an alternate to primary is a separate action (rank manipulation), not a vote tally.

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

### `vault_entries`
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

## 5. Item Types & Status Model

### Item types
| Type | Bookable? | Time-anchored? | Examples |
|---|:---:|:---:|---|
| lodging | ✓ | sometimes (check-in time) | Hotel, Airbnb, chalet |
| transportation | ✓ | usually | Flight, train, bus, car rental, ferry |
| activity | ✓ | sometimes | Tour, museum, hike, ski day, cooking class |
| meal | — | sometimes (reservations) | Breakfast, lunch, dinner, drinks |
| note | — | — | Free-text reminders, day notes |
| checklist | — | — | Grocery list, packing list, to-book list |

### Subtype tags (color/icon hints)
- transportation: `flight | train | bus | car_rental | ferry | rideshare | walk`
- activity: `tour | museum | outdoor | sport | shopping | spa | nightlife | sightseeing`
- meal: `breakfast | brunch | lunch | dinner | drinks | snack | coffee`
- lodging: `hotel | airbnb | hostel | resort | chalet`

### Status model
- `status: planned | done` (no `skipped` per Scott's call — delete if not happening)
- `booked: true | false` (independent boolean for bookable types)
- `parking_lot_scope: none | trip | phase | day` (`none` = primary item; otherwise = alternate at that scope)
- `rank: int` (within day-slot, 0 = primary, 1+ = alternates; relevant when `parking_lot_scope = day`)

**Derived views:**
- "To-book list" = items where `booked = false` AND `status = planned` AND type ∈ {lodging, transportation, activity}
- "Today" view = items where `day.date = today`, sorted by `start_time` then slot
- Archive view = items where `status = done`, plus all parking-lot alternates (read-only "what we considered" sidebar)

---

## 6. Feature Milestones

Each milestone is **independently shippable**. Do not start Mn+1 until Mn has been used on a real (or fake) trip and you've tightened any pain points.

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

**Dogfood:** China work trip, May 15.

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
- Service worker: full offline read mode (all trip data cached)
- Offline toggle: explicit user-controlled "go offline" mode that prevents network requests
- Background refresh when online
- "Add to Home Screen" first-visit banner (iOS + Android variants)
- Trip Vault: encrypted entries, password-gated access
- Vault password setup and forgot-password warning
- Voting on alternates (heart/star/thumbs UI TBD)
- Promote alternate to primary; demote primary to alternate
- Drag/move between day slots
- Move items between phases / days

**Acceptance:**
- Trip Mode loads in <1s on a 4-year-old phone
- Full trip works offline after one online load
- Vault entries encrypted at rest; password required per session
- Cannot accidentally lose vault data without explicit clear

**Dogfood:** Traverse City wine trip, October — first real group trip.

---

### M5 — Closure (target: by November 1)
**Goal:** Trip ends well; archive lives on.

**Features:**
- Trip Closeout Wizard: walks day by day, slot by slot, with "Done as planned" / "Did something else" / "Skipped" buttons
- "Did something else" inline quick-add
- Auto-publish public archive after `end_date + N days` (configurable per trip)
- Public archive view: done items, day/phase structure, photo link, title/dates/location only
- Public URL = `/archive/{public_share_token}`
- Bulk actions: "mark entire day as done as planned"
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

---

## 7. Screen Inventory

### Authenticated app
1. **Login** — email entry → code entry → in
2. **Home / Trips list** — cards for active, upcoming, past trips
3. **Create Trip** — wizard (title, dates, location, cover, optional clone-from)
4. **Trip Overview** — phases, key stats, members, mode toggle (Planning / Trip)
5. **Phase Detail** — days within phase, phase-level alternates
6. **Day Detail** — slot-grouped items, alternates, comments, day notes
7. **Item Detail** — full item view + edit form
8. **Item Quick-Add** — bottom sheet on mobile, slide-over on desktop
9. **Suggestions Inbox** — list of pending suggestions for trips you own/co-own
10. **Members** — list, role management, invite, remove
11. **Budget** — line items, categories, per-person summary
12. **Expenses** — entry form, list, balances, settle-up
13. **Vault** — password unlock screen, then list of entries
14. **Trip Settings** — slug, archive toggle, auto-approve toggle, vault password setup, danger zone
15. **Notifications** — list, mark read
16. **Closeout Wizard** — full-screen guided flow
17. **Trip Mode (today)** — focused day-of view
18. **Trip Mode (next 3 days)** — multi-day at-a-glance

### Public
19. **Public Archive** — read-only trip retrospective, no login
20. **Invite Accept** — email + code → join trip

---

## 8. Cross-Cutting UX Patterns

### Autofill from external source
Every "add item" form has an optional **lookup field** at the top.
- For lodging/activity/meal: Google Places search → pick → autofill name, address, coords, place_id, phone, website.
- For transportation/flight: AeroDataBox flight # lookup → autofill airline, dep/arr airports, times, timezones, duration.
- Manual entry always remains available below the lookup.
- Edits to autofilled fields are always allowed.

### Suggestions inbox
- One inbox per trip (shared by Owner + Co-Owners; not per-user).
- Items: who suggested it, when, the diff/payload, [Approve] [Edit & Approve] [Reject] buttons.
- Auto-approved suggestions land in the inbox marked "auto-approved" so reviewers can see history.

### Parking lot views
- Day parking lot = alternates with `parking_lot_scope=day` for that day's slots
- Phase parking lot = unions phase-scope + day-scope for that phase
- Trip parking lot = unions everything

### Multi-mode views on same data
- Planning ↔ Trip mode toggle in trip header
- Archive view auto-rendered for past trips with `archived = true` (also accessible via public link)

### Mobile-first interaction patterns
- Bottom sheets for forms on mobile, slide-overs on tablet+
- Floating action button for "Add item" on relevant screens
- Swipe-to-edit on item rows (with desktop-friendly fallback)
- Sticky bottom nav: Home / Trip / Expenses / Vault / More

### Add-to-home-screen prompt
- iOS: detect Safari, show banner with screenshots of the share menu steps
- Android: use `beforeinstallprompt` event, show in-app prompt
- Dismissable; remembered for 30 days

### Offline behavior
- Service worker caches all trip data when online
- Offline toggle in user menu: explicit "go offline" prevents network calls
- Edits while offline = blocked with toast: "You're offline. Reconnect to save changes."
- Cached views remain fully functional

---

## 9. Captured From Existing Docs (patterns you didn't articulate)

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

## 10. External Integrations

| Service | Use | Auth | Notes |
|---|---|---|---|
| Google Maps Places (New) | Place search/autofill, place details | API key, restricted by domain | Use session tokens for free autocomplete; keep within free tier |
| AeroDataBox (RapidAPI) | Flight # → flight details | API key | Free tier: ~100 calls/month, enough |
| Resend | Transactional email (auth codes, invites) | API key | Free tier: 3,000/month |
| Self (Pocketbase) | Everything else | — | Single binary, SQLite |

API keys live in Pocketbase env vars or `.env` file, never in client code. Frontend calls Pocketbase endpoints which proxy external APIs server-side (so keys never leak).

---

## 11. Non-Functional Requirements

- **Accessibility:** WCAG 2.1 AA. Semantic HTML, keyboard nav, focus visible, ARIA where needed, color contrast ≥4.5:1, alt text on images, form labels, screen-reader-friendly errors.
- **Performance:** First contentful paint <1.5s on 4G mobile. Trip Mode interactive in <1s after cache. Lighthouse score ≥90 across the board.
- **Offline:** Read-only offline works for any trip viewed at least once online.
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

## 12. Out of Scope (v1)

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

## 13. Open Decisions (defer until forced)

1. **Vote display UI** — heart, star, thumbs-up, +1 counter. Decide when building M4.
2. **Color palette / typography** — mood: clean and confident like colabsoftware.com, with personality not corporate. Decide during M1 frontend setup.
3. **App name** — placeholder. Decide before public archive launch (M5).
4. **Domain** — `trips.scottvandenwarsen.com` recommended. Confirm before M4 deployment.
5. **Server location** — home server vs VPS. Decide before M4.
6. **Dark mode timing** — M6 unless trivially free.
7. **Per-couple unit toggle in budget** — does it earn its weight in UI complexity? Decide during M3.

---

## 14. Acceptance Definition for v1 Done

v1 = M1 through M5. Considered done when:

- [ ] Traverse City October trip planned, executed, and archived entirely in the App
- [ ] At least 3 non-Owner members (any role) successfully used it on phone
- [ ] No fallback to Google Docs / Sheets / Splitwise / group chat for any of the original 5 use cases
- [ ] Public archive URL linked from scottvandenwarsen.com
- [ ] Zero data loss across the trip lifecycle
