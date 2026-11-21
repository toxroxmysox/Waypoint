# Plan — Trip access module (#543)

Refactor. Source: 2026-10-21 architecture review, candidate 03. Naming ruling (#543 comment, #548 grill): **Organizer** = owner or co-owner; `isOwner` = owner-only.

## Goal

One module, `src/lib/server/trip-access.ts`, that every loader/action asks for: trip by slug, the caller's **active** membership (`removed_at = ""`), role predicates, and a consistent HTTP-status mapping for failed PB calls. PB stays the real gate (ADR-0025): this drives UX gating and 404/403 mapping only. SvelteKit side only; `pb_hooks` untouched.

## Non-goals

- No behaviour change. Same status codes, same messages, same thrown-vs-returned shape per call site. Where an old helper let a PB error propagate (→ SvelteKit 500), the new call site still does.
- No change to data keys sent to Svelte (e.g. `isOwner` in budget/goals/members data) this session — that touches components; follow-up below.
- Not the MCP tools (`src/lib/server/mcp/**`): separate access layer, own follow-up if wanted.
- Keep loader diffs minimal: #546 (isSpanning / Parking Lot rename) is in flight in days/phases/now loaders.

## Module API

```ts
// predicates (pure)
isOrganizer(role)   // owner | co_owner
isOwner(role)       // owner only
isViewer(role)      // viewer
failStatus(err)     // err.status if 400-599 else 500

// PB lookups (take PocketBase, never App.Locals — testable with a fake)
// userId is `string | undefined` (locals.user?.id): signed out never queries `user = ""`
// (that would match a placeholder member)
getTripBySlug(pb, slug)                      // throws the PB error
getActiveMembership(pb, tripId, userId)      // throws the PB error (404 when not a member); status-less Error when signed out
findActiveMembership(pb, tripId, userId)     // null when not a member / signed out / any error
callerIsViewer(pb, tripId, userId)           // viewer gate for member-open paths (tasks); throws like getActiveMembership

// loader gate: kit error(404 'Trip not found') / error(403 'You are not a member of this trip')
loadTripAccess(pb, slug, userId) -> { trip, membership }

// action gate: resolve trip + membership, return fail-shape for non-organizers
requireOrganizer(pb, slug, userId) -> { ok: true, trip, membership } | { ok: false, status: 403, message }
```

`requireOrganizer` keeps `requireOwner`'s semantics: a missing trip or membership throws (callers' catch → `fail(500)`), a non-organizer returns `{ ok:false, 403, 'Only owners or co-owners can do that.' }`.

## Tests (Vitest, `trip-access.test.ts`)

Role predicates across all four roles; `failStatus` for 403/404/409/599/600/399/undefined/null/non-object; `loadTripAccess` → 404 when trip lookup throws, 403 when membership lookup throws, filter includes `removed_at = ""`; `requireOrganizer` → ok for owner/co_owner, 403 for traveler/viewer, throws on missing trip; `findActiveMembership` → null on throw. Fake PB object — no network.

## Rollout — one commit per family

1. **Module + tests.**
2. **Trip root** — `trips/[slug]/+layout.server.ts` (→ `loadTripAccess`), `trips/[slug]/+page.server.ts` (`requireOwner` → `requireOrganizer`; fix the wrong "can't share a closure" comment; role literals → `isOrganizer`/`isViewer`).
3. **Day** — `days/[dayId]`: drop local `failStatus`, `canArrangeDay` keeps its day→trip hop but uses `getActiveMembership` + `isOrganizer` (its own try/catch → false).
4. **Item** — `items/[itemId]`: drop local `failStatus`, `getMembership`, `isViewer`; inline membership lookups in `vote`/`skipItem` use the module.
5. **List** — `lists/[listId]`: drop local `getTrip`/`isViewer`.
6. **Phase** — `phases/[phaseId]`: drop local `failStatus`; role literals → predicates.

Review fix (landed): the item and list pages had grown identical `callerIsViewer` wrappers → moved into the module.

### Behaviour notes

- Statuses + messages unchanged at every migrated call site.
- Signed-out callers: actions run before layout loads and hooks don't guard, so `locals.user` can be null in an action. Old code threw a `TypeError` from `locals.user!.id` _inside_ an async helper (→ rejection). The module keeps each outcome: `find*` → null (call site's 403), `get*`/`require*` reject status-less (→ 500 / caller's catch), layout → 403.
- `getTripBySlug` is typed `Trip` where some actions had an untyped record — type-only.

Each family: `pnpm check` + `pnpm test:unit --run` green before commit. After all: `pnpm test:e2e:clean`.

## Follow-up (not this session) — remaining route files

Inline `trip_members` lookups / owner-co_owner literals still to migrate (count = matching lines):

| File (under `src/routes/`)                                                                                        | Notes                                                        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `(app)/trips/[slug]/closeout/+page.server.ts` (16)                                                                | biggest; many role gates                                     |
| `(app)/trips/[slug]/settings/+page.server.ts` (10)                                                                |                                                              |
| `(app)/trips/[slug]/now/+page.server.ts` (7)                                                                      | #546 overlap — after it merges                               |
| `(app)/trips/[slug]/availability/+page.server.ts` (7)                                                             |                                                              |
| `(app)/trips/[slug]/members/+page.server.ts` (6)                                                                  | `isOwner` data key means Organizer → rename (touches Svelte) |
| `(app)/trips/[slug]/scenarios/[id]`, `scenarios/new`                                                              |                                                              |
| `(app)/trips/[slug]/clone`, `swipe/[phaseId]`, `money-units`, `money`, `expenses`                                 |                                                              |
| `(app)/trips/[slug]/items/[itemId]/edit`, `items/new`                                                             |                                                              |
| `(app)/trips/[slug]/goals`, `goals/capture`, `goals/[goalId]`                                                     | `goals/[goalId]` `isOwner` = Organizer → rename              |
| `(app)/trips/[slug]/budget`                                                                                       | `isOwner` data key = Organizer → rename (touches Svelte)     |
| `(app)/trips/[slug]/inbox`, `lists`, `lists/booking`, `lists/flights`, `today/upcoming`, `export`                 |                                                              |
| `(app)/trips/+page.server.ts`, `(app)/account`, `api/glance`, `api/items/[itemId]/assign-self`, `archive/[token]` | not slug-scoped membership; may only need predicates         |

Many of these read `membership` from `parent()` already and only need the predicates. File as a follow-up issue on landing.
