# M5 — Closure: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trip ends well; archive lives on. Closeout wizard walks users through marking items done/skipped. Public archive view lets non-members browse the trip. JSON export/import for backup and portability.

**Architecture:** Five sub-milestones. M5a front-loads all backend (migrations, hooks, types, utility functions). M5b builds the closeout wizard UI. M5c builds the public archive view. M5d adds JSON export/import. M5e is E2E tests + polish. Each sub-milestone ends with `pnpm check` clean and a commit.

**Tech Stack:** SvelteKit + TypeScript + Tailwind (frontend), PocketBase 0.27 (backend), `crypto.randomBytes` (token generation).

---

## Key Design Decisions

1. **New `considered` status.** `ItemStatus` becomes `'planned' | 'done' | 'considered'`. Requires a migration to add the option to the items collection. "Skipped" items during closeout stay as `planned`. "Did something else" marks the original as `considered`.

2. **"Did something else" creates a new `done` item; original becomes `considered`.** The closeout wizard's inline quick-add creates a replacement item with `status: done`. The original item is updated to `status: 'considered'` (explicitly reviewed but not done).

3. **"Skipped" items stay as `planned`.** No status change. In the archive, both `planned` and `considered` items appear in the "What we considered" section — things that were on the itinerary but didn't happen.

4. **Auto-publish is on-demand, not cron.** When `/archive/[token]` is hit, check `end_date + archive_publish_after_days` against today. If past, serve the archive. Owner can also manually enable archive early via trip settings.

5. **JSON import creates a new trip only.** No merge/overwrite. Clean and safe.

6. **Public archive strips all PII.** Zero member names, zero expenses, zero vault entries. Only: trip title, dates, location, done items (title, location, times, type), phases, days, photo album link.

7. **`public_share_token` generated on first archive enable.** 32-byte random hex string, generated server-side when owner enables archive or when closeout wizard completes.

8. **Admin auth for public archive reads.** The `/archive/[token]` loader uses PB admin credentials to bypass collection rules. Simpler than modifying view rules across 4+ collections. Admin creds already in `.env.local`.

9. **Archive route is outside `(app)`.** No auth required. Standalone public page with its own minimal layout — no NavBar, no BottomNav.

10. **Closeout wizard is online-only.** Blocked with a message if offline. One-time operation, not worth offline complexity.

11. **Export includes budget totals/categories but excludes individual expenses and settlements.** Member-specific amounts don't round-trip cleanly.

---

## Sub-Milestone Overview

| Sub-milestone | Scope | Depends on |
|---|---|---|
| **M5a** | Migration (`considered` status), archive settings actions, token generation, export/import utils | -- |
| **M5b** | Closeout Wizard UI (full-screen guided flow) | M5a |
| **M5c** | Public Archive view (`/archive/[token]`) | M5a |
| **M5d** | JSON export + import UI | M5a |
| **M5e** | E2E tests + polish | M5a-M5d |

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `backend/pb_migrations/0026_item_considered_status.js` | Migration: add `considered` to items status field options |
| `src/lib/utils/archive-token.ts` | Server-side: generate URL-safe random token (32 bytes hex) |
| `src/lib/utils/export.ts` | Build JSON export payload from trip data |
| `src/lib/utils/export.test.ts` | Unit tests for export builder |
| `src/lib/utils/import.ts` | Parse and validate JSON import, create trip + related records |
| `src/lib/utils/import.test.ts` | Unit tests for import parser/validator |
| `src/routes/(app)/trips/[slug]/closeout/+page.server.ts` | Closeout wizard server: load all days/items, handle mark-done/skip/replace actions |
| `src/routes/(app)/trips/[slug]/closeout/+page.svelte` | Closeout wizard UI: day-by-day, slot-by-slot guided flow |
| `src/lib/components/CloseoutDayCard.svelte` | Single day card within closeout wizard showing items by slot |
| `src/lib/components/CloseoutItemRow.svelte` | Single item row with Done/Did something else/Skip buttons |
| `src/lib/components/InlineQuickAdd.svelte` | Inline quick-add form for "did something else" replacement items |
| `src/routes/archive/[token]/+page.server.ts` | Public archive data loader (no auth required) |
| `src/routes/archive/[token]/+page.svelte` | Public archive view: read-only trip retrospective |
| `src/lib/components/ArchiveDaySection.svelte` | Archive day section: done items grouped by slot |
| `src/routes/(app)/trips/[slug]/export/+server.ts` | JSON export endpoint (GET, returns downloadable JSON file) |
| `src/routes/(app)/trips/import/+page.server.ts` | JSON import server action: validate + create trip |
| `src/routes/(app)/trips/import/+page.svelte` | JSON import UI: file upload + preview + confirm |
| `tests/e2e/m5-closure.spec.ts` | M5 Playwright happy-path tests |

### Modified files

| File | Changes |
|---|---|
| `src/routes/(app)/trips/[slug]/settings/+page.server.ts` | Add `toggleArchive` action (enable/disable archive, generate token) |
| `src/routes/(app)/trips/[slug]/settings/+page.svelte` | Add archive settings section (enable toggle, publish delay, share URL) |
| `src/routes/(app)/trips/[slug]/more/+page.svelte` | Add closeout wizard link (owner/co-owner only), add export link |
| `src/routes/(app)/trips/+page.svelte` | Add import button on trips list page |
| `src/lib/types.ts` | Add `'considered'` to ItemStatus, add TripExport interface |

---

## M5a -- Backend Foundation

### Task 1: Migration + ItemStatus Update

**Files:**
- Create: `backend/pb_migrations/0026_item_considered_status.js`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the migration**

Adds `considered` to the items collection's status select field options. Follows existing migration pattern from `0006_items.js`.

```javascript
/// <reference path="../pb_data/types.d.ts" />

migrate(
	(app) => {
		const collection = app.findCollectionByNameOrId('items');
		const statusField = collection.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered'];
		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('items');
		const statusField = collection.fields.getByName('status');
		statusField.values = ['planned', 'done'];
		app.save(collection);
	}
);
```

- [ ] **Step 2: Update ItemStatus type**

In `src/lib/types.ts`, change:
```typescript
export type ItemStatus = 'planned' | 'done' | 'considered';
```

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/0026_item_considered_status.js src/lib/types.ts
git commit -m "M5a: add 'considered' status to items collection + type"
```

### Task 2: Archive Token Utility

**Files:**
- Create: `src/lib/utils/archive-token.ts`

- [ ] **Step 1: Write the utility**

Server-side only. Generates a cryptographically random URL-safe token.

```typescript
import { randomBytes } from 'crypto';

export function generateArchiveToken(): string {
	return randomBytes(32).toString('hex');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/utils/archive-token.ts
git commit -m "M5a: add archive token generator utility"
```

### Task 3: Archive Settings Action

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.server.ts`

- [ ] **Step 1: Add `toggleArchive` action**

Add a new form action that:
1. Reads `archive_enabled` (boolean toggle) and `archive_publish_after_days` (number, default 7) from form data
2. Verifies the user is owner/co-owner
3. If enabling archive and `public_share_token` is empty, generates one via `generateArchiveToken()`
4. Updates the trip record with `archive_enabled`, `archive_publish_after_days`, and (if generated) `public_share_token`
5. Returns `{ archiveSuccess: true, shareUrl: '/archive/' + token }` on success

```typescript
toggleArchive: async ({ request, locals, params }) => {
	const data = await request.formData();
	const archiveEnabled = data.get('archive_enabled') === 'on';
	const publishDays = parseInt(data.get('archive_publish_after_days')?.toString() || '7', 10);

	try {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role !== 'owner' && membership.role !== 'co_owner') {
			return fail(403, { archiveError: 'Only trip owners can change archive settings.' });
		}

		const updates: Record<string, unknown> = {
			archive_enabled: archiveEnabled,
			archive_publish_after_days: publishDays
		};

		// Generate token on first enable
		if (archiveEnabled && !trip.public_share_token) {
			const { generateArchiveToken } = await import('$lib/utils/archive-token');
			updates.public_share_token = generateArchiveToken();
		}

		await locals.pb.collection('trips').update(trip.id, updates);
		const updatedTrip = await locals.pb.collection('trips').getOne(trip.id);

		return {
			archiveSuccess: true,
			shareToken: updatedTrip.public_share_token
		};
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to update archive settings.';
		return fail(500, { archiveError: message });
	}
}
```

- [ ] **Step 2: Add `archiveTrip` action (manual close + archive)**

This is the action called when the closeout wizard completes. Sets `archived = true` on the trip. If archive is enabled and no token exists, generates one.

```typescript
archiveTrip: async ({ locals, params }) => {
	try {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role !== 'owner' && membership.role !== 'co_owner') {
			return fail(403, { error: 'Only trip owners can archive a trip.' });
		}

		const updates: Record<string, unknown> = { archived: true };

		if (trip.archive_enabled && !trip.public_share_token) {
			const { generateArchiveToken } = await import('$lib/utils/archive-token');
			updates.public_share_token = generateArchiveToken();
		}

		await locals.pb.collection('trips').update(trip.id, updates);
		return { archived: true };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to archive trip.';
		return fail(500, { error: message });
	}
}
```

- [ ] **Step 3: Import `generateArchiveToken` at top of file**

Add the import:
```typescript
import { generateArchiveToken } from '$lib/utils/archive-token';
```

Note: Since this is server-side only (Node.js `crypto`), it works fine in `+page.server.ts`. Dynamic imports as shown above are also fine.

- [ ] **Step 4: Run `pnpm check`**

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/(app)/trips/[slug]/settings/+page.server.ts src/lib/utils/archive-token.ts
git commit -m "M5a: add archive toggle + token generation in trip settings"
```

### Task 4: Export Utility + Tests

**Files:**
- Create: `src/lib/utils/export.ts`
- Create: `src/lib/utils/export.test.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add TripExport type to `src/lib/types.ts`**

```typescript
// M5 -- Closure types

export interface TripExport {
	_waypoint_version: 1;
	exported_at: string;
	trip: {
		title: string;
		slug: string;
		start_date: string;
		end_date: string;
		timezone: string;
		location_summary: string;
		countries: string[];
		photo_album_url: string;
		archive_enabled: boolean;
		archive_publish_after_days: number;
		auto_approve_suggestions: boolean;
	};
	phases: Array<{
		name: string;
		location: string;
		country_code: string;
		start_date: string;
		end_date: string;
		color: string;
		order: number;
	}>;
	days: Array<{
		date: string;
		notes: string;
		phase_name: string | null;
	}>;
	items: Array<{
		day_date: string | null;
		phase_name: string | null;
		slot: string;
		type: string;
		subtype: string;
		title: string;
		description: string;
		location_name: string;
		location_address: string;
		location_coords: { lat: number; lng: number } | null;
		google_place_id: string;
		start_time: string | null;
		end_time: string | null;
		start_tz: string;
		end_tz: string;
		status: string;
		booked: boolean;
		confirmation_codes: Array<{ label: string; value: string }>;
		cost: number;
		currency: string;
		url: string;
		phone: string;
		notes: string;
	}>;
	budget: {
		total: number;
		currency: string;
		categories: Array<{ name: string; budgeted: number }>;
	} | null;
}
```

- [ ] **Step 2: Write the export builder**

`src/lib/utils/export.ts`:

```typescript
import type { Trip, Phase, Day, Item, TripExport } from '$lib/types';

export function buildTripExport(
	trip: Trip,
	phases: Phase[],
	days: Day[],
	items: Item[],
	budget: { total: number; currency: string; categories: Array<{ name: string; budgeted: number }> } | null
): TripExport {
	const phaseMap = new Map(phases.map((p) => [p.id, p]));
	const dayMap = new Map(days.map((d) => [d.id, d]));

	return {
		_waypoint_version: 1,
		exported_at: new Date().toISOString(),
		trip: {
			title: trip.title,
			slug: trip.slug,
			start_date: trip.start_date,
			end_date: trip.end_date,
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries || [],
			photo_album_url: trip.photo_album_url || '',
			archive_enabled: trip.archive_enabled,
			archive_publish_after_days: trip.archive_publish_after_days,
			auto_approve_suggestions: trip.auto_approve_suggestions
		},
		phases: phases.map((p) => ({
			name: p.name,
			location: p.location || '',
			country_code: p.country_code || '',
			start_date: p.start_date || '',
			end_date: p.end_date || '',
			color: p.color || '',
			order: p.order
		})),
		days: days.map((d) => ({
			date: d.date,
			notes: d.notes || '',
			phase_name: d.phase ? phaseMap.get(d.phase)?.name || null : null
		})),
		items: items.map((item) => {
			const day = item.day ? dayMap.get(item.day) : null;
			const phase = item.phase ? phaseMap.get(item.phase) : null;
			return {
				day_date: day?.date || null,
				phase_name: phase?.name || null,
				slot: item.slot || 'anytime',
				type: item.type,
				subtype: item.subtype || '',
				title: item.title,
				description: item.description || '',
				location_name: item.location_name || '',
				location_address: item.location_address || '',
				location_coords: item.location_coords || null,
				google_place_id: item.google_place_id || '',
				start_time: item.start_time || null,
				end_time: item.end_time || null,
				start_tz: item.start_tz || '',
				end_tz: item.end_tz || '',
				status: item.status,
				booked: item.booked,
				confirmation_codes: item.confirmation_codes || [],
				cost: item.cost || 0,
				currency: item.currency || 'USD',
				url: item.url || '',
				phone: item.phone || '',
				notes: item.notes || ''
			};
		}),
		budget
	};
}
```

- [ ] **Step 3: Write failing tests**

`src/lib/utils/export.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildTripExport } from './export';
import type { Trip, Phase, Day, Item } from '$lib/types';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
	return {
		id: 'trip1',
		slug: 'test-trip',
		title: 'Test Trip',
		start_date: '2026-06-01',
		end_date: '2026-06-07',
		timezone: 'America/Detroit',
		location_summary: 'Michigan',
		countries: ['US'],
		cover_image: '',
		photo_album_url: '',
		archive_enabled: false,
		archive_publish_after_days: 7,
		public_share_token: '',
		vault_password_hash: '',
		auto_approve_suggestions: true,
		created_by: 'user1',
		archived: false,
		created: '2026-01-01',
		updated: '2026-01-01',
		...overrides
	} as Trip;
}

describe('buildTripExport', () => {
	it('exports trip with correct version and structure', () => {
		const result = buildTripExport(makeTrip(), [], [], [], null);
		expect(result._waypoint_version).toBe(1);
		expect(result.trip.title).toBe('Test Trip');
		expect(result.trip.slug).toBe('test-trip');
		expect(result.phases).toEqual([]);
		expect(result.days).toEqual([]);
		expect(result.items).toEqual([]);
		expect(result.budget).toBeNull();
	});

	it('resolves day dates and phase names for items', () => {
		const phases: Phase[] = [
			{ id: 'p1', trip: 'trip1', name: 'Barcelona', location: 'Barcelona', country_code: 'ES', start_date: '2026-06-01', end_date: '2026-06-03', color: '#ff0000', order: 0, created: '', updated: '' }
		];
		const days: Day[] = [
			{ id: 'd1', trip: 'trip1', phase: 'p1', date: '2026-06-01', notes: '', created: '', updated: '' }
		];
		const items: Item[] = [
			{ id: 'i1', trip: 'trip1', phase: 'p1', day: 'd1', slot: 'morning', type: 'activity', subtype: '', title: 'Sagrada Familia', description: '', location_name: '', location_address: '', location_coords: null, google_place_id: '', start_time: null, end_time: null, start_tz: '', end_tz: '', status: 'done', booked: true, booked_by: '', paid_by: '', confirmation_codes: [], cost: 0, currency: 'USD', url: '', phone: '', notes: '', order: 0, created: '', updated: '' } as Item
		];

		const result = buildTripExport(makeTrip(), phases, days, items, null);
		expect(result.items[0].day_date).toBe('2026-06-01');
		expect(result.items[0].phase_name).toBe('Barcelona');
		expect(result.items[0].title).toBe('Sagrada Familia');
	});

	it('strips sensitive fields (no vault_password_hash, no member IDs)', () => {
		const result = buildTripExport(
			makeTrip({ vault_password_hash: 'secret:hash' }),
			[], [], [], null
		);
		expect(result.trip).not.toHaveProperty('vault_password_hash');
		expect(result.trip).not.toHaveProperty('id');
		expect(result.trip).not.toHaveProperty('created_by');
	});

	it('includes budget when provided', () => {
		const budget = { total: 5000, currency: 'USD', categories: [{ name: 'Food', budgeted: 1500 }] };
		const result = buildTripExport(makeTrip(), [], [], [], budget);
		expect(result.budget).toEqual(budget);
	});
});
```

- [ ] **Step 4: Verify tests pass**

Run: `pnpm vitest run src/lib/utils/export.test.ts`
Expected: All 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/export.ts src/lib/utils/export.test.ts src/lib/types.ts
git commit -m "M5a: add trip JSON export builder + tests"
```

### Task 5: Import Utility + Tests

**Files:**
- Create: `src/lib/utils/import.ts`
- Create: `src/lib/utils/import.test.ts`

- [ ] **Step 1: Write the import validator/parser**

`src/lib/utils/import.ts`:

The import utility validates the JSON structure, checks version compatibility, and returns a structured object ready for record creation. It does NOT interact with PocketBase — that's the server action's job.

```typescript
import type { TripExport } from '$lib/types';

export interface ImportValidationResult {
	valid: boolean;
	errors: string[];
	data: TripExport | null;
}

export function validateTripImport(raw: unknown): ImportValidationResult {
	const errors: string[] = [];

	if (!raw || typeof raw !== 'object') {
		return { valid: false, errors: ['Invalid JSON: not an object'], data: null };
	}

	const obj = raw as Record<string, unknown>;

	if (obj._waypoint_version !== 1) {
		errors.push(`Unsupported version: ${obj._waypoint_version}. Expected 1.`);
	}

	if (!obj.trip || typeof obj.trip !== 'object') {
		errors.push('Missing or invalid "trip" field.');
		return { valid: false, errors, data: null };
	}

	const trip = obj.trip as Record<string, unknown>;
	if (!trip.title || typeof trip.title !== 'string') errors.push('Trip title is required.');
	if (!trip.start_date || typeof trip.start_date !== 'string') errors.push('Trip start_date is required.');
	if (!trip.end_date || typeof trip.end_date !== 'string') errors.push('Trip end_date is required.');

	if (!Array.isArray(obj.phases)) errors.push('"phases" must be an array.');
	if (!Array.isArray(obj.days)) errors.push('"days" must be an array.');
	if (!Array.isArray(obj.items)) errors.push('"items" must be an array.');

	if (errors.length > 0) {
		return { valid: false, errors, data: null };
	}

	return { valid: true, errors: [], data: obj as unknown as TripExport };
}

export function generateImportSlug(title: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);
	const suffix = Math.random().toString(36).slice(2, 6);
	return `${base}-imported-${suffix}`;
}
```

- [ ] **Step 2: Write failing tests**

`src/lib/utils/import.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateTripImport, generateImportSlug } from './import';

describe('validateTripImport', () => {
	const validExport = {
		_waypoint_version: 1,
		exported_at: '2026-06-01T00:00:00Z',
		trip: {
			title: 'Test Trip',
			slug: 'test-trip',
			start_date: '2026-06-01',
			end_date: '2026-06-07',
			timezone: 'America/Detroit',
			location_summary: 'Michigan',
			countries: ['US'],
			photo_album_url: '',
			archive_enabled: false,
			archive_publish_after_days: 7,
			auto_approve_suggestions: true
		},
		phases: [],
		days: [],
		items: [],
		budget: null
	};

	it('accepts a valid export', () => {
		const result = validateTripImport(validExport);
		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.data).toBeTruthy();
	});

	it('rejects non-object input', () => {
		expect(validateTripImport(null).valid).toBe(false);
		expect(validateTripImport('string').valid).toBe(false);
		expect(validateTripImport(42).valid).toBe(false);
	});

	it('rejects wrong version', () => {
		const result = validateTripImport({ ...validExport, _waypoint_version: 2 });
		expect(result.valid).toBe(false);
		expect(result.errors[0]).toContain('Unsupported version');
	});

	it('rejects missing trip title', () => {
		const result = validateTripImport({
			...validExport,
			trip: { ...validExport.trip, title: '' }
		});
		expect(result.valid).toBe(false);
	});

	it('rejects missing arrays', () => {
		const result = validateTripImport({
			...validExport,
			phases: 'not-array'
		});
		expect(result.valid).toBe(false);
	});
});

describe('generateImportSlug', () => {
	it('produces a kebab-case slug with imported suffix', () => {
		const slug = generateImportSlug('Spain 2026');
		expect(slug).toMatch(/^spain-2026-imported-[a-z0-9]{4}$/);
	});

	it('handles special characters', () => {
		const slug = generateImportSlug('My Trip!!! @#$ Test');
		expect(slug).toMatch(/^my-trip-test-imported-[a-z0-9]{4}$/);
	});
});
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm vitest run src/lib/utils/import.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/import.ts src/lib/utils/import.test.ts
git commit -m "M5a: add trip JSON import validator + slug generator + tests"
```

### Task 6: Run pnpm check

- [ ] **Step 1: Run check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings (new types/utils are additive).

- [ ] **Step 2: Commit M5a completion**

```bash
git add -A
git commit -m "M5a complete: archive token, export/import utils, settings actions"
```

---

## M5b -- Closeout Wizard UI

### Task 1: Closeout Server Load + Actions

**Files:**
- Create: `src/routes/(app)/trips/[slug]/closeout/+page.server.ts`

- [ ] **Step 1: Write the server loader**

The loader fetches all days (sorted by date) and all items for the trip. Groups items by day and slot for the wizard to walk through. Also loads phases for display context.

```typescript
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, TripMember, Day, Phase } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals, params }) => {
	const { trip, membership, days, phases } = await parent();

	// Only owner/co-owner can use closeout
	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		redirect(303, `/trips/${params.slug}`);
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'day,slot,order'
	});

	return { trip, membership, days, phases, items };
};
```

- [ ] **Step 2: Write the form actions**

Three actions: `markDone` (set item status to done), `markDoneAll` (bulk: set all items in a day to done), and `addReplacement` (create new done item as replacement).

```typescript
export const actions: Actions = {
	markDone: async ({ request, locals, params }) => {
		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			await locals.pb.collection('items').update(itemId, { status: 'done' });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update item.' });
		}
	},

	markDoneAll: async ({ request, locals }) => {
		const data = await request.formData();
		const itemIds = data.getAll('item_ids').map((id) => id.toString());
		if (itemIds.length === 0) return fail(400, { error: 'No items to mark.' });

		try {
			await Promise.all(
				itemIds.map((id) => locals.pb.collection('items').update(id, { status: 'done' }))
			);
			return { bulkSuccess: true, count: itemIds.length };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to bulk update.' });
		}
	},

	addReplacement: async ({ request, locals, params }) => {
		const data = await request.formData();
		const tripId = data.get('trip_id')?.toString();
		const originalItemId = data.get('original_item_id')?.toString();
		const dayId = data.get('day_id')?.toString() || null;
		const phaseId = data.get('phase_id')?.toString() || null;
		const slot = data.get('slot')?.toString() || 'anytime';
		const title = data.get('title')?.toString().trim();
		const type = data.get('type')?.toString() || 'activity';

		if (!tripId || !title) return fail(400, { error: 'Trip ID and title are required.' });

		try {
			// Mark original as "considered" (explicitly reviewed but not done)
			if (originalItemId) {
				await locals.pb.collection('items').update(originalItemId, { status: 'considered' });
			}

			await locals.pb.collection('items').create({
				trip: tripId,
				day: dayId,
				phase: phaseId,
				slot,
				type,
				title,
				status: 'done',
				booked: false,
				order: 999
			});
			return { replacementAdded: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to create replacement.' });
		}
	},

	finishCloseout: async ({ locals, params }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only trip owners can archive.' });
			}

			const updates: Record<string, unknown> = { archived: true };
			if (trip.archive_enabled && !trip.public_share_token) {
				const { generateArchiveToken } = await import('$lib/utils/archive-token');
				updates.public_share_token = generateArchiveToken();
			}

			await locals.pb.collection('trips').update(trip.id, updates);
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to archive.' });
		}
	}
};
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/closeout/+page.server.ts
git commit -m "M5b: closeout wizard server loader + actions (markDone, bulk, replacement, finish)"
```

### Task 2: Closeout Wizard UI Components

**Files:**
- Create: `src/lib/components/CloseoutItemRow.svelte`
- Create: `src/lib/components/InlineQuickAdd.svelte`
- Create: `src/lib/components/CloseoutDayCard.svelte`

- [ ] **Step 1: Write CloseoutItemRow.svelte**

A single row showing the item title, type icon, time, and three action buttons:
- "Done" (green check) — submits markDone form action
- "Did something else" (orange swap icon) — expands InlineQuickAdd below
- "Skip" (gray X) — no action needed (item stays planned, UI just dims the row)

The row should have three visual states:
- Default (pending): normal appearance
- Marked done: green left border, check icon, dimmed buttons
- Skipped: grayed out, strikethrough title

```
Props:
- item: Item
- tripId: string
- dayId: string | null
- phaseId: string | null
- onDone: () => void
- onSkip: () => void
```

The component uses `enhance` on the form for SvelteKit progressive enhancement. State is tracked locally to update appearance immediately.

- [ ] **Step 2: Write InlineQuickAdd.svelte**

Minimal inline form: just a title field and a type select. Submits the `addReplacement` action. Auto-focuses the title field when opened. Includes hidden fields for trip_id, day_id, phase_id, slot.

```
Props:
- tripId: string
- dayId: string | null
- phaseId: string | null
- slot: string
- onAdded: () => void
- onCancel: () => void
```

- [ ] **Step 3: Write CloseoutDayCard.svelte**

A card for a single day within the wizard. Shows the day date (formatted), phase name, and lists all items grouped by slot (morning/afternoon/evening/anytime). Includes a "Mark entire day as done" bulk button at the top right.

```
Props:
- day: Day
- items: Item[]
- phaseName: string | null
- tripId: string
```

Slot grouping: morning first, then afternoon, evening, anytime. Each slot section has a subtle header.

- [ ] **Step 4: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/CloseoutItemRow.svelte src/lib/components/InlineQuickAdd.svelte src/lib/components/CloseoutDayCard.svelte
git commit -m "M5b: closeout wizard UI components — item row, inline quick-add, day card"
```

### Task 3: Closeout Wizard Page

**Files:**
- Create: `src/routes/(app)/trips/[slug]/closeout/+page.svelte`

- [ ] **Step 1: Write the wizard page**

Full-screen guided flow. Architecture:

1. **Progress indicator** at the top: "Day X of Y" with a progress bar
2. **Current day card** (CloseoutDayCard) fills the viewport
3. **Navigation**: "Previous Day" / "Next Day" buttons at bottom
4. **Final step**: After the last day, shows a summary screen:
   - X items marked done
   - X items skipped (stayed planned)
   - X replacement items added
   - "Finish & Archive Trip" button (submits `finishCloseout` action)
   - "Go Back" link to review

State management:
- `currentDayIndex: number` — which day is being reviewed
- `itemStates: Map<string, 'done' | 'skipped' | 'pending'>` — tracks local UI state per item
- Items marked done via form action update server immediately; skip is local-only (leaves as planned)

Layout:
- Full-screen (no bottom nav)
- NavBar with "Closeout" title and a close/X button that goes back to trip overview
- Mobile-first: large touch targets, single-column

Performance note: the spec says closeout should complete a 7-day trip in under 5 minutes. With "mark entire day as done" bulk action, this is very achievable — most items on a real trip will be "done as planned."

- [ ] **Step 2: Wire the "Mark entire day as done" button**

When clicked, submits a form with all item IDs for that day as hidden fields to the `markDoneAll` action. On success, updates local state for all items in the day to 'done'.

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/closeout/+page.svelte
git commit -m "M5b: closeout wizard page — day-by-day guided flow with bulk actions"
```

### Task 4: Add Closeout Link to More Page

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/more/+page.svelte`

- [ ] **Step 1: Add closeout wizard link**

Add a new Card entry (owner/co-owner only) linking to `/trips/{slug}/closeout`. Use a clipboard-check icon. Place it above the Settings link. Add subtitle: "Walk through your trip day by day."

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/more/+page.svelte
git commit -m "M5b: add closeout wizard link to More page"
```

### Task 5: Archive Settings UI

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.svelte`

- [ ] **Step 1: Add archive settings section**

Between the main settings form and the danger zone, add an "Archive" section (owner/co-owner only) with:

1. **Toggle**: "Enable public archive" checkbox, bound to `archive_enabled`
2. **Number input**: "Publish X days after trip ends" (only visible when archive enabled), bound to `archive_publish_after_days`, default 7, min 0
3. **Share URL display** (read-only): Shows the archive URL when token exists. Includes a "Copy link" button.
4. **Submit button**: "Save Archive Settings" — submits to `toggleArchive` action

All in a `<form method="POST" action="?/toggleArchive" use:enhance>`.

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit M5b completion**

```bash
git add src/routes/(app)/trips/[slug]/settings/+page.svelte
git commit -m "M5b complete: closeout wizard + archive settings UI"
```

---

## M5c -- Public Archive View

### Task 1: Archive Page Server Loader

**Files:**
- Create: `src/routes/archive/[token]/+page.server.ts`

- [ ] **Step 1: Write the loader**

This route is PUBLIC — no auth required. The loader:

1. Looks up trip by `public_share_token = params.token`
2. Checks visibility:
   - If `archive_enabled` is true AND (`archived` is true OR `end_date + archive_publish_after_days` has passed) → serve archive
   - Otherwise → 404
3. Loads phases, days, and items (only `status = 'done'` for the main view, all items for the "considered" sidebar)
4. Strips all sensitive data: no member names, no expenses, no vault entries, no confirmation codes, no costs
5. Returns sanitized data for the archive view

```typescript
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import PocketBase from 'pocketbase';
import { PB_URL } from '$env/static/private';

export const load: PageServerLoad = async ({ params }) => {
	const pb = new PocketBase(PB_URL);

	let trip: Trip;
	try {
		trip = await pb
			.collection('trips')
			.getFirstListItem<Trip>(
				pb.filter('public_share_token = {:token}', { token: params.token })
			);
	} catch {
		error(404, 'Archive not found');
	}

	// Check if archive should be visible
	if (!trip.archive_enabled) {
		error(404, 'Archive not found');
	}

	const now = new Date();
	const endDate = new Date(trip.end_date);
	const publishDate = new Date(endDate);
	publishDate.setDate(publishDate.getDate() + (trip.archive_publish_after_days || 7));

	if (!trip.archived && now < publishDate) {
		error(404, 'Archive not yet published');
	}

	// Load public data
	const [phases, days, items] = await Promise.all([
		pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,slot,order'
		})
	]);

	// Sanitize: strip confirmation codes, costs, paid_by, booked_by
	const sanitizedItems = items.map((item) => ({
		id: item.id,
		day: item.day,
		phase: item.phase,
		slot: item.slot,
		type: item.type,
		subtype: item.subtype,
		title: item.title,
		description: item.description,
		location_name: item.location_name,
		location_address: item.location_address,
		start_time: item.start_time,
		end_time: item.end_time,
		status: item.status
	}));

	return {
		trip: {
			title: trip.title,
			start_date: trip.start_date,
			end_date: trip.end_date,
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries,
			photo_album_url: trip.photo_album_url
		},
		phases,
		days,
		items: sanitizedItems,
		doneItems: sanitizedItems.filter((i) => i.status === 'done'),
		consideredItems: sanitizedItems.filter((i) => i.status === 'planned' || i.status === 'considered')
	};
};
```

**Important:** This route needs its own PocketBase client (not from `locals.pb`) since there's no auth context. Create a fresh `PocketBase(PB_URL)` instance and authenticate as admin using `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` env vars. This bypasses collection rules for the public archive read. Admin credentials are already available in `.env.local`.

```typescript
// At the top of the loader, after creating pb:
await pb.collection('_superusers').authWithPassword(
	PB_ADMIN_EMAIL,
	PB_ADMIN_PASSWORD
);
```

- [ ] **Step 2: Add PB admin env vars to `.env.example`**

Add:
```
PB_ADMIN_EMAIL=admin@example.com
PB_ADMIN_PASSWORD=your-admin-password
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/archive/[token]/+page.server.ts .env.example
git commit -m "M5c: public archive server loader — admin auth, sanitized data, publish date check"
```

### Task 2: Archive Page UI

**Files:**
- Create: `src/routes/archive/[token]/+page.svelte`
- Create: `src/lib/components/ArchiveDaySection.svelte`

- [ ] **Step 1: Write ArchiveDaySection.svelte**

A read-only day section for the archive. Shows:
- Day date (formatted, e.g. "Monday, June 1")
- Phase badge (colored pill with phase name)
- Done items grouped by slot, each showing: type icon, title, location, times
- Clean, card-based layout

No edit buttons, no action forms. Pure presentation.

- [ ] **Step 2: Write the archive page**

Layout:
1. **Hero header**: Trip title (large), location summary (Fraunces italic), date range, cover image if available
2. **Photo album link**: If photo_album_url exists, prominent "View Photos" button
3. **Day-by-day timeline**: ArchiveDaySection for each day, showing done items
4. **"What we considered" section**: At the bottom, a collapsible section listing all non-done items (`planned` + `considered` status) grouped by type. Shows restaurants, activities, etc. that were on the itinerary but the group didn't end up doing.
5. **Footer**: "Built with Waypoint" subtle branding

No navigation chrome (no NavBar, no BottomNav). This is a standalone public page. Should look good when shared on social media.

Responsive: single-column on mobile, max-width centered on desktop.

- [ ] **Step 3: Handle the layout**

The archive route is at `/archive/[token]` — outside the `(app)` group, so it won't inherit the app layout (NavBar, BottomNav, auth check). It needs its own minimal layout or uses the root layout.

Check: does `src/routes/+layout.svelte` add auth-dependent UI? If so, create `src/routes/archive/+layout.svelte` that just renders the slot with minimal chrome. If root layout is clean, no additional layout file needed.

- [ ] **Step 4: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/archive/[token]/+page.svelte src/routes/archive/[token]/+page.server.ts src/lib/components/ArchiveDaySection.svelte
git commit -m "M5c complete: public archive view — hero, timeline, considered items, responsive"
```

---

## M5d -- JSON Export + Import

### Task 1: Export Endpoint

**Files:**
- Create: `src/routes/(app)/trips/[slug]/export/+server.ts`

- [ ] **Step 1: Write the GET endpoint**

Returns a downloadable JSON file. Loads all trip data (trip, phases, days, items, budget) and runs through `buildTripExport()`.

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import { buildTripExport } from '$lib/utils/export';

export const GET: RequestHandler = async ({ params, locals }) => {
	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

	// Verify membership
	await locals.pb
		.collection('trip_members')
		.getFirstListItem(`trip = "${trip.id}" && user = "${locals.user!.id}"`);

	const [phases, days, items] = await Promise.all([
		locals.pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,slot,order'
		})
	]);

	// Load budget if exists
	let budget = null;
	try {
		const tripBudget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem(`trip = "${trip.id}"`);
		if (tripBudget) {
			budget = {
				total: tripBudget.total_budget || 0,
				currency: tripBudget.currency || 'USD',
				categories: tripBudget.categories || []
			};
		}
	} catch {
		// No budget — that's fine
	}

	const exportData = buildTripExport(trip, phases, days, items, budget);
	const filename = `waypoint-${trip.slug}-${new Date().toISOString().split('T')[0]}.json`;

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
```

- [ ] **Step 2: Add export link to More page**

Add a Card entry in `src/routes/(app)/trips/[slug]/more/+page.svelte` that links to `/trips/{slug}/export`. Use a download icon. Place it after Settings. Subtitle: "Download trip as JSON backup."

The link should use `target="_self"` and be a direct `<a>` (not a SvelteKit navigation link) since it triggers a file download.

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/export/+server.ts src/routes/(app)/trips/[slug]/more/+page.svelte
git commit -m "M5d: JSON export endpoint + download link on More page"
```

### Task 2: Import Page

**Files:**
- Create: `src/routes/(app)/trips/import/+page.server.ts`
- Create: `src/routes/(app)/trips/import/+page.svelte`

- [ ] **Step 1: Write the import server action**

`src/routes/(app)/trips/import/+page.server.ts`:

The action:
1. Reads the uploaded JSON file from form data
2. Parses and validates via `validateTripImport()`
3. If valid, creates a new trip + phases + days + items in PocketBase
4. Generates a unique slug via `generateImportSlug()`
5. Creates the current user as owner/trip member
6. Redirects to the new trip

```typescript
import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateTripImport, generateImportSlug } from '$lib/utils/import';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	import: async ({ request, locals }) => {
		const data = await request.formData();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Please select a JSON file.' });
		}

		if (file.size > 10 * 1024 * 1024) {
			return fail(400, { error: 'File too large (max 10MB).' });
		}

		let parsed: unknown;
		try {
			const text = await file.text();
			parsed = JSON.parse(text);
		} catch {
			return fail(400, { error: 'Invalid JSON file.' });
		}

		const validation = validateTripImport(parsed);
		if (!validation.valid || !validation.data) {
			return fail(400, { error: validation.errors.join('; ') });
		}

		const importData = validation.data;
		const slug = generateImportSlug(importData.trip.title);

		try {
			// Create trip
			const trip = await locals.pb.collection('trips').create({
				slug,
				title: importData.trip.title,
				start_date: importData.trip.start_date + ' 00:00:00.000Z',
				end_date: importData.trip.end_date + ' 00:00:00.000Z',
				timezone: importData.trip.timezone || '',
				location_summary: importData.trip.location_summary || '',
				countries: importData.trip.countries || [],
				photo_album_url: importData.trip.photo_album_url || '',
				archive_enabled: false,
				archive_publish_after_days: importData.trip.archive_publish_after_days || 7,
				auto_approve_suggestions: importData.trip.auto_approve_suggestions ?? true,
				created_by: locals.user!.id,
				archived: false
			});

			// Create owner membership
			const membership = await locals.pb.collection('trip_members').create({
				trip: trip.id,
				user: locals.user!.id,
				display_name: locals.user!.name || locals.user!.email?.split('@')[0] || 'Owner',
				role: 'owner',
				joined_at: new Date().toISOString()
			});

			// Create phases, building name→id map
			const phaseMap = new Map<string, string>();
			for (const phase of importData.phases) {
				const created = await locals.pb.collection('phases').create({
					trip: trip.id,
					name: phase.name,
					location: phase.location || '',
					country_code: phase.country_code || '',
					start_date: phase.start_date ? phase.start_date + ' 00:00:00.000Z' : '',
					end_date: phase.end_date ? phase.end_date + ' 00:00:00.000Z' : '',
					color: phase.color || '',
					order: phase.order
				});
				phaseMap.set(phase.name, created.id);
			}

			// Create days, building date→id map
			const dayMap = new Map<string, string>();
			for (const day of importData.days) {
				const created = await locals.pb.collection('days').create({
					trip: trip.id,
					phase: day.phase_name ? phaseMap.get(day.phase_name) || '' : '',
					date: day.date + ' 00:00:00.000Z',
					notes: day.notes || ''
				});
				dayMap.set(day.date, created.id);
			}

			// Create items
			for (const item of importData.items) {
				await locals.pb.collection('items').create({
					trip: trip.id,
					phase: item.phase_name ? phaseMap.get(item.phase_name) || '' : '',
					day: item.day_date ? dayMap.get(item.day_date) || '' : '',
					slot: item.slot || 'anytime',
					type: item.type,
					subtype: item.subtype || '',
					title: item.title,
					description: item.description || '',
					location_name: item.location_name || '',
					location_address: item.location_address || '',
					location_coords: item.location_coords || null,
					google_place_id: item.google_place_id || '',
					start_time: item.start_time || null,
					end_time: item.end_time || null,
					start_tz: item.start_tz || '',
					end_tz: item.end_tz || '',
					status: item.status || 'planned',
					booked: item.booked || false,
					confirmation_codes: item.confirmation_codes || [],
					cost: item.cost || 0,
					currency: item.currency || 'USD',
					url: item.url || '',
					phone: item.phone || '',
					notes: item.notes || '',
					order: 0
				});
			}

			redirect(303, `/trips/${slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to import trip.';
			return fail(500, { error: message });
		}
	}
};
```

- [ ] **Step 2: Write the import page UI**

`src/routes/(app)/trips/import/+page.svelte`:

Simple page with:
1. NavBar with "Import Trip" title and back button to `/trips`
2. File input (accept `.json`)
3. After file selected, show preview: trip title, dates, phase count, item count
4. "Import" button to submit
5. Error display area

Use SvelteKit `enhance` for form submission. Parse the file client-side for preview (read as text, JSON.parse, show summary) before submitting.

- [ ] **Step 3: Add import button to trips list page**

Add a secondary button or link on the trips list page (`src/routes/(app)/trips/+page.svelte`) that navigates to `/trips/import`. Place it near the "New Trip" button. Use an upload icon.

- [ ] **Step 4: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 5: Commit M5d completion**

```bash
git add src/routes/(app)/trips/[slug]/export/+server.ts src/routes/(app)/trips/import/+page.server.ts src/routes/(app)/trips/import/+page.svelte src/routes/(app)/trips/+page.svelte
git commit -m "M5d complete: JSON export endpoint + import page with preview"
```

---

## M5e -- E2E Tests + Polish

### Task 1: Playwright Happy-Path Tests

**Files:**
- Create: `tests/e2e/m5-closure.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('M5 Closure', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('closeout wizard link visible on More page for owner', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Closeout')).toBeVisible();
	});

	test('closeout wizard renders day cards', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Closeout').click();
		await page.waitForURL('**/closeout');

		// Should see day progress indicator
		const progress = page.getByText(/Day \d+ of \d+/);
		await expect(progress).toBeVisible({ timeout: 5000 });
	});

	test('archive settings section in trip settings', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await page.getByText('Settings').click();
		await page.waitForURL('**/settings');

		await expect(page.getByText('Archive')).toBeVisible();
	});

	test('export link on More page triggers download', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		await page.getByText('More').click();
		await expect(page.getByText('Export')).toBeVisible();
	});

	test('import page renders with file input', async ({ page }) => {
		await page.goto(`${BASE}/trips/import`);
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached();
	});

	test('public archive 404s for non-existent token', async ({ page }) => {
		const response = await page.goto(`${BASE}/archive/nonexistent-token-12345`);
		expect(response?.status()).toBe(404);
	});
});
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test:e2e tests/e2e/m5-closure.spec.ts`
Expected: All tests pass (some may be conditional on test data).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/m5-closure.spec.ts
git commit -m "M5e: add M5 E2E Playwright tests — closeout, archive settings, export, import"
```

### Task 2: Full Test Suite

- [ ] **Step 1: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm vitest run`
Expected: All tests pass (date-math + debt-simplify + crypto + trip-mode + export + import).

- [ ] **Step 3: Run all E2E tests**

Run: `pnpm test:e2e`
Expected: All tests pass (m1 + m2 + m3 + m4 + m5).

- [ ] **Step 4: Commit M5e completion**

```bash
git add -A
git commit -m "M5e complete: all tests passing, M5 Closure milestone done"
```

### Task 3: M5 Status File

**Files:**
- Create: `M5_STATUS.md`

- [ ] **Step 1: Write status file**

Create `M5_STATUS.md` with the sub-milestone structure, all tasks as checkboxes. Include a lessons-learned section (to be filled during implementation).

- [ ] **Step 2: Final commit**

```bash
git add M5_STATUS.md M5_PLAN.md
git commit -m "M5 complete: Closure milestone — closeout wizard, public archive, JSON export/import"
```

---

## Resolved Decisions

All open decisions have been resolved:

1. **Admin auth for archive reads** — Using PB admin credentials to bypass collection rules for the public archive loader. Simpler than modifying view rules across 4+ collections.
2. **Archive layout** — `/archive/[token]` is outside `(app)`, standalone public page with its own minimal layout. No NavBar, no BottomNav, no auth.
3. **Closeout wizard offline** — Blocked with a message when offline. Online-only activity.
4. **Export scope** — Budget totals/categories included. Individual expenses and settlements excluded (member IDs don't round-trip).
5. **"Considered" section in archive** — Shows all non-`done` items (both `planned` and `considered` status) as "What we considered" — restaurants/activities on the itinerary that the group was interested in but didn't do.
6. **`considered` status** — New `ItemStatus` value. "Did something else" in closeout marks original as `considered`, creates replacement as `done`. "Skipped" leaves item as `planned`.

---

## Acceptance Criteria Mapping

| Criterion | Where it's built |
|---|---|
| Closeout wizard completes 7-day trip in <5 min | M5b (bulk "mark entire day as done" action) |
| Public archive contains zero member names, expenses, vault entries | M5c (sanitized loader strips PII) |
| Archive URL works without login | M5c (public route outside (app), no auth check) |
| Trip JSON export round-trips losslessly via import | M5a (export builder) + M5d (import creates matching trip) |
| Owner can enable archive early (before N days) | M5a Task 2 (toggleArchive action) + M5b Task 5 (archive settings UI) |
| Auto-publish after end_date + N days | M5c Task 1 (on-demand date check in archive loader) |
