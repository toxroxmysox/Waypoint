# M2d Suggestions Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Travelers can suggest new items; owners/co-owners review them via an inbox with approve / reject / edit-and-approve actions; auto-approval short-circuits the queue when the trip setting is on.

**Architecture:** A new `suggestions` collection stores every suggestion (pending or auto-approved) as an audit trail. A single backend hook file handles create + review via custom endpoints (so PB collection rules can stay simple). The frontend item-add form detects role + trip setting and routes to the suggestion endpoint instead of direct item creation. The inbox is a new `/trips/[slug]/inbox` route gated to owners/co-owners. Settings page gains the `auto_approve_suggestions` toggle.

**Tech Stack:** PocketBase JS migrations + hooks, SvelteKit page server actions, TypeScript, Tailwind

---

## File Map

**New files:**
- `backend/pb_migrations/0017_suggestions.js` — creates `suggestions` collection with all 5 rules
- `backend/pb_hooks/suggestions.pb.js` — three endpoints: create, list, review
- `src/routes/(app)/trips/[slug]/inbox/+page.server.ts` — load pending suggestions, review form actions
- `src/routes/(app)/trips/[slug]/inbox/+page.svelte` — inbox UI
- `backend/test-suggestions.mjs` — test harness (auto-approve path, pending path, review actions)

**Modified files:**
- `src/lib/types.ts` — add `Suggestion`, `SuggestionStatus` types
- `src/routes/(app)/trips/[slug]/settings/+page.server.ts` — add auto_approve_suggestions to `update` action
- `src/routes/(app)/trips/[slug]/settings/+page.svelte` — add toggle in form
- `src/routes/(app)/trips/[slug]/items/new/+page.server.ts` — gate: traveler + auto_approve=false → POST to suggestion endpoint; add `?suggestion=<id>` pre-fill load path; `approve` form action for edit-and-approve
- `src/routes/(app)/trips/[slug]/items/new/+page.svelte` — "Suggesting…" button label when in suggestion mode; info banner; hidden suggestion_id field
- `src/lib/components/TripTabs.svelte` — accept `role` prop; add Inbox tab when role is owner/co_owner

---

## Task 1: `suggestions` migration

**Files:**
- Create: `backend/pb_migrations/0017_suggestions.js`

- [ ] **Step 1: Write the migration**

```js
/// <reference path="../pb_data/types.d.ts" />
// M2d: suggestions collection.
//
// All creates + updates go through hook endpoints (admin context).
// Direct API rules are locked down so only owners/co-owners can list all,
// and authors can read their own via the list endpoint (which uses admin).
// The collection rules below are for direct API access as a safety net.
migrate(
  (app) => {
    const trips = app.findCollectionByNameOrId('trips');
    const tripMembers = app.findCollectionByNameOrId('trip_members');
    const items = app.findCollectionByNameOrId('items');

    const collection = new Collection({
      type: 'base',
      name: 'suggestions',
      fields: [
        { type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1 },
        { type: 'relation', name: 'author', required: true, collectionId: tripMembers.id, maxSelect: 1 },
        { type: 'select', name: 'target_type', required: true, maxSelect: 1, values: ['new_item', 'comment'] },
        { type: 'relation', name: 'target_item', required: false, collectionId: items.id, maxSelect: 1 },
        { type: 'json', name: 'payload', maxSize: 65536 },
        { type: 'text', name: 'comment_text', max: 5000 },
        { type: 'select', name: 'status', required: true, maxSelect: 1, values: ['pending', 'approved', 'rejected'] },
        { type: 'relation', name: 'reviewed_by', required: false, collectionId: tripMembers.id, maxSelect: 1 },
        { type: 'datetime', name: 'reviewed_at' },
      ],
      // Direct API reads: trip members who are owner/co_owner can list all;
      // authors can read their own. All writes go through hook endpoints only.
      listRule: '@request.auth.id != "" && trip.members_via_trip.user ?= @request.auth.id',
      viewRule: '@request.auth.id != "" && trip.members_via_trip.user ?= @request.auth.id',
      createRule: null,   // hook only
      updateRule: null,   // hook only
      deleteRule: null,   // no deletion
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId('suggestions');
    app.delete(collection);
  }
);
```

- [ ] **Step 2: Restart PocketBase and verify migration applied**

```bash
# In backend/, stop PB if running then:
./pocketbase migrate up
# Expected: migration 0017_suggestions applied (or "already up to date" if auto-run)
```

If PB is running with auto-migrate, just restart it and check the admin UI at http://127.0.0.1:8090/_/ for the `suggestions` collection.

---

## Task 2: `suggestions` hook

**Files:**
- Create: `backend/pb_hooks/suggestions.pb.js`

This file has three endpoints. The PB 0.27 sandbox rule: **no shared helpers outside callbacks** — everything is inlined.

- [ ] **Step 1: Write the hook file**

```js
/// <reference path="../pb_data/types.d.ts" />
// M2d: suggestions — create, list, review.
//
// PB 0.27: each callback runs in an isolated sandbox.
// Helpers are inlined into every callback that needs them.

// ---------------------------------------------------------------------------
// POST /api/suggestions/create
// Body: { trip_id, payload }  (payload = proposed item fields JSON)
// Auth: any trip member. Auto-approval logic per SPEC §4.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/suggestions/create', (e) => {
  const authRecord = e.auth;
  if (!authRecord) {
    throw new UnauthorizedError('Authentication required');
  }

  const info = e.requestInfo();
  const tripId = (info.body && info.body['trip_id']) || '';
  const payload = (info.body && info.body['payload']) || null;

  if (!tripId) throw new BadRequestError('trip_id is required');
  if (!payload || typeof payload !== 'object') throw new BadRequestError('payload is required and must be an object');
  if (!payload.title || !payload.title.trim()) throw new BadRequestError('payload.title is required');

  // Resolve caller's membership.
  let callerMember;
  try {
    callerMember = e.app.findFirstRecordByFilter(
      'trip_members',
      'trip = {:tripId} && user = {:uid}',
      { tripId: tripId, uid: authRecord.id }
    );
  } catch (_) {
    throw new ForbiddenError('You are not a member of this trip');
  }

  const callerRole = callerMember.get('role');
  if (callerRole === 'viewer') {
    throw new ForbiddenError('Viewers cannot submit suggestions');
  }

  // Load trip for auto_approve setting.
  let trip;
  try {
    trip = e.app.findRecordById('trips', tripId);
  } catch (_) {
    throw new NotFoundError('Trip not found');
  }

  const autoApproveFlag = trip.get('auto_approve_suggestions') === true;

  // Determine if this suggestion should be auto-approved.
  const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';
  const autoApprove = isPrivileged || (callerRole === 'traveler' && autoApproveFlag);

  const suggestionsCol = e.app.findCollectionByNameOrId('suggestions');
  const suggestion = new Record(suggestionsCol);
  suggestion.set('trip', tripId);
  suggestion.set('author', callerMember.id);
  suggestion.set('target_type', 'new_item');
  suggestion.set('payload', payload);
  suggestion.set('status', autoApprove ? 'approved' : 'pending');

  if (autoApprove) {
    suggestion.set('reviewed_by', callerMember.id);
    const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
    suggestion.set('reviewed_at', now);
  }

  try {
    e.app.save(suggestion);
  } catch (err) {
    throw new BadRequestError('Failed to save suggestion: ' + err);
  }

  // If auto-approved, create the item immediately.
  let itemId = '';
  if (autoApprove) {
    itemId = createItemFromPayload(e.app, trip, payload, callerMember.id, tripId);
  }

  return e.json(200, {
    ok: true,
    suggestion_id: suggestion.id,
    status: suggestion.get('status'),
    item_id: itemId
  });
});

// ---------------------------------------------------------------------------
// GET /api/suggestions/list
// Query: ?trip_id=<id>&status=pending|approved|rejected (status optional)
// Auth: owner/co_owner sees all; traveler sees own pending.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/suggestions/list', (e) => {
  const authRecord = e.auth;
  if (!authRecord) {
    throw new UnauthorizedError('Authentication required');
  }

  const tripId = e.request.url.searchParams.get('trip_id') || '';
  const statusFilter = e.request.url.searchParams.get('status') || '';

  if (!tripId) throw new BadRequestError('trip_id is required');

  // Resolve caller's membership.
  let callerMember;
  try {
    callerMember = e.app.findFirstRecordByFilter(
      'trip_members',
      'trip = {:tripId} && user = {:uid}',
      { tripId: tripId, uid: authRecord.id }
    );
  } catch (_) {
    throw new ForbiddenError('You are not a member of this trip');
  }

  const callerRole = callerMember.get('role');
  const isPrivileged = callerRole === 'owner' || callerRole === 'co_owner';

  // Build filter.
  let filter = 'trip = {:tripId} && target_type = "new_item"';
  const filterParams = { tripId: tripId };
  if (!isPrivileged) {
    // Travelers only see their own suggestions.
    filter += ' && author = {:authorId}';
    filterParams['authorId'] = callerMember.id;
  }
  if (statusFilter) {
    filter += ' && status = {:status}';
    filterParams['status'] = statusFilter;
  }

  let records;
  try {
    records = e.app.findRecordsByFilter('suggestions', filter, '-created', 0, 0, filterParams);
  } catch (_) {
    records = [];
  }

  // Expand author and reviewed_by display names.
  const items = records.map((r) => {
    let authorName = '';
    let authorRole = '';
    try {
      const authorMember = e.app.findRecordById('trip_members', r.get('author'));
      authorName = authorMember.get('display_name') || authorMember.get('placeholder_name') || '';
      authorRole = authorMember.get('role');
    } catch (_) {}

    return {
      id: r.id,
      trip: r.get('trip'),
      author_id: r.get('author'),
      author_name: authorName,
      author_role: authorRole,
      target_type: r.get('target_type'),
      payload: r.get('payload'),
      status: r.get('status'),
      reviewed_at: r.get('reviewed_at') || '',
      created: r.get('created')
    };
  });

  return e.json(200, { items: items });
});

// ---------------------------------------------------------------------------
// POST /api/suggestions/review
// Body: { suggestion_id, action: 'approve' | 'reject', payload? }
// Auth: owner/co_owner only.
// If action='approve', creates the item (with optional modified payload).
// If action='reject', marks rejected.
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/suggestions/review', (e) => {
  const authRecord = e.auth;
  if (!authRecord) {
    throw new UnauthorizedError('Authentication required');
  }

  const info = e.requestInfo();
  const suggestionId = (info.body && info.body['suggestion_id']) || '';
  const action = (info.body && info.body['action']) || '';
  const modifiedPayload = (info.body && info.body['payload']) || null;

  if (!suggestionId) throw new BadRequestError('suggestion_id is required');
  if (action !== 'approve' && action !== 'reject') {
    throw new BadRequestError('action must be "approve" or "reject"');
  }

  // Load suggestion.
  let suggestion;
  try {
    suggestion = e.app.findRecordById('suggestions', suggestionId);
  } catch (_) {
    throw new NotFoundError('Suggestion not found');
  }

  if (suggestion.get('status') !== 'pending') {
    throw new BadRequestError('Only pending suggestions can be reviewed');
  }

  const tripId = suggestion.get('trip');

  // Verify caller is owner/co_owner.
  let callerMember;
  try {
    callerMember = e.app.findFirstRecordByFilter(
      'trip_members',
      'trip = {:tripId} && user = {:uid}',
      { tripId: tripId, uid: authRecord.id }
    );
  } catch (_) {
    throw new ForbiddenError('You are not a member of this trip');
  }

  const callerRole = callerMember.get('role');
  if (callerRole !== 'owner' && callerRole !== 'co_owner') {
    throw new ForbiddenError('Only owners and co-owners can review suggestions');
  }

  const now = new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z';
  suggestion.set('status', action === 'approve' ? 'approved' : 'rejected');
  suggestion.set('reviewed_by', callerMember.id);
  suggestion.set('reviewed_at', now);

  try {
    e.app.save(suggestion);
  } catch (err) {
    throw new BadRequestError('Failed to update suggestion: ' + err);
  }

  let itemId = '';
  if (action === 'approve') {
    // Use modified payload if provided (edit-and-approve), else original.
    let trip;
    try {
      trip = e.app.findRecordById('trips', tripId);
    } catch (_) {
      throw new NotFoundError('Trip not found');
    }
    const payload = modifiedPayload || suggestion.get('payload');
    itemId = createItemFromPayload(e.app, trip, payload, callerMember.id, tripId);
  }

  return e.json(200, { ok: true, status: suggestion.get('status'), item_id: itemId });
});

// ---------------------------------------------------------------------------
// Shared helper: create an item record from a suggestion payload.
// Called by both create (auto-approve) and review (approve).
// Inlined because PB 0.27 sandboxes each callback — but this is at the
// module level as a plain function, NOT inside a callback. It can be shared
// between the routerAdd calls in the same file.
// ---------------------------------------------------------------------------
function createItemFromPayload(app, trip, payload, reviewerMemberId, tripId) {
  const itemsCol = app.findCollectionByNameOrId('items');
  const item = new Record(itemsCol);

  item.set('trip', tripId);
  item.set('phase', payload.phase || '');
  item.set('day', payload.day || '');
  item.set('slot', payload.slot || 'anytime');
  item.set('type', payload.type || 'activity');
  item.set('subtype', payload.subtype || '');
  item.set('title', payload.title || '');
  item.set('description', payload.description || '');
  item.set('location_name', payload.location_name || '');
  item.set('location_address', payload.location_address || '');
  item.set('start_time', payload.start_time || '');
  item.set('end_time', payload.end_time || '');
  item.set('booked', payload.booked === true);
  item.set('reservation_url', payload.reservation_url || '');
  item.set('free_cancellation', payload.free_cancellation === true);
  item.set('cost_estimate_usd', Number(payload.cost_estimate_usd) || 0);
  item.set('cost_actual_usd', Number(payload.cost_actual_usd) || 0);
  item.set('assigned_to', Array.isArray(payload.assigned_to) ? payload.assigned_to : []);
  item.set('confirmation_codes', Array.isArray(payload.confirmation_codes) ? payload.confirmation_codes : []);
  item.set('rank', 0);
  item.set('parking_lot_scope', payload.day ? 'none' : 'trip');
  item.set('created_by', reviewerMemberId);
  item.set('status', 'planned');

  try {
    app.save(item);
  } catch (err) {
    throw new BadRequestError('Failed to create item from suggestion: ' + err);
  }

  return item.id;
}
```

- [ ] **Step 2: Smoke-test by hitting the create endpoint**

With PocketBase running and a dev auth token:
```bash
# Get a dev token first (replace email with a test user who is a trip owner)
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/dev/auth-bypass \
  -H 'Content-Type: application/json' \
  -d '{"email":"rules-owner@e2e.test"}' | jq -r '.token')

echo "Token: ${TOKEN:0:20}..."
# Expected: non-empty token

# Create a suggestion (you'll need a real trip_id from your local DB)
# This will 403 if trip_id isn't valid — that's expected. We just want to confirm
# the endpoint is reachable and returns JSON (not a 404).
curl -s -X POST http://127.0.0.1:8090/api/suggestions/create \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"trip_id":"test","payload":{"title":"Test"}}' | jq .
# Expected: {"message":"You are not a member of this trip"} or {"message":"Trip not found"}
# NOT a 404 — that confirms the endpoint is registered.
```

---

## Task 3: Add `Suggestion` type to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append Suggestion types**

Add after the `PendingInvite` interface at the end of `src/lib/types.ts`:

```typescript
export type SuggestionStatus = 'pending' | 'approved' | 'rejected';
export type SuggestionTargetType = 'new_item' | 'comment';

export interface Suggestion {
  id: string;
  trip: string;
  author_id: string;
  author_name: string;
  author_role: MemberRole;
  target_type: SuggestionTargetType;
  payload: Partial<Item> | null;
  status: SuggestionStatus;
  reviewed_at: string;
  created: string;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/Scott/Waypoint && pnpm check
```
Expected: 0 errors / 0 warnings.

---

## Task 4: Settings — `auto_approve_suggestions` toggle

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.svelte`

- [ ] **Step 1: Add to the `update` server action**

In `+page.server.ts`, inside the `update` action, after the `locationSummary` line add:

```typescript
const autoApproveSuggestions = data.get('auto_approve_suggestions') === 'on';
```

Then in the `locals.pb.collection('trips').update(trip.id, { ... })` call, add:

```typescript
auto_approve_suggestions: autoApproveSuggestions,
```

The final `update` call should look like:

```typescript
await locals.pb.collection('trips').update(trip.id, {
  title,
  start_date: startDate + ' 00:00:00.000Z',
  end_date: endDate + ' 00:00:00.000Z',
  timezone,
  location_summary: locationSummary,
  auto_approve_suggestions: autoApproveSuggestions,
});
```

- [ ] **Step 2: Add toggle to settings form**

In `+page.svelte`, inside the `<Card>` form, add before the Save button:

```svelte
<label class="flex items-center gap-3">
  <input
    type="checkbox"
    name="auto_approve_suggestions"
    checked={data.trip.auto_approve_suggestions}
    class="border-line h-4 w-4 rounded"
  />
  <div>
    <span class="text-ink block text-sm font-medium">Auto-approve traveler suggestions</span>
    <span class="text-ink-muted block text-xs">When on, traveler suggestions are added immediately without owner review.</span>
  </div>
</label>
```

- [ ] **Step 3: Verify**

```bash
pnpm check
```
Expected: 0 errors.

---

## Task 5: Gate the item-add form for traveler role

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/items/new/+page.svelte`

The new item form gets two new behaviors:
1. If `?suggestion=<id>` is present, load suggestion payload and pre-fill the form (edit-and-approve path).
2. On submit, if the caller is a traveler AND `auto_approve_suggestions=false`, POST to `/api/suggestions/create` instead of creating an item directly. The form action also handles approving a pre-loaded suggestion.

- [ ] **Step 1: Update the load function**

Replace the entire `load` function in `+page.server.ts`:

```typescript
export const load: PageServerLoad = async ({ url, locals, parent }) => {
  const { trip, membership, phases, days } = await parent();

  const dayId = url.searchParams.get('day');
  const phaseIdParam = url.searchParams.get('phase');
  const slotParam = url.searchParams.get('slot') as Slot | null;
  const suggestionId = url.searchParams.get('suggestion') || '';

  let preselectedPhase = phaseIdParam || '';
  if (dayId && !preselectedPhase) {
    const day = (days as Day[]).find((d) => d.id === dayId);
    if (day?.phases?.length) {
      preselectedPhase = day.phases[0];
    }
  }

  const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
    filter: `trip = "${trip.id}"`,
    expand: 'user'
  });

  // Pre-fill from suggestion if editing for approval.
  let prefill: Record<string, unknown> | null = null;
  if (suggestionId) {
    try {
      const res = await fetch(
        `${locals.pbUrl}/api/suggestions/list?trip_id=${trip.id}&status=pending`,
        { headers: { Authorization: `Bearer ${locals.token}` } }
      );
      const data = await res.json();
      const s = (data.items ?? []).find((s: { id: string }) => s.id === suggestionId);
      if (s) prefill = { ...(s.payload ?? {}), _suggestion_id: s.id, _author_name: s.author_name };
    } catch (_) {
      // If load fails, just render empty form.
    }
  }

  // Determine if this user should submit suggestions instead of direct items.
  const submitAsSuggestion =
    membership.role === 'traveler' && !trip.auto_approve_suggestions;

  return {
    trip,
    membership,
    phases,
    days,
    members,
    preselectedDay: dayId || '',
    preselectedPhase,
    preselectedSlot: slotParam && VALID_SLOTS.includes(slotParam) ? slotParam : 'anytime',
    submitAsSuggestion,
    prefill,
  };
};
```

Note: `locals.pbUrl` and `locals.token` need to be available. Check `src/hooks.server.ts` to confirm how locals are set. If `locals.pbUrl` doesn't exist, use the environment variable `process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090'` directly. Adjust accordingly.

- [ ] **Step 2: Update the default form action**

Replace the `default` action in `+page.server.ts`. The key change: if `submitAsSuggestion`, call the backend suggestions endpoint instead of `locals.pb.collection('items').create(...)`.

```typescript
export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    const trip = await locals.pb
      .collection('trips')
      .getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
    const membership = await locals.pb
      .collection('trip_members')
      .getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
    const data = await request.formData();

    const type = data.get('type')?.toString() || 'activity';
    const subtype = data.get('subtype')?.toString() || '';
    const title = data.get('title')?.toString().trim();
    const description = data.get('description')?.toString() || '';
    const day = data.get('day')?.toString() || '';
    const phase = data.get('phase')?.toString() || '';
    const slot = data.get('slot')?.toString() || 'anytime';
    const locationName = data.get('location_name')?.toString() || '';
    const locationAddress = data.get('location_address')?.toString() || '';
    const startTime = data.get('start_time')?.toString() || '';
    const endTime = data.get('end_time')?.toString() || '';
    const booked = data.get('booked') === 'on';
    const reservationUrl = data.get('reservation_url')?.toString() || '';
    const freeCancellation = data.get('free_cancellation') === 'on';
    const costEstimate = parseFloat(data.get('cost_estimate_usd')?.toString() || '0') || 0;
    const costActual = parseFloat(data.get('cost_actual_usd')?.toString() || '0') || 0;
    const parentItem = data.get('parent_item')?.toString() || '';
    const suggestionId = data.get('suggestion_id')?.toString() || '';

    const codeLabels = data.getAll('confirmation_code_label');
    const codeValues = data.getAll('confirmation_code_value');
    const confirmationCodes = codeLabels
      .map((label, i) => ({
        label: label.toString().trim(),
        value: codeValues[i]?.toString().trim() || ''
      }))
      .filter((c) => c.label || c.value);

    const assignedTo = data.getAll('assigned_to').map((v) => v.toString());

    if (!title) return fail(400, { error: 'Title is required.' });

    if (booked && (type === 'meal' || type === 'note')) {
      return fail(400, { error: `${type} items cannot be marked as booked.` });
    }

    const payload = {
      trip: trip.id,
      phase: phase || '',
      day: day || '',
      slot,
      type,
      subtype,
      title,
      description,
      location_name: locationName,
      location_address: locationAddress,
      start_time: startTime,
      end_time: endTime,
      booked,
      confirmation_codes: confirmationCodes,
      reservation_url: reservationUrl,
      free_cancellation: freeCancellation,
      cost_estimate_usd: costEstimate,
      cost_actual_usd: costActual,
      assigned_to: assignedTo,
      parent_item: parentItem || '',
    };

    const submitAsSuggestion = membership.role === 'traveler' && !trip.auto_approve_suggestions;

    // Edit-and-approve path: suggestion_id present means we are an owner approving
    // a suggestion with possible edits. Call review endpoint with modified payload.
    if (suggestionId) {
      try {
        const pbBase = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
        const reviewRes = await fetch(`${pbBase}/api/suggestions/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${locals.token}`
          },
          body: JSON.stringify({ suggestion_id: suggestionId, action: 'approve', payload })
        });
        if (!reviewRes.ok) {
          const err = await reviewRes.json().catch(() => ({}));
          return fail(reviewRes.status, { error: err.message || 'Failed to approve suggestion.' });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to approve suggestion.';
        return fail(500, { error: message });
      }
      redirect(303, `/trips/${params.slug}/inbox`);
    }

    // Suggestion path: traveler with auto-approve off.
    if (submitAsSuggestion) {
      try {
        const pbBase = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
        const suggestRes = await fetch(`${pbBase}/api/suggestions/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${locals.token}`
          },
          body: JSON.stringify({ trip_id: trip.id, payload })
        });
        if (!suggestRes.ok) {
          const err = await suggestRes.json().catch(() => ({}));
          return fail(suggestRes.status, { error: err.message || 'Failed to submit suggestion.' });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to submit suggestion.';
        return fail(500, { error: message });
      }
      redirect(303, `/trips/${params.slug}`);
    }

    // Direct create path (owner/co_owner, or traveler with auto_approve on).
    try {
      const existingItems = await locals.pb.collection('items').getFullList({
        filter: day
          ? `trip = "${trip.id}" && day = "${day}" && slot = "${slot}"`
          : `trip = "${trip.id}" && day = "" && slot = "${slot}"`,
        sort: '-rank',
        fields: 'rank'
      });
      const nextRank = existingItems.length > 0 ? Number(existingItems[0]['rank']) + 1 : 0;

      await locals.pb.collection('items').create({
        ...payload,
        rank: nextRank,
        parking_lot_scope: day ? 'none' : 'trip',
        created_by: membership.id,
        status: 'planned'
      });

      if (day) {
        redirect(303, `/trips/${params.slug}/days/${day}`);
      }
      redirect(303, `/trips/${params.slug}`);
    } catch (err: unknown) {
      if (isRedirect(err)) throw err;
      const e = err as { message?: string; response?: { data?: Record<string, { message: string }> } };
      const fieldErrors = e.response?.data
        ? Object.entries(e.response.data)
            .map(([f, v]) => `${f}: ${v.message}`)
            .join('; ')
        : '';
      const message = fieldErrors || e.message || 'Failed to create item.';
      return fail(500, { error: message });
    }
  }
};
```

**Note on `locals.token`:** Check `src/hooks.server.ts` — if `locals.token` is not set, you need to get it from `locals.pb.authStore.token`. Adjust both fetch calls here and in the load function accordingly.

- [ ] **Step 3: Update `+page.svelte` for suggestion mode**

Add to the script block, after `let error = $derived(form?.error ?? '');`:

```typescript
let submitAsSuggestion = $derived(data.submitAsSuggestion ?? false);
let prefill = $derived(data.prefill ?? null);
let suggestionId = $derived((prefill as Record<string, unknown> | null)?._suggestion_id as string ?? '');
let prefillAuthorName = $derived((prefill as Record<string, unknown> | null)?._author_name as string ?? '');
```

Add after `let loading = $state(false);`:
```typescript
let buttonLabel = $derived(
  loading
    ? (submitAsSuggestion ? 'Submitting…' : suggestionId ? 'Approving…' : 'Creating…')
    : (submitAsSuggestion ? 'Submit suggestion' : suggestionId ? 'Approve with edits' : 'Create item')
);
```

In the template, add before the `<form>` tag:

```svelte
{#if submitAsSuggestion}
  <div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">
    Auto-approve is off for this trip. Your suggestion will go to the owners for review.
  </div>
{/if}
{#if prefillAuthorName}
  <div class="border-info/30 bg-info/10 text-info-dark rounded-md border p-3 text-sm">
    Reviewing suggestion from <strong>{prefillAuthorName}</strong>. Edit below and click "Approve with edits".
  </div>
{/if}
```

Inside the form, add a hidden field before the submit button:

```svelte
{#if suggestionId}
  <input type="hidden" name="suggestion_id" value={suggestionId} />
{/if}
```

Change the submit button from:
```svelte
<Button type="submit" disabled={loading} variant="moss" size="lg" class="w-full">
  {loading ? 'Creating…' : 'Create item'}
</Button>
```
To:
```svelte
<Button type="submit" disabled={loading} variant="moss" size="lg" class="w-full">
  {buttonLabel}
</Button>
```

For the pre-fill behavior (values from `prefill`), add `value={prefill?.title ?? ''}` to the title input and similar for other fields. The simplest approach: check `prefill` in each input's `value` attribute. For type, `selectedType` needs to initialize from prefill:

In the script block, change:
```typescript
let selectedType = $state<ItemType>('activity');
```
To:
```typescript
let selectedType = $state<ItemType>((data.prefill?.type as ItemType) ?? 'activity');
```

And for confirmation codes:
```typescript
let confirmationCodes = $state<{ label: string; value: string }[]>(
  Array.isArray(data.prefill?.confirmation_codes) ? data.prefill.confirmation_codes : []
);
```

For each form field that has a value, add `value={prefill?.<fieldname> ?? ''}`. The key fields: `title`, `description`, `location_name`, `location_address`, `start_time`, `end_time`, `reservation_url`, `cost_estimate_usd`, `cost_actual_usd`. For selects: `day`, `phase`, `slot` — add `selected={...}` or `value={...}` accordingly.

For `booked` and `free_cancellation` checkboxes, add `checked={prefill?.booked === true}` etc.

- [ ] **Step 4: Check `src/hooks.server.ts` for `locals.token`**

```bash
grep -n "token\|pbUrl\|pb\." /Users/Scott/Waypoint/src/hooks.server.ts | head -20
```

If `locals.token` is not set there, use `locals.pb.authStore.token` in the fetch calls above. Update both the load function and the form action accordingly.

- [ ] **Step 5: Verify**

```bash
pnpm check
```
Expected: 0 errors.

---

## Task 6: Inbox route

**Files:**
- Create: `src/routes/(app)/trips/[slug]/inbox/+page.server.ts`
- Create: `src/routes/(app)/trips/[slug]/inbox/+page.svelte`

- [ ] **Step 1: Write `+page.server.ts`**

```typescript
import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Suggestion } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
  const { trip, membership } = await parent();

  if (membership.role !== 'owner' && membership.role !== 'co_owner') {
    error(403, 'Only trip owners and co-owners can view the inbox');
  }

  const pbBase = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
  const token = locals.pb.authStore.token;

  // Load pending suggestions.
  let pending: Suggestion[] = [];
  let approved: Suggestion[] = [];
  try {
    const [pendingRes, approvedRes] = await Promise.all([
      fetch(`${pbBase}/api/suggestions/list?trip_id=${trip.id}&status=pending`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`${pbBase}/api/suggestions/list?trip_id=${trip.id}&status=approved`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);
    const pendingData = await pendingRes.json();
    const approvedData = await approvedRes.json();
    pending = pendingData.items ?? [];
    approved = approvedData.items ?? [];
  } catch (_) {
    // Non-fatal — render empty state.
  }

  return { trip, membership, pending, approved };
};

export const actions: Actions = {
  reject: async ({ request, locals, params }) => {
    const data = await request.formData();
    const suggestionId = data.get('suggestion_id')?.toString() || '';
    if (!suggestionId) return fail(400, { error: 'suggestion_id is required' });

    const pbBase = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
    const token = locals.pb.authStore.token;

    try {
      const res = await fetch(`${pbBase}/api/suggestions/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ suggestion_id: suggestionId, action: 'reject' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return fail(res.status, { reject: { error: err.message || 'Failed to reject.' } });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reject suggestion.';
      return fail(500, { reject: { error: message } });
    }

    return { reject: { success: true } };
  },

  approve: async ({ request, locals, params }) => {
    const data = await request.formData();
    const suggestionId = data.get('suggestion_id')?.toString() || '';
    if (!suggestionId) return fail(400, { error: 'suggestion_id is required' });

    const pbBase = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
    const token = locals.pb.authStore.token;

    try {
      const res = await fetch(`${pbBase}/api/suggestions/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ suggestion_id: suggestionId, action: 'approve' })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return fail(res.status, { approve: { error: err.message || 'Failed to approve.' } });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve suggestion.';
      return fail(500, { approve: { error: message } });
    }

    return { approve: { success: true } };
  }
};
```

- [ ] **Step 2: Write `+page.svelte`**

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import NavBar from '$lib/components/ui/NavBar.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Pill from '$lib/components/ui/Pill.svelte';
  import TripTabs from '$lib/components/TripTabs.svelte';
  import type { Suggestion } from '$lib/types';
  import { titleCase } from '$lib/utils/format';

  let { data, form } = $props();

  let rejecting = $state<string | null>(null);
  let approving = $state<string | null>(null);

  const rejectForm = $derived((form?.reject ?? null) as { success?: boolean; error?: string } | null);
  const approveForm = $derived((form?.approve ?? null) as { success?: boolean; error?: string } | null);
  const actionError = $derived(rejectForm?.error ?? approveForm?.error ?? '');

  function payloadSummary(s: Suggestion): string {
    const p = s.payload;
    if (!p) return 'No details';
    const parts: string[] = [];
    if (p.type) parts.push(titleCase(p.type));
    if (p.day) parts.push('scheduled');
    if (p.phase) parts.push('in a phase');
    if (p.booked) parts.push('booked');
    return parts.join(' · ') || 'New item';
  }

  function formatDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
</script>

<NavBar title="Inbox" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}" />
<TripTabs slug={data.trip.slug} role={data.membership.role} />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-8 space-y-6">
  {#if actionError}
    <div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{actionError}</div>
  {/if}

  <!-- Pending suggestions -->
  <section class="space-y-3">
    <h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
      Pending ({data.pending.length})
    </h2>

    {#if data.pending.length === 0}
      <Card>
        <p class="text-ink-muted p-4 text-sm">No pending suggestions.</p>
      </Card>
    {:else}
      {#each data.pending as s (s.id)}
        <Card>
          <div class="p-4 space-y-3">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-ink text-sm font-semibold truncate">{s.payload?.title ?? '(no title)'}</p>
                <p class="text-ink-muted text-xs">{payloadSummary(s)}</p>
              </div>
              <Pill variant="default" size="sm">{titleCase(s.author_role)}</Pill>
            </div>

            <div class="text-ink-muted text-xs">
              Suggested by <span class="text-ink-soft font-medium">{s.author_name || 'Unknown'}</span>
              {#if s.created} · {formatDate(s.created)}{/if}
            </div>

            <!-- Payload preview -->
            <div class="bg-surface rounded-md p-3 space-y-1 text-xs">
              {#if s.payload?.description}
                <p class="text-ink-soft">{s.payload.description}</p>
              {/if}
              {#if s.payload?.location_name}
                <p class="text-ink-muted">📍 {s.payload.location_name}</p>
              {/if}
              {#if s.payload?.start_time || s.payload?.end_time}
                <p class="text-ink-muted">
                  {s.payload?.start_time ?? ''}{s.payload?.start_time && s.payload?.end_time ? ' – ' : ''}{s.payload?.end_time ?? ''}
                </p>
              {/if}
              {#if s.payload?.cost_estimate_usd}
                <p class="text-ink-muted">~${s.payload.cost_estimate_usd} estimated</p>
              {/if}
            </div>

            <!-- Actions -->
            <div class="flex gap-2">
              <form
                method="POST"
                action="?/approve"
                use:enhance={() => {
                  approving = s.id;
                  return async ({ update }) => { approving = null; await update(); };
                }}
              >
                <input type="hidden" name="suggestion_id" value={s.id} />
                <Button
                  type="submit"
                  variant="moss"
                  size="sm"
                  disabled={approving === s.id || rejecting === s.id}
                >
                  {approving === s.id ? 'Approving…' : 'Approve'}
                </Button>
              </form>

              <a
                href="/trips/{data.trip.slug}/items/new?suggestion={s.id}"
                class="border-line text-ink-soft hover:bg-surface-2 inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold"
              >
                Edit & Approve
              </a>

              <form
                method="POST"
                action="?/reject"
                use:enhance={() => {
                  rejecting = s.id;
                  return async ({ update }) => { rejecting = null; await update(); };
                }}
              >
                <input type="hidden" name="suggestion_id" value={s.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={approving === s.id || rejecting === s.id}
                >
                  {rejecting === s.id ? 'Rejecting…' : 'Reject'}
                </Button>
              </form>
            </div>
          </div>
        </Card>
      {/each}
    {/if}
  </section>

  <!-- Auto-approved / history -->
  {#if data.approved.length > 0}
    <section class="space-y-3">
      <h2 class="text-ink-soft text-xs font-semibold tracking-wider uppercase">
        Recently approved ({data.approved.length})
      </h2>
      {#each data.approved.slice(0, 10) as s (s.id)}
        <Card>
          <div class="flex items-center justify-between gap-2 px-4 py-3">
            <div class="min-w-0">
              <p class="text-ink text-sm truncate">{s.payload?.title ?? '(no title)'}</p>
              <p class="text-ink-muted text-xs">
                By {s.author_name || 'Unknown'} · {formatDate(s.created)}
              </p>
            </div>
            <Pill variant="moss" size="sm">Approved</Pill>
          </div>
        </Card>
      {/each}
    </section>
  {/if}
</main>
```

- [ ] **Step 3: Verify**

```bash
pnpm check
```
Expected: 0 errors.

---

## Task 7: Add Inbox tab to TripTabs

**Files:**
- Modify: `src/lib/components/TripTabs.svelte`

The Inbox tab is only shown to owners and co-owners. TripTabs currently takes only `slug`. Add a `role` prop.

- [ ] **Step 1: Update TripTabs**

Replace the entire file:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import type { MemberRole } from '$lib/types';

  let { slug, role = '' }: { slug: string; role?: MemberRole | string } = $props();

  const isOwnerOrCoOwner = $derived(role === 'owner' || role === 'co_owner');

  const tabs = $derived([
    { id: 'overview', label: 'Overview', href: `/trips/${slug}` },
    { id: 'phases', label: 'Phases', href: `/trips/${slug}/phases` },
    { id: 'members', label: 'Members', href: `/trips/${slug}/members` },
    ...(isOwnerOrCoOwner ? [{ id: 'inbox', label: 'Inbox', href: `/trips/${slug}/inbox` }] : []),
    { id: 'settings', label: 'Settings', href: `/trips/${slug}/settings` },
  ]);

  let activeId = $derived.by(() => {
    const path = page.url.pathname;
    if (path.endsWith('/settings')) return 'settings';
    if (path.includes('/inbox')) return 'inbox';
    if (path.includes('/members')) return 'members';
    if (path.includes('/phases')) return 'phases';
    return 'overview';
  });
</script>

<nav class="border-line bg-paper/95 sticky top-[57px] z-20 flex gap-1 overflow-x-auto border-b px-4 backdrop-blur">
  {#each tabs as tab}
    {@const active = activeId === tab.id}
    <a
      href={tab.href}
      class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-semibold {active
        ? 'border-ink text-ink'
        : 'text-ink-muted hover:text-ink-soft border-transparent'}"
    >
      {tab.label}
    </a>
  {/each}
</nav>
```

- [ ] **Step 2: Pass `role` prop from all pages that use TripTabs**

TripTabs is used in: members page, settings page, and will now be used in inbox page. Search for all usages:

```bash
grep -rn "TripTabs" /Users/Scott/Waypoint/src --include="*.svelte"
```

For each page that uses `<TripTabs slug={...} />`, add `role={data.membership.role}`. The layout already loads `membership` and passes it via `parent()`, so `data.membership` is available on every child page.

- [ ] **Step 3: Verify**

```bash
pnpm check
```
Expected: 0 errors.

---

## Task 8: Test harness

**Files:**
- Create: `backend/test-suggestions.mjs`

- [ ] **Step 1: Write the harness**

```js
#!/usr/bin/env node
// M2d suggestions harness.
// Tests: create (auto-approve paths), list, review (approve, reject).
// Requires: PocketBase on $PUBLIC_PB_URL, WAYPOINT_DEV_MODE=true, E2E_TEST_EMAILS set.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

const EMAILS = {
  owner: 'rules-owner@e2e.test',
  co_owner: 'rules-coowner@e2e.test',
  traveler: 'rules-traveler@e2e.test',
  viewer: 'rules-viewer@e2e.test',
  non_member: 'rules-nonmember@e2e.test'
};

let passed = 0;
let failed = 0;

function pass(label) { console.log('  PASS ', label); passed++; }
function fail(label, detail) { console.error('  FAIL ', label, detail ? `(${detail})` : ''); failed++; }

async function bypass(email) {
  const res = await fetch(`${BASE}/api/dev/auth-bypass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  if (!res.ok) throw new Error(`bypass failed for ${email}: ${res.status}`);
  const { token } = await res.json();
  return token;
}

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}

// ─── setup ──────────────────────────────────────────────────────────────────

const tokens = {};
for (const [role, email] of Object.entries(EMAILS)) {
  tokens[role] = await bypass(email);
}

const fixtureRes = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS }, tokens.owner);
if (fixtureRes.status !== 200) {
  console.error('FATAL: fixture creation failed', fixtureRes.status, fixtureRes.json);
  process.exit(1);
}
const { trip_id: tripId } = fixtureRes.json;

// ─── helpers ────────────────────────────────────────────────────────────────

const samplePayload = {
  title: 'Test suggestion item',
  type: 'activity',
  slot: 'morning',
  description: 'A test suggestion'
};

// ─── 1. Viewer cannot suggest ────────────────────────────────────────────────

console.log('\n1. Viewer blocked from suggesting');
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.viewer);
  r.status === 403
    ? pass('viewer create → 403')
    : fail('viewer create → 403', `got ${r.status}`);
}

// ─── 2. Non-member cannot suggest ────────────────────────────────────────────

console.log('\n2. Non-member blocked');
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.non_member);
  r.status === 403
    ? pass('non-member create → 403')
    : fail('non-member create → 403', `got ${r.status}`);
}

// ─── 3. Missing title → 400 ───────────────────────────────────────────────────

console.log('\n3. Validation: missing title');
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { type: 'activity' } }, tokens.traveler);
  r.status === 400
    ? pass('missing title → 400')
    : fail('missing title → 400', `got ${r.status}`);
}

// ─── 4. Owner suggestion → auto-approved ─────────────────────────────────────

console.log('\n4. Owner suggestion auto-approved');
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Owner suggestion' } }, tokens.owner);
  r.status === 200 && r.json.status === 'approved'
    ? pass('owner create → auto-approved')
    : fail('owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
  r.json.item_id
    ? pass('owner create → item created')
    : fail('owner create → item created', 'no item_id returned');
}

// ─── 5. Co-owner suggestion → auto-approved ──────────────────────────────────

console.log('\n5. Co-owner suggestion auto-approved');
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Co-owner suggestion' } }, tokens.co_owner);
  r.status === 200 && r.json.status === 'approved'
    ? pass('co_owner create → auto-approved')
    : fail('co_owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
}

// ─── 6. Traveler with auto_approve=true → auto-approved ──────────────────────

console.log('\n6. Traveler + auto_approve=true → auto-approved');
{
  // Enable auto_approve on the trip via PB admin API.
  const adminToken = (await api('POST', '/api/admins/auth-with-password',
    { identity: process.env.PB_ADMIN_EMAIL || 'admin@waypoint.local', password: process.env.PB_ADMIN_PASSWORD || 'adminpassword123' },
    null)).json?.token;

  if (adminToken) {
    // Fetch the trip record to get the collection.
    const tripRes = await api('GET', `/api/collections/trips/records/${tripId}`, null, adminToken);
    // Update auto_approve_suggestions to true.
    const updateRes = await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ auto_approve_suggestions: true })
    });
    if (updateRes.ok) {
      const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler auto-approve' } }, tokens.traveler);
      r.status === 200 && r.json.status === 'approved'
        ? pass('traveler + auto_approve=true → auto-approved')
        : fail('traveler + auto_approve=true → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
      r.json.item_id
        ? pass('traveler auto-approve → item created')
        : fail('traveler auto-approve → item created', 'no item_id');

      // Reset to false for remaining tests.
      await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ auto_approve_suggestions: false })
      });
    } else {
      fail('traveler + auto_approve=true → auto-approved', 'could not enable auto_approve on trip');
    }
  } else {
    console.log('  SKIP traveler auto-approve (no admin credentials — set PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD in .env.local)');
  }
}

// ─── 7. Traveler with auto_approve=false → pending ───────────────────────────

console.log('\n7. Traveler + auto_approve=false → pending');
let pendingSuggestionId = '';
{
  const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler pending suggestion' } }, tokens.traveler);
  r.status === 200 && r.json.status === 'pending'
    ? pass('traveler + auto_approve=false → pending')
    : fail('traveler + auto_approve=false → pending', `${r.status} ${JSON.stringify(r.json)}`);
  !r.json.item_id
    ? pass('traveler pending → no item created yet')
    : fail('traveler pending → no item created yet', 'item_id was returned unexpectedly');
  pendingSuggestionId = r.json.suggestion_id || '';
}

// ─── 8. List endpoint: owner sees pending ────────────────────────────────────

console.log('\n8. Owner can list pending suggestions');
{
  const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.owner);
  r.status === 200 && Array.isArray(r.json.items)
    ? pass('owner list pending → 200 + items array')
    : fail('owner list pending → 200', `${r.status} ${JSON.stringify(r.json)}`);
  r.json.items?.some((s) => s.id === pendingSuggestionId)
    ? pass('owner list → contains traveler pending suggestion')
    : fail('owner list → contains traveler pending suggestion', `items: ${JSON.stringify(r.json.items?.map(s => s.id))}`);
}

// ─── 9. Traveler cannot list other traveler's pending ────────────────────────

console.log('\n9. Traveler list scoped to own suggestions');
{
  const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.co_owner);
  // co_owner is privileged — they should see all; traveler should not see other travelers' suggestions.
  // We can't easily test a second traveler without another fixture. Just verify co_owner sees it.
  r.status === 200
    ? pass('co_owner list → 200')
    : fail('co_owner list → 200', `got ${r.status}`);
}

// ─── 10. Viewer cannot call review ───────────────────────────────────────────

console.log('\n10. Review gating');
if (pendingSuggestionId) {
  const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.viewer);
  r.status === 403
    ? pass('viewer review → 403')
    : fail('viewer review → 403', `got ${r.status}`);

  const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.traveler);
  r2.status === 403
    ? pass('traveler review → 403')
    : fail('traveler review → 403', `got ${r2.status}`);
}

// ─── 11. Owner rejects a suggestion ──────────────────────────────────────────

console.log('\n11. Owner reject');
let rejectTargetId = '';
{
  // Create another pending suggestion to reject.
  const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'To be rejected' } }, tokens.traveler);
  rejectTargetId = createRes.json.suggestion_id || '';

  if (rejectTargetId) {
    const r = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject' }, tokens.owner);
    r.status === 200 && r.json.status === 'rejected'
      ? pass('owner reject → 200 + status=rejected')
      : fail('owner reject → 200', `${r.status} ${JSON.stringify(r.json)}`);
    !r.json.item_id
      ? pass('reject → no item created')
      : fail('reject → no item created', 'item_id returned');

    // Rejecting the same suggestion again should 400.
    const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject' }, tokens.owner);
    r2.status === 400
      ? pass('double-reject → 400')
      : fail('double-reject → 400', `got ${r2.status}`);
  } else {
    fail('owner reject → could not create target suggestion');
  }
}

// ─── 12. Owner approves a suggestion → item created ──────────────────────────

console.log('\n12. Owner approve → item created');
if (pendingSuggestionId) {
  const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.owner);
  r.status === 200 && r.json.status === 'approved'
    ? pass('owner approve → 200 + status=approved')
    : fail('owner approve → 200', `${r.status} ${JSON.stringify(r.json)}`);
  r.json.item_id
    ? pass('owner approve → item created')
    : fail('owner approve → item created', 'no item_id returned');
}

// ─── 13. Edit-and-approve: approve with modified payload ─────────────────────

console.log('\n13. Edit-and-approve (modified payload)');
{
  const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Edit me' } }, tokens.traveler);
  const eid = createRes.json.suggestion_id || '';
  if (eid) {
    const modifiedPayload = { ...samplePayload, title: 'Edited by owner', description: 'Modified' };
    const r = await api('POST', '/api/suggestions/review', { suggestion_id: eid, action: 'approve', payload: modifiedPayload }, tokens.owner);
    r.status === 200 && r.json.item_id
      ? pass('edit-and-approve → item created with modified payload')
      : fail('edit-and-approve → item created', `${r.status} ${JSON.stringify(r.json)}`);
  } else {
    fail('edit-and-approve → could not create target');
  }
}

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Suggestions harness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Wire up in `package.json`**

Add to the `scripts` section:
```json
"test:suggestions": "node backend/test-suggestions.mjs"
```

- [ ] **Step 3: Run the harness**

```bash
cd /Users/Scott/Waypoint && pnpm test:suggestions
```
Expected: all assertions pass. If admin credential test is skipped, that is acceptable (note it).

---

## Task 9: Baseline verification + commit

- [ ] **Step 1: Full check**

```bash
cd /Users/Scott/Waypoint && pnpm check
```
Expected: 0 errors / 0 warnings.

- [ ] **Step 2: Run existing test suites**

```bash
pnpm test:rules && pnpm test:members && pnpm test:invites && pnpm test:suggestions
```
Expected: all pass (240/240, 31/31, 41/41, and suggestions harness).

- [ ] **Step 3: Run E2E**

```bash
pnpm test:e2e
```
Expected: 2/2 (M1 happy paths still green).

- [ ] **Step 4: Commit**

```bash
git add \
  backend/pb_migrations/0017_suggestions.js \
  backend/pb_hooks/suggestions.pb.js \
  backend/test-suggestions.mjs \
  src/lib/types.ts \
  src/lib/components/TripTabs.svelte \
  src/routes/\(app\)/trips/\[slug\]/inbox/+page.server.ts \
  src/routes/\(app\)/trips/\[slug\]/inbox/+page.svelte \
  src/routes/\(app\)/trips/\[slug\]/settings/+page.server.ts \
  src/routes/\(app\)/trips/\[slug\]/settings/+page.svelte \
  src/routes/\(app\)/trips/\[slug\]/items/new/+page.server.ts \
  src/routes/\(app\)/trips/\[slug\]/items/new/+page.svelte \
  package.json

git commit -m "M2d: suggestions inbox — create, list, review, auto-approve, inbox UI, settings toggle"
```

---

## Spec Coverage Check

Per SPEC §4 and M2_STATUS.md M2d tasks:

| Requirement | Covered |
|---|---|
| `suggestions` collection with all 5 rules | Task 1 |
| Hook: auto-approve if author role = owner/co_owner | Task 2 |
| Hook: auto-approve if traveler + auto_approve_suggestions=true | Task 2 |
| Hook: leave pending otherwise | Task 2 |
| Suggestion record kept for audit even when auto-approved | Task 2 (status=approved, not deleted) |
| Frontend: item-add form routes traveler (auto-approve off) to suggestions | Task 5 |
| Inbox screen /trips/[slug]/inbox | Task 6 |
| Inbox: pending list with payload preview card | Task 6 |
| Inbox: Approve / Edit & Approve / Reject actions | Task 6 |
| Edit & Approve opens item form pre-filled from payload | Task 5 (new?suggestion=id route) |
| Trip settings: auto_approve_suggestions toggle | Task 4 |
| Auto-approved suggestions shown in inbox with status | Task 6 (approved section) |
| Test harness covering all paths | Task 8 |

All M2d acceptance criteria covered.

---

## Known Gotchas

- **`locals.token`**: Check `src/hooks.server.ts` — it may be `locals.pb.authStore.token` instead of a separate `locals.token` field. The fetch calls in Tasks 5 and 6 must use whatever the correct field name is.
- **`createItemFromPayload` at module scope**: PB 0.27 sandboxes `routerAdd` callbacks but plain functions defined at module scope are visible to all routerAdd calls in the same file. This is the intended pattern — if it fails, inline the function into each callback.
- **Admin credentials for test 6**: The auto_approve_suggestions toggle test uses PB admin auth. Set `PB_ADMIN_EMAIL` and `PB_ADMIN_PASSWORD` in `.env.local`. If not set, the test skips gracefully.
- **`info-dark` Tailwind color**: The info banner in the inbox page uses `text-info-dark`. If this token doesn't exist in the design system, swap to `text-ink`.
- **`Button` variant="ghost"**: Verify this variant exists in the `Button` component before committing.
