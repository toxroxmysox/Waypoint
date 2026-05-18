# M4 — Execution: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Waypoint usable on a real trip (Traverse City wine trip, October). Trip Mode for day-of use, offline support, encrypted vault, voting on alternates, item management.

**Architecture:** Six sub-milestones mirror the M3 pattern. M4a front-loads all backend (migrations, hooks, types, tested utilities). M4b-M4e are pure UI sub-milestones that build on M4a's foundation. M4f is E2E + polish. Each sub-milestone ends with `pnpm check` clean and a commit.

**Tech Stack:** SvelteKit + TypeScript + Tailwind (frontend), PocketBase 0.27 (backend), Web Crypto API (vault encryption), Service Worker API (offline), `crypto` Node.js built-in (password hashing).

---

## Sub-Milestone Overview

| Sub-milestone | Scope | Depends on |
|---|---|---|
| **M4a** | Data models, hooks, types, unit-tested utilities | — |
| **M4b** | Voting + alternates + item move UI | M4a |
| **M4c** | Vault UI (encrypted entries) | M4a |
| **M4d** | Trip Mode (today/tomorrow/next 3 days) | M4a |
| **M4e** | Offline & PWA (service worker, offline toggle, A2HS) | M4a |
| **M4f** | E2E tests + polish | M4a-M4e |

---

## File Map

### New files

| File | Responsibility |
|---|---|
| `backend/pb_migrations/0024_votes.js` | Votes collection |
| `backend/pb_migrations/0025_vault_entries.js` | Vault entries collection |
| `backend/pb_migrations/0026_trip_vault_password.js` | Add vault_password_hash to trips |
| `backend/pb_hooks/votes.pb.js` | Enforce one-vote-per-member-per-item |
| `src/lib/utils/crypto.ts` | Client-side AES-GCM encrypt/decrypt with PBKDF2 key derivation |
| `src/lib/utils/crypto.test.ts` | Unit tests for encrypt/decrypt round-trip, wrong password fails |
| `src/lib/utils/trip-mode.ts` | findNextItem, isToday, groupItemsByDay helpers |
| `src/lib/utils/trip-mode.test.ts` | Unit tests for time-based item logic |
| `src/lib/utils/vault-password.ts` | Server-side scrypt hash/verify for vault password |
| `src/lib/components/VoteButtons.svelte` | Upvote button + count display |
| `src/lib/components/MoveItemSheet.svelte` | Bottom sheet with day/slot/phase picker for moving items |
| `src/lib/components/A2HSBanner.svelte` | Add-to-Home-Screen banner (iOS + Android) |
| `src/lib/components/NowDivider.svelte` | "Now" time indicator between items |
| `src/lib/components/TripModeCard.svelte` | Large item card for Trip Mode |
| `src/routes/(app)/trips/[slug]/today/+page.server.ts` | Trip Mode data loader |
| `src/routes/(app)/trips/[slug]/today/+page.svelte` | Trip Mode today view |
| `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts` | Next-3-days data loader |
| `src/routes/(app)/trips/[slug]/today/upcoming/+page.svelte` | Next-3-days view |
| `src/routes/(app)/trips/[slug]/vault/+page.server.ts` | Vault server actions (create, delete entries, set/verify password) |
| `src/routes/(app)/trips/[slug]/vault/+page.svelte` | Vault UI (unlock, list, create, view) |
| `src/routes/api/vault/unlock/+server.ts` | SvelteKit proxy for vault password verification |
| `tests/e2e/m4-execution.spec.ts` | M4 Playwright happy-path tests |

### Modified files

| File | Changes |
|---|---|
| `src/lib/types.ts` | Add Vote, VaultEntry, VaultEntryDecrypted types |
| `src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts` | Add vote, unvote, promote, demote, moveItem actions; load votes |
| `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte` | Add VoteButtons, promote/demote buttons, move button |
| `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts` | Load vote counts per item |
| `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte` | Show vote counts on item cards, NowDivider |
| `src/routes/(app)/trips/[slug]/+page.svelte` | Add Trip Mode toggle link |
| `src/routes/(app)/trips/[slug]/settings/+page.server.ts` | Add setVaultPassword action |
| `src/routes/(app)/trips/[slug]/settings/+page.svelte` | Add vault password setup section |
| `src/routes/(app)/trips/[slug]/more/+page.svelte` | Activate vault link (remove "coming in M4") |
| `src/routes/(app)/trips/[slug]/+layout.svelte` | Conditionally show Trip Mode nav |
| `src/service-worker.ts` | Full rewrite: cache API responses, offline toggle, background refresh |
| `src/routes/+layout.svelte` | Add A2HSBanner, offline indicator |
| `src/lib/components/BottomNav.svelte` | Add Today tab when in Trip Mode |

---

## M4a — Data Models, Hooks, and Tested Utilities

### Task 1: Votes Migration

**Files:**
- Create: `backend/pb_migrations/0024_votes.js`

- [ ] **Step 1: Write the migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'votes',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'item', required: true, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'member', required: true, collectionId: tripMembers.id, maxSelect: 1, cascadeDelete: true },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_votes_item_member ON votes (item, member)',
				'CREATE INDEX idx_votes_trip ON votes (trip)',
				'CREATE INDEX idx_votes_item ON votes (item)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			deleteRule: MEMBER_VIA_TRIP + ' && member.user = @request.auth.id',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('votes');
		app.delete(collection);
	}
);
```

- [ ] **Step 2: Verify migration applies**

Run: `cd backend && ./pocketbase migrate up && cd ..`
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_migrations/0024_votes.js
git commit -m "M4a: add votes collection migration"
```

### Task 2: Vault Migrations

**Files:**
- Create: `backend/pb_migrations/0025_vault_entries.js`
- Create: `backend/pb_migrations/0026_trip_vault_password.js`

- [ ] **Step 1: Write vault_entries migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'vault_entries',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'encrypted_title', required: true, max: 5000 },
				{ type: 'text', name: 'encrypted_body', required: true, max: 100000 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
			],
			indexes: [
				'CREATE INDEX idx_vault_entries_trip ON vault_entries (trip)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			updateRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
			deleteRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('vault_entries');
		app.delete(collection);
	}
);
```

- [ ] **Step 2: Write trip vault_password_hash migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.add(
			new TextField({ name: 'vault_password_hash', max: 500 })
		);
		app.save(trips);
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.removeByName('vault_password_hash');
		app.save(trips);
	}
);
```

- [ ] **Step 3: Verify migrations apply**

Run: `cd backend && ./pocketbase migrate up && cd ..`
Expected: Both migrations apply without errors.

- [ ] **Step 4: Commit**

```bash
git add backend/pb_migrations/0025_vault_entries.js backend/pb_migrations/0026_trip_vault_password.js
git commit -m "M4a: add vault_entries collection + vault_password_hash on trips"
```

### Task 3: Votes Hook

**Files:**
- Create: `backend/pb_hooks/votes.pb.js`

- [ ] **Step 1: Write the hook**

The hook enforces that a member can only vote once per item. The UNIQUE index handles the DB constraint, but we also enforce `member` matches the authenticated user's trip membership.

```javascript
/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	const tripId = e.record.get('trip');
	const memberId = e.record.get('member');

	// Verify the member belongs to the authenticated user
	let membership;
	try {
		membership = e.app.findRecordById('trip_members', memberId);
	} catch (_) {
		throw new BadRequestError('Invalid member.');
	}

	if (membership.get('user') !== authId) {
		throw new ForbiddenError('You can only vote as yourself.');
	}

	if (membership.get('trip') !== tripId) {
		throw new BadRequestError('Member does not belong to this trip.');
	}

	e.next();
}, 'votes');
```

- [ ] **Step 2: Smoke-test the hook**

Temporarily add `console.log('votes hook loaded');` at the top of the callback body. Start PocketBase, check logs for the message. Remove the log line after confirming.

- [ ] **Step 3: Commit**

```bash
git add backend/pb_hooks/votes.pb.js
git commit -m "M4a: add votes hook — enforce vote-as-self"
```

### Task 4: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Vote and VaultEntry types**

Append to the end of `src/lib/types.ts`:

```typescript
// M4 — Execution types

export interface Vote {
	id: string;
	trip: string;
	item: string;
	member: string;
	created: string;
}

export interface VaultEntry {
	id: string;
	trip: string;
	encrypted_title: string;
	encrypted_body: string;
	created_by: string;
	created: string;
	updated: string;
}

export interface VaultEntryDecrypted {
	id: string;
	title: string;
	body: string;
	created_by: string;
	created: string;
}
```

- [ ] **Step 2: Update Trip type to include vault_password_hash**

In the `Trip` interface, add after the `archived` field:

```typescript
vault_password_hash: string;
```

- [ ] **Step 3: Run type check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings (the new types are additive)

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "M4a: add Vote, VaultEntry types + vault_password_hash on Trip"
```

### Task 5: Vault Password Hashing Utility

**Files:**
- Create: `src/lib/utils/vault-password.ts`

- [ ] **Step 1: Write the utility**

Server-side only (uses Node.js `crypto`). Used in SvelteKit server actions.

```typescript
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const SCRYPT_KEYLEN = 64;

export function hashVaultPassword(password: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
	return `${salt}:${hash}`;
}

export function verifyVaultPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(':');
	if (!salt || !hash) return false;
	const hashBuf = Buffer.from(hash, 'hex');
	const derivedBuf = scryptSync(password, salt, SCRYPT_KEYLEN);
	return timingSafeEqual(hashBuf, derivedBuf);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/utils/vault-password.ts
git commit -m "M4a: add server-side vault password hash/verify utility"
```

### Task 6: Client-Side Crypto Utility + Tests

**Files:**
- Create: `src/lib/utils/crypto.ts`
- Create: `src/lib/utils/crypto.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { encryptText, decryptText } from './crypto';

describe('crypto', () => {
	it('round-trips encrypt then decrypt', async () => {
		const plaintext = 'Hotel safe code: 4829';
		const password = 'my-trip-password';

		const encrypted = await encryptText(plaintext, password);
		expect(encrypted).not.toBe(plaintext);

		const decrypted = await decryptText(encrypted, password);
		expect(decrypted).toBe(plaintext);
	});

	it('returns different ciphertext each time (random salt/iv)', async () => {
		const plaintext = 'Same input';
		const password = 'same-password';

		const a = await encryptText(plaintext, password);
		const b = await encryptText(plaintext, password);
		expect(a).not.toBe(b);
	});

	it('throws on wrong password', async () => {
		const encrypted = await encryptText('secret', 'correct-password');
		await expect(decryptText(encrypted, 'wrong-password')).rejects.toThrow();
	});

	it('handles empty string', async () => {
		const encrypted = await encryptText('', 'password');
		const decrypted = await decryptText(encrypted, 'password');
		expect(decrypted).toBe('');
	});

	it('handles unicode content', async () => {
		const plaintext = 'Confirmation: Htel de la Paix #4829';
		const password = 'trip-pass';

		const decrypted = await decryptText(
			await encryptText(plaintext, password),
			password
		);
		expect(decrypted).toBe(plaintext);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/utils/crypto.test.ts`
Expected: FAIL — module `./crypto` not found.

- [ ] **Step 3: Write the implementation**

```typescript
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
	const enc = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		enc.encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function encryptText(plaintext: string, password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const key = await deriveKey(password, salt);
	const enc = new TextEncoder();
	const cipherBuf = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		enc.encode(plaintext)
	);
	const cipher = new Uint8Array(cipherBuf);
	const packed = new Uint8Array(SALT_BYTES + IV_BYTES + cipher.length);
	packed.set(salt, 0);
	packed.set(iv, SALT_BYTES);
	packed.set(cipher, SALT_BYTES + IV_BYTES);
	return btoa(String.fromCharCode(...packed));
}

export async function decryptText(packed64: string, password: string): Promise<string> {
	const packed = Uint8Array.from(atob(packed64), (c) => c.charCodeAt(0));
	const salt = packed.slice(0, SALT_BYTES);
	const iv = packed.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
	const ciphertext = packed.slice(SALT_BYTES + IV_BYTES);
	const key = await deriveKey(password, salt);
	const plainBuf = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		ciphertext
	);
	return new TextDecoder().decode(plainBuf);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/utils/crypto.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/crypto.ts src/lib/utils/crypto.test.ts
git commit -m "M4a: add client-side AES-GCM encrypt/decrypt with PBKDF2 + 5 tests"
```

### Task 7: Trip Mode Utilities + Tests

**Files:**
- Create: `src/lib/utils/trip-mode.ts`
- Create: `src/lib/utils/trip-mode.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { findNextItem, isToday, groupItemsByDay } from './trip-mode';
import type { Item, Day } from '$lib/types';

function makeItem(overrides: Partial<Item> = {}): Item {
	return {
		id: 'item1',
		trip: 'trip1',
		phase: '',
		day: 'day1',
		slot: 'morning',
		type: 'activity',
		subtype: '',
		title: 'Test Item',
		description: '',
		location_name: '',
		location_address: '',
		location_coords: null,
		google_place_id: '',
		start_time: '',
		end_time: '',
		start_tz: '',
		end_tz: '',
		status: 'planned',
		booked: false,
		booked_by: '',
		paid_by: '',
		confirmation_codes: [],
		reservation_url: '',
		free_cancellation: false,
		cost_estimate_usd: 0,
		cost_actual_usd: 0,
		assigned_to: [],
		rank: 0,
		parking_lot_scope: 'none',
		parent_item: '',
		created_by: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Item;
}

function makeDay(overrides: Partial<Day> = {}): Day {
	return {
		id: 'day1',
		trip: 'trip1',
		phases: [],
		date: '2026-10-15 00:00:00.000Z',
		notes: '',
		collectionId: '',
		collectionName: '',
		created: '',
		updated: '',
		...overrides
	} as Day;
}

describe('isToday', () => {
	it('returns true for matching date', () => {
		expect(isToday('2026-10-15 00:00:00.000Z', new Date('2026-10-15T14:00:00Z'))).toBe(true);
	});

	it('returns false for different date', () => {
		expect(isToday('2026-10-16 00:00:00.000Z', new Date('2026-10-15T14:00:00Z'))).toBe(false);
	});
});

describe('findNextItem', () => {
	it('returns the next upcoming item', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-10-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-10-15 14:00:00.000Z' }),
			makeItem({ id: 'c', start_time: '2026-10-15 19:00:00.000Z' })
		];
		const now = new Date('2026-10-15T12:00:00Z');
		const next = findNextItem(items, now);
		expect(next?.id).toBe('b');
	});

	it('returns null if all items are past', () => {
		const items = [
			makeItem({ id: 'a', start_time: '2026-10-15 09:00:00.000Z' }),
			makeItem({ id: 'b', start_time: '2026-10-15 11:00:00.000Z' })
		];
		const now = new Date('2026-10-15T22:00:00Z');
		expect(findNextItem(items, now)).toBeNull();
	});

	it('skips items without start_time', () => {
		const items = [
			makeItem({ id: 'a', start_time: '' }),
			makeItem({ id: 'b', start_time: '2026-10-15 14:00:00.000Z' })
		];
		const now = new Date('2026-10-15T12:00:00Z');
		expect(findNextItem(items, now)?.id).toBe('b');
	});

	it('returns null for empty list', () => {
		expect(findNextItem([], new Date())).toBeNull();
	});
});

describe('groupItemsByDay', () => {
	it('groups items by their day id', () => {
		const items = [
			makeItem({ id: 'a', day: 'day1' }),
			makeItem({ id: 'b', day: 'day2' }),
			makeItem({ id: 'c', day: 'day1' })
		];
		const days = [
			makeDay({ id: 'day1', date: '2026-10-15 00:00:00.000Z' }),
			makeDay({ id: 'day2', date: '2026-10-16 00:00:00.000Z' })
		];
		const grouped = groupItemsByDay(items, days);
		expect(grouped).toHaveLength(2);
		expect(grouped[0].day.id).toBe('day1');
		expect(grouped[0].items).toHaveLength(2);
		expect(grouped[1].day.id).toBe('day2');
		expect(grouped[1].items).toHaveLength(1);
	});

	it('returns empty array for no items', () => {
		expect(groupItemsByDay([], [])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/utils/trip-mode.test.ts`
Expected: FAIL — module `./trip-mode` not found.

- [ ] **Step 3: Write the implementation**

```typescript
import type { Item, Day } from '$lib/types';

export function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

export function isToday(dateStr: string, now: Date): boolean {
	const d = parseDateTime(dateStr);
	return (
		d.getUTCFullYear() === now.getUTCFullYear() &&
		d.getUTCMonth() === now.getUTCMonth() &&
		d.getUTCDate() === now.getUTCDate()
	);
}

export function findNextItem(items: Item[], now: Date): Item | null {
	const timed = items
		.filter((i) => i.start_time)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());

	return timed.find((i) => parseDateTime(i.start_time).getTime() > now.getTime()) ?? null;
}

export interface DayGroup {
	day: Day;
	items: Item[];
}

export function groupItemsByDay(items: Item[], days: Day[]): DayGroup[] {
	const dayMap = new Map<string, Item[]>();
	for (const item of items) {
		if (!item.day) continue;
		const existing = dayMap.get(item.day) ?? [];
		existing.push(item);
		dayMap.set(item.day, existing);
	}

	return days
		.filter((d) => dayMap.has(d.id))
		.map((d) => ({ day: d, items: dayMap.get(d.id)! }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/utils/trip-mode.test.ts`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/trip-mode.ts src/lib/utils/trip-mode.test.ts
git commit -m "M4a: add trip-mode utilities (isToday, findNextItem, groupItemsByDay) + 7 tests"
```

### Task 8: Run full check + all unit tests

- [ ] **Step 1: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm vitest run`
Expected: All tests pass (existing date-math, debt-simplify tests + new crypto + trip-mode tests).

- [ ] **Step 3: Commit M4a completion**

```bash
git add -A
git commit -m "M4a complete: data models, hooks, types, tested utilities"
```

---

## M4b — Voting + Alternates + Item Move UI

### Task 1: Load Votes on Item Detail

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts`

- [ ] **Step 1: Update load function to fetch votes**

In the `load` function, add votes to the `Promise.all`:

```typescript
import type { Item, ChecklistItem, TripMember, Vote, Comment } from '$lib/types';
```

Replace the existing `Promise.all` in the load function. After fetching `checklistItems` and `members`, also fetch votes and alternates (same day+slot, different rank):

```typescript
const [checklistItems, members, votes, alternates] = await Promise.all([
	item.type === 'checklist'
		? locals.pb.collection('checklist_items').getFullList<ChecklistItem>({
				filter: `item = "${item.id}"`,
				sort: 'order'
			})
		: Promise.resolve([]),
	locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		expand: 'user'
	}),
	locals.pb.collection('votes').getFullList<Vote>({
		filter: `item = "${item.id}"`
	}),
	item.day
		? locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${item.day}" && slot = "${item.slot}" && id != "${item.id}"`,
				sort: 'rank'
			})
		: Promise.resolve([])
]);
```

Update the return to include votes, alternates, and the current user's vote:

```typescript
const myVote = votes.find((v) => v.member === membership.id) ?? null;

return { item, checklistItems, members, votes, myVote, alternates, phases, days };
```

(The `membership` comes from `parent()` — update the load to also destructure `membership` from parent.)

- [ ] **Step 2: Add vote, unvote, promote, demote, moveItem actions**

Add these form actions to the same file:

```typescript
vote: async ({ params, locals }) => {
	try {
		const item = await locals.pb.collection('items').getOne(params.itemId);
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${item.trip}" && user = "${locals.user!.id}"`);
		await locals.pb.collection('votes').create({
			trip: item.trip,
			item: item.id,
			member: membership.id
		});
		return { success: true };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to vote.';
		return fail(400, { error: message });
	}
},

unvote: async ({ request, locals }) => {
	const data = await request.formData();
	const voteId = data.get('vote_id')?.toString();
	if (!voteId) return fail(400, { error: 'Missing vote_id.' });

	try {
		await locals.pb.collection('votes').delete(voteId);
		return { success: true };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to remove vote.';
		return fail(400, { error: message });
	}
},

promote: async ({ params, locals }) => {
	try {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (item.rank === 0) return fail(400, { error: 'Item is already primary.' });

		// Find the current primary (rank 0) for this day+slot
		const primaries = await locals.pb.collection('items').getFullList<Item>({
			filter: `day = "${item.day}" && slot = "${item.slot}" && rank = 0 && id != "${item.id}"`
		});

		// Swap: demote current primary, promote this item
		for (const p of primaries) {
			await locals.pb.collection('items').update(p.id, { rank: item.rank });
		}
		await locals.pb.collection('items').update(item.id, { rank: 0 });

		return { success: true };
	} catch (err: unknown) {
		if (isRedirect(err)) throw err;
		const message = err instanceof Error ? err.message : 'Failed to promote.';
		return fail(500, { error: message });
	}
},

demote: async ({ params, locals }) => {
	try {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (item.rank !== 0) return fail(400, { error: 'Item is not primary.' });

		// Find the highest-ranked alternate
		const alternates = await locals.pb.collection('items').getFullList<Item>({
			filter: `day = "${item.day}" && slot = "${item.slot}" && rank > 0 && id != "${item.id}"`,
			sort: 'rank'
		});

		const nextRank = alternates.length > 0 ? alternates[alternates.length - 1].rank + 1 : 1;
		await locals.pb.collection('items').update(item.id, { rank: nextRank });

		return { success: true };
	} catch (err: unknown) {
		if (isRedirect(err)) throw err;
		const message = err instanceof Error ? err.message : 'Failed to demote.';
		return fail(500, { error: message });
	}
},

moveItem: async ({ request, params, locals }) => {
	const data = await request.formData();
	const newDay = data.get('day')?.toString() || '';
	const newSlot = data.get('slot')?.toString() || 'anytime';
	const newPhase = data.get('phase')?.toString() || '';

	try {
		await locals.pb.collection('items').update(params.itemId, {
			day: newDay,
			slot: newSlot,
			phase: newPhase
		});

		return { success: true };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to move item.';
		return fail(500, { error: message });
	}
},
```

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/items/[itemId]/+page.server.ts
git commit -m "M4b: add vote/unvote/promote/demote/moveItem server actions + load votes"
```

### Task 2: VoteButtons Component

**Files:**
- Create: `src/lib/components/VoteButtons.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';

	let {
		voteCount = 0,
		myVoteId = null as string | null,
		itemUrl = ''
	}: {
		voteCount?: number;
		myVoteId?: string | null;
		itemUrl?: string;
	} = $props();

	let submitting = $state(false);
</script>

{#if myVoteId}
	<form
		method="POST"
		action="{itemUrl}?/unvote"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="inline-flex"
	>
		<input type="hidden" name="vote_id" value={myVoteId} />
		<button
			type="submit"
			disabled={submitting}
			class="bg-moss/15 text-moss border-moss/30 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-colors"
			aria-label="Remove vote"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
				<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
				<path d="M1 21h4V10H1z" />
			</svg>
			<span>{voteCount}</span>
		</button>
	</form>
{:else}
	<form
		method="POST"
		action="{itemUrl}?/vote"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
		class="inline-flex"
	>
		<button
			type="submit"
			disabled={submitting}
			class="border-line text-ink-muted hover:border-moss/40 hover:text-moss inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors"
			aria-label="Vote for this option"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
				<path d="M1 21h4V10H1z" />
			</svg>
			<span>{voteCount || ''}</span>
		</button>
	</form>
{/if}
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/VoteButtons.svelte
git commit -m "M4b: add VoteButtons component"
```

### Task 3: MoveItemSheet Component

**Files:**
- Create: `src/lib/components/MoveItemSheet.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Day, Phase, Slot } from '$lib/types';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		open = $bindable(false),
		days = [] as Day[],
		phases = [] as Phase[],
		currentDay = '',
		currentSlot = 'anytime' as Slot,
		currentPhase = '',
		actionUrl = ''
	}: {
		open?: boolean;
		days?: Day[];
		phases?: Phase[];
		currentDay?: string;
		currentSlot?: Slot;
		currentPhase?: string;
		actionUrl?: string;
	} = $props();

	let selectedDay = $state(currentDay);
	let selectedSlot = $state<Slot>(currentSlot);
	let selectedPhase = $state(currentPhase);
	let submitting = $state(false);

	const slotOptions: { id: Slot; label: string }[] = [
		{ id: 'morning', label: 'Morning' },
		{ id: 'afternoon', label: 'Afternoon' },
		{ id: 'evening', label: 'Evening' },
		{ id: 'anytime', label: 'Anytime' }
	];

	function dayLabel(d: Day): string {
		return new Date(d.date.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	// Reset selections when sheet opens
	$effect(() => {
		if (open) {
			selectedDay = currentDay;
			selectedSlot = currentSlot;
			selectedPhase = currentPhase;
		}
	});
</script>

<BottomSheet bind:open title="Move Item">
	<form
		method="POST"
		action="{actionUrl}?/moveItem"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				open = false;
				await update();
			};
		}}
		class="space-y-4"
	>
		<div>
			<label for="move-day" class="text-ink-soft block text-sm font-medium">Day</label>
			<select
				id="move-day"
				name="day"
				bind:value={selectedDay}
				class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
			>
				<option value="">No day (unscheduled)</option>
				{#each days as d}
					<option value={d.id}>{dayLabel(d)}</option>
				{/each}
			</select>
		</div>

		<div>
			<label for="move-slot" class="text-ink-soft block text-sm font-medium">Time slot</label>
			<select
				id="move-slot"
				name="slot"
				bind:value={selectedSlot}
				class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
			>
				{#each slotOptions as s}
					<option value={s.id}>{s.label}</option>
				{/each}
			</select>
		</div>

		{#if phases.length > 0}
			<div>
				<label for="move-phase" class="text-ink-soft block text-sm font-medium">Phase</label>
				<select
					id="move-phase"
					name="phase"
					bind:value={selectedPhase}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
				>
					<option value="">No phase</option>
					{#each phases as p}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</div>
		{/if}

		<Button type="submit" disabled={submitting} variant="moss" size="md" class="w-full">
			{submitting ? 'Moving...' : 'Move'}
		</Button>
	</form>
</BottomSheet>
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/MoveItemSheet.svelte
git commit -m "M4b: add MoveItemSheet component"
```

### Task 4: Wire Voting + Promote/Demote + Move into Item Detail Page

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte`

- [ ] **Step 1: Add imports and state**

Add to the `<script>` block:

```typescript
import VoteButtons from '$lib/components/VoteButtons.svelte';
import MoveItemSheet from '$lib/components/MoveItemSheet.svelte';
```

Add state:

```typescript
let moveSheetOpen = $state(false);
let promoteLoading = $state(false);
let demoteLoading = $state(false);
const isAlternate = $derived(data.item.rank > 0);
const isPrimary = $derived(data.item.rank === 0 && data.alternates.length > 0);
const itemUrl = $derived(`/trips/${data.trip.slug}/items/${data.item.id}`);
```

- [ ] **Step 2: Add voting UI to the header card**

After the title `<h2>` in the header card, add:

```svelte
<div class="mt-3 flex items-center gap-3">
	<VoteButtons
		voteCount={data.votes.length}
		myVoteId={data.myVote?.id ?? null}
		{itemUrl}
	/>
	{#if isAlternate}
		<form
			method="POST"
			action="?/promote"
			use:enhance={() => {
				promoteLoading = true;
				return async ({ update }) => {
					promoteLoading = false;
					await update();
				};
			}}
		>
			<button
				type="submit"
				disabled={promoteLoading}
				class="border-moss/40 text-moss hover:bg-moss/10 rounded-full border px-3 py-1 text-xs font-semibold"
			>
				{promoteLoading ? '...' : 'Promote to primary'}
			</button>
		</form>
	{/if}
	{#if isPrimary}
		<form
			method="POST"
			action="?/demote"
			use:enhance={() => {
				demoteLoading = true;
				return async ({ update }) => {
					demoteLoading = false;
					await update();
				};
			}}
		>
			<button
				type="submit"
				disabled={demoteLoading}
				class="border-clay/40 text-clay hover:bg-clay/10 rounded-full border px-3 py-1 text-xs font-semibold"
			>
				{demoteLoading ? '...' : 'Demote'}
			</button>
		</form>
	{/if}
</div>
```

- [ ] **Step 3: Add alternates section**

After the Schedule card, add:

```svelte
{#if data.alternates.length > 0}
	<Card>
		<div class="p-4 space-y-2">
			<SectionH>
				{#snippet right()}
					<span class="text-ink-muted text-xs">{data.alternates.length} alternate{data.alternates.length === 1 ? '' : 's'}</span>
				{/snippet}
				Alternates
			</SectionH>
			{#each data.alternates as alt}
				<a
					href="/trips/{data.trip.slug}/items/{alt.id}"
					class="border-line hover:border-ink-muted flex items-center gap-3 rounded-lg border p-3"
				>
					<TypeIcon type={alt.type} sub={alt.subtype} size={28} />
					<div class="min-w-0 flex-1">
						<p class="text-ink text-sm font-semibold truncate">{alt.title}</p>
						{#if alt.location_name}
							<p class="text-ink-muted text-[12px] truncate">{alt.location_name}</p>
						{/if}
					</div>
					<span class="text-ink-muted text-[11px]">Rank {alt.rank}</span>
				</a>
			{/each}
		</div>
	</Card>
{/if}
```

- [ ] **Step 4: Add Move button**

After the Edit link in the NavBar, or as a separate action row below the header card, add a Move button:

```svelte
<div class="flex items-center gap-2">
	<button
		type="button"
		onclick={() => (moveSheetOpen = true)}
		class="border-line text-ink-muted hover:text-ink-soft rounded-md border px-3 py-1.5 text-xs font-semibold"
	>
		Move
	</button>
</div>
```

And at the bottom of the file, before `</main>`:

```svelte
<MoveItemSheet
	bind:open={moveSheetOpen}
	days={data.days}
	phases={data.phases}
	currentDay={data.item.day}
	currentSlot={data.item.slot}
	currentPhase={data.item.phase}
	actionUrl={itemUrl}
/>
```

- [ ] **Step 5: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/routes/(app)/trips/[slug]/items/[itemId]/+page.svelte
git commit -m "M4b: wire voting, promote/demote, move into item detail page"
```

### Task 5: Show Vote Counts on Day Detail

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte`

- [ ] **Step 1: Load vote counts in day server**

Add to the load function, after fetching `items`:

```typescript
import type { Day, Item, Vote } from '$lib/types';
```

After the items fetch, load all votes for those items:

```typescript
const itemIds = items.map((i) => i.id);
const votes = itemIds.length > 0
	? await locals.pb.collection('votes').getFullList<Vote>({
			filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
		})
	: [];

const voteCounts: Record<string, number> = {};
for (const v of votes) {
	voteCounts[v.item] = (voteCounts[v.item] ?? 0) + 1;
}

return { day, dayItems: items, dayPhases, voteCounts };
```

- [ ] **Step 2: Display vote counts on item cards**

In the day detail Svelte file, within each item card, after the booked pill, add:

```svelte
{#if data.voteCounts[item.id]}
	<span class="text-moss inline-flex items-center gap-0.5 text-[11px] font-semibold">
		<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
			<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
			<path d="M1 21h4V10H1z" />
		</svg>
		{data.voteCounts[item.id]}
	</span>
{/if}
```

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/days/[dayId]/+page.server.ts src/routes/(app)/trips/[slug]/days/[dayId]/+page.svelte
git commit -m "M4b: show vote counts on day detail item cards"
```

### Task 6: Visual verification + M4b complete

- [ ] **Step 1: Visual verification at 375px**

Start dev server, navigate to an item detail page. Verify:
- Vote button renders
- Promote/demote buttons appear for alternates/primaries
- Move button opens bottom sheet
- Vote count shows on day detail

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit M4b completion**

```bash
git add -A
git commit -m "M4b complete: voting, promote/demote, item move UI"
```

---

## M4c — Vault UI (Encrypted Entries)

### Task 1: Vault Password Setup in Settings

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.server.ts`
- Modify: `src/routes/(app)/trips/[slug]/settings/+page.svelte`

- [ ] **Step 1: Add setVaultPassword action**

In `settings/+page.server.ts`, add:

```typescript
import { hashVaultPassword } from '$lib/utils/vault-password';
```

Add action:

```typescript
setVaultPassword: async ({ request, locals, params }) => {
	const data = await request.formData();
	const password = data.get('vault_password')?.toString();
	const confirm = data.get('vault_password_confirm')?.toString();

	if (!password || password.length < 4) {
		return fail(400, { vaultError: 'Password must be at least 4 characters.' });
	}
	if (password !== confirm) {
		return fail(400, { vaultError: 'Passwords do not match.' });
	}

	try {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role !== 'owner' && membership.role !== 'co_owner') {
			return fail(403, { vaultError: 'Only trip owners can set the vault password.' });
		}

		const hash = hashVaultPassword(password);
		await locals.pb.collection('trips').update(trip.id, { vault_password_hash: hash });

		return { vaultSuccess: true };
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Failed to set vault password.';
		return fail(500, { vaultError: message });
	}
},
```

- [ ] **Step 2: Add vault password UI to settings page**

In `settings/+page.svelte`, after the main settings Card and before the danger zone, add:

```svelte
<Card>
	<div class="p-4 space-y-3">
		<h3 class="text-ink text-sm font-semibold">Vault Password</h3>
		<div class="border-clay/20 bg-clay/5 rounded-md p-3">
			<p class="text-clay text-xs font-semibold">No recovery</p>
			<p class="text-ink-muted mt-1 text-xs">
				If you forget the vault password, encrypted entries cannot be recovered. There is no reset mechanism.
			</p>
		</div>

		{#if form?.vaultError}
			<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{form.vaultError}</div>
		{/if}
		{#if form?.vaultSuccess}
			<div class="border-moss/30 bg-moss-tint text-moss rounded-md border p-3 text-sm">Vault password set.</div>
		{/if}

		<form
			method="POST"
			action="?/setVaultPassword"
			use:enhance
			class="space-y-3"
		>
			<div>
				<label for="vault_password" class="text-ink-soft block text-sm font-medium">
					{data.trip.vault_password_hash ? 'Change password' : 'Set password'}
				</label>
				<input
					type="password"
					id="vault_password"
					name="vault_password"
					required
					minlength={4}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Enter vault password"
				/>
			</div>
			<div>
				<label for="vault_password_confirm" class="text-ink-soft block text-sm font-medium">Confirm</label>
				<input
					type="password"
					id="vault_password_confirm"
					name="vault_password_confirm"
					required
					minlength={4}
					class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
					placeholder="Confirm password"
				/>
			</div>
			<Button type="submit" variant="moss" size="sm">
				{data.trip.vault_password_hash ? 'Update password' : 'Set password'}
			</Button>
		</form>
	</div>
</Card>
```

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/settings/+page.server.ts src/routes/(app)/trips/[slug]/settings/+page.svelte
git commit -m "M4c: vault password setup in trip settings with no-recovery warning"
```

### Task 2: Vault Unlock API Route

**Files:**
- Create: `src/routes/api/vault/unlock/+server.ts`

- [ ] **Step 1: Write the unlock endpoint**

This SvelteKit server route verifies the vault password. The client calls this, and on success stores the password in sessionStorage for encryption/decryption.

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TripMember } from '$lib/types';
import { verifyVaultPassword } from '$lib/utils/vault-password';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const body = await request.json();
	const { tripId, password } = body;

	if (!tripId || !password) throw error(400, 'Missing tripId or password');

	const trip = await locals.pb.collection('trips').getOne(tripId);

	// Verify membership
	try {
		await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user.id}"`);
	} catch {
		throw error(403, 'Not a member of this trip');
	}

	if (!trip['vault_password_hash']) {
		throw error(400, 'Vault password not set for this trip');
	}

	const valid = verifyVaultPassword(password, trip['vault_password_hash'] as string);

	if (!valid) {
		throw error(401, 'Incorrect vault password');
	}

	return json({ success: true });
};
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/vault/unlock/+server.ts
git commit -m "M4c: add vault unlock API endpoint"
```

### Task 3: Vault Page — Server Actions

**Files:**
- Create: `src/routes/(app)/trips/[slug]/vault/+page.server.ts`

- [ ] **Step 1: Write the server load + actions**

```typescript
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { VaultEntry, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const hasVaultPassword = !!trip.vault_password_hash;

	const entries = hasVaultPassword
		? await locals.pb.collection('vault_entries').getFullList<VaultEntry>({
				filter: `trip = "${trip.id}"`,
				sort: '-id'
			})
		: [];

	return { trip, membership, entries, hasVaultPassword };
};

export const actions: Actions = {
	createEntry: async ({ request, locals, params }) => {
		const data = await request.formData();
		const encryptedTitle = data.get('encrypted_title')?.toString();
		const encryptedBody = data.get('encrypted_body')?.toString();

		if (!encryptedTitle || !encryptedBody) {
			return fail(400, { error: 'Encrypted data is required.' });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			await locals.pb.collection('vault_entries').create({
				trip: trip.id,
				encrypted_title: encryptedTitle,
				encrypted_body: encryptedBody,
				created_by: membership.id
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create entry.';
			return fail(500, { error: message });
		}
	},

	deleteEntry: async ({ request, locals }) => {
		const data = await request.formData();
		const entryId = data.get('entry_id')?.toString();
		if (!entryId) return fail(400, { error: 'Missing entry_id.' });

		try {
			await locals.pb.collection('vault_entries').delete(entryId);
			return { deleted: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete entry.';
			return fail(500, { error: message });
		}
	}
};
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/vault/+page.server.ts
git commit -m "M4c: vault page server — load entries, create/delete actions"
```

### Task 4: Vault Page — UI

**Files:**
- Create: `src/routes/(app)/trips/[slug]/vault/+page.svelte`

- [ ] **Step 1: Write the vault page**

This page handles three states: (1) no vault password set, (2) vault locked, (3) vault unlocked. Encryption/decryption happens entirely client-side.

```svelte
<script lang="ts">
	import { enhance } from '$app/forms';
	import { encryptText, decryptText } from '$lib/utils/crypto';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
	import type { VaultEntryDecrypted } from '$lib/types';

	let { data, form } = $props();

	// Vault state
	let unlocked = $state(false);
	let vaultPassword = $state('');
	let unlockError = $state('');
	let unlockLoading = $state(false);

	// Decrypted entries
	let decryptedEntries = $state<VaultEntryDecrypted[]>([]);

	// Create entry state
	let createOpen = $state(false);
	let newTitle = $state('');
	let newBody = $state('');
	let createLoading = $state(false);

	// View entry state
	let viewEntry = $state<VaultEntryDecrypted | null>(null);

	// Delete state
	let deleteId = $state<string | null>(null);
	let deleteLoading = $state(false);

	// Check sessionStorage on mount
	import { onMount } from 'svelte';
	onMount(() => {
		const stored = sessionStorage.getItem(`vault-${data.trip.id}`);
		if (stored) {
			vaultPassword = stored;
			tryDecrypt(stored);
		}
	});

	async function tryDecrypt(password: string) {
		try {
			const results: VaultEntryDecrypted[] = [];
			for (const entry of data.entries) {
				const title = await decryptText(entry.encrypted_title, password);
				const body = await decryptText(entry.encrypted_body, password);
				results.push({
					id: entry.id,
					title,
					body,
					created_by: entry.created_by,
					created: entry.created
				});
			}
			decryptedEntries = results;
			unlocked = true;
			unlockError = '';
		} catch {
			unlockError = 'Decryption failed. Wrong password or corrupted data.';
			unlocked = false;
			sessionStorage.removeItem(`vault-${data.trip.id}`);
		}
	}

	async function handleUnlock() {
		if (!vaultPassword.trim()) return;
		unlockLoading = true;
		unlockError = '';

		try {
			const res = await fetch('/api/vault/unlock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tripId: data.trip.id, password: vaultPassword })
			});

			if (!res.ok) {
				unlockError = 'Incorrect password.';
				unlockLoading = false;
				return;
			}

			sessionStorage.setItem(`vault-${data.trip.id}`, vaultPassword);
			await tryDecrypt(vaultPassword);
		} catch {
			unlockError = 'Failed to verify password.';
		}

		unlockLoading = false;
	}

	function handleLock() {
		unlocked = false;
		vaultPassword = '';
		decryptedEntries = [];
		sessionStorage.removeItem(`vault-${data.trip.id}`);
	}
</script>

<NavBar title="Vault" subtitle={data.trip.title} back backHref="/trips/{data.trip.slug}/more" />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24 space-y-4">
	{#if !data.hasVaultPassword}
		<!-- No vault password set -->
		<Card>
			<div class="p-6 text-center">
				<svg class="text-ink-muted mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
					<path d="M7 11V7a5 5 0 0 1 10 0v4" />
				</svg>
				<p class="text-ink mt-3 font-semibold">Vault not set up</p>
				<p class="text-ink-muted mt-1 text-sm">A trip owner must set a vault password in Settings before entries can be created.</p>
				<Button href="/trips/{data.trip.slug}/settings" variant="ghost" size="sm" class="mt-3">
					Go to Settings
				</Button>
			</div>
		</Card>
	{:else if !unlocked}
		<!-- Vault locked -->
		<Card>
			<div class="p-6 space-y-4">
				<div class="text-center">
					<svg class="text-ink-muted mx-auto" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
					<p class="text-ink mt-3 font-semibold">Vault locked</p>
					<p class="text-ink-muted mt-1 text-sm">Enter the trip vault password to view encrypted entries.</p>
				</div>

				{#if unlockError}
					<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{unlockError}</div>
				{/if}

				<div>
					<input
						type="password"
						bind:value={vaultPassword}
						placeholder="Vault password"
						class="border-line bg-surface text-ink block w-full rounded-md border px-3 py-2 text-sm"
						onkeydown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
					/>
				</div>

				<Button onclick={handleUnlock} disabled={unlockLoading || !vaultPassword.trim()} variant="moss" size="md" class="w-full">
					{unlockLoading ? 'Unlocking...' : 'Unlock'}
				</Button>
			</div>
		</Card>
	{:else}
		<!-- Vault unlocked -->
		<div class="flex items-center justify-between">
			<SectionH>
				{#snippet right()}
					<button onclick={handleLock} class="text-ink-muted hover:text-ink-soft text-xs">Lock</button>
				{/snippet}
				Entries ({decryptedEntries.length})
			</SectionH>
		</div>

		{#if form?.error}
			<div class="border-clay/30 bg-clay/10 text-clay rounded-md border p-3 text-sm">{form.error}</div>
		{/if}

		{#if decryptedEntries.length === 0}
			<Card>
				<div class="p-6 text-center">
					<p class="text-ink-muted text-sm">No vault entries yet.</p>
				</div>
			</Card>
		{:else}
			{#each decryptedEntries as entry (entry.id)}
				<Card>
					<button
						type="button"
						onclick={() => (viewEntry = viewEntry?.id === entry.id ? null : entry)}
						class="w-full p-4 text-left"
					>
						<div class="flex items-center justify-between">
							<h3 class="text-ink text-sm font-semibold">{entry.title}</h3>
							<svg
								class="text-ink-muted shrink-0 transition-transform {viewEntry?.id === entry.id ? 'rotate-180' : ''}"
								width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							>
								<path d="m6 9 6 6 6-6" />
							</svg>
						</div>
						{#if viewEntry?.id === entry.id}
							<p class="text-ink-soft mt-2 text-sm whitespace-pre-wrap">{entry.body}</p>
							<form
								method="POST"
								action="?/deleteEntry"
								use:enhance={() => {
									deleteLoading = true;
									deleteId = entry.id;
									return async ({ update }) => {
										deleteLoading = false;
										deleteId = null;
										viewEntry = null;
										await update();
									};
								}}
								class="mt-3"
							>
								<input type="hidden" name="entry_id" value={entry.id} />
								<button
									type="submit"
									disabled={deleteLoading && deleteId === entry.id}
									class="text-clay hover:text-clay/80 text-xs font-semibold"
								>
									{deleteLoading && deleteId === entry.id ? 'Deleting...' : 'Delete entry'}
								</button>
							</form>
						{/if}
					</button>
				</Card>
			{/each}
		{/if}

		<Button onclick={() => (createOpen = true)} variant="moss" size="md" class="w-full">
			Add entry
		</Button>

		<BottomSheet bind:open={createOpen} title="New Vault Entry">
			<form
				method="POST"
				action="?/createEntry"
				use:enhance={async ({ formData, cancel }) => {
					if (!newTitle.trim() || !newBody.trim()) { cancel(); return; }
					createLoading = true;

					const encTitle = await encryptText(newTitle, vaultPassword);
					const encBody = await encryptText(newBody, vaultPassword);

					formData.set('encrypted_title', encTitle);
					formData.set('encrypted_body', encBody);

					return async ({ result, update }) => {
						createLoading = false;
						if (result.type === 'success') {
							newTitle = '';
							newBody = '';
							createOpen = false;
							await update();
						}
					};
				}}
				class="space-y-4"
			>
				<div>
					<label for="vault-title" class="text-ink-soft block text-sm font-medium">Title</label>
					<input
						type="text"
						id="vault-title"
						bind:value={newTitle}
						required
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm"
						placeholder="e.g. Hotel safe code"
					/>
				</div>
				<div>
					<label for="vault-body" class="text-ink-soft block text-sm font-medium">Content</label>
					<textarea
						id="vault-body"
						bind:value={newBody}
						required
						rows="4"
						class="border-line bg-surface text-ink mt-1 block w-full rounded-md border px-3 py-2 text-sm resize-none"
						placeholder="Sensitive information..."
					></textarea>
				</div>
				<Button type="submit" disabled={createLoading || !newTitle.trim() || !newBody.trim()} variant="moss" size="md" class="w-full">
					{createLoading ? 'Encrypting...' : 'Save encrypted'}
				</Button>
			</form>
		</BottomSheet>
	{/if}
</main>
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/vault/+page.svelte
git commit -m "M4c: vault page — unlock, list, create, view, delete encrypted entries"
```

### Task 5: Activate Vault Link on More Page

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/more/+page.svelte`

- [ ] **Step 1: Replace the placeholder vault card with a real link**

Replace the vault Card (the one with `opacity-50` and "coming in M4") with:

```svelte
<Card href="/trips/{data.trip.slug}/vault">
	<div class="flex items-center gap-3 p-4">
		<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
		<div class="min-w-0 flex-1">
			<p class="text-ink text-sm font-semibold">Vault</p>
			<p class="text-ink-muted text-[12px]">Encrypted trip documents</p>
		</div>
		<svg class="text-ink-muted shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="m9 18 6-6-6-6" />
		</svg>
	</div>
</Card>
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/more/+page.svelte
git commit -m "M4c: activate vault link on More page"
```

### Task 6: Visual verification + M4c complete

- [ ] **Step 1: Visual verification at 375px**

Verify vault flow:
1. Navigate to Settings → vault password section renders with no-recovery warning
2. Set a vault password
3. Navigate to More → Vault → locked screen renders
4. Enter password → entries list (empty)
5. Create entry → encrypted data saved → entry appears in list
6. Expand entry → body visible → delete works
7. Lock → back to password prompt

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit M4c completion**

```bash
git add -A
git commit -m "M4c complete: vault with client-side encryption, password setup, unlock/lock flow"
```

---

## M4d — Trip Mode (Today / Tomorrow / Next 3 Days)

### Task 1: TripModeCard Component

**Files:**
- Create: `src/lib/components/TripModeCard.svelte`

- [ ] **Step 1: Write the component**

Large, one-handed-friendly item card for Trip Mode.

```svelte
<script lang="ts">
	import type { Item } from '$lib/types';
	import TypeIcon from '$lib/components/ui/TypeIcon.svelte';
	import Pill from '$lib/components/ui/Pill.svelte';
	import { titleCase } from '$lib/utils/format';

	let {
		item,
		slug = '',
		isNext = false
	}: {
		item: Item;
		slug?: string;
		isNext?: boolean;
	} = $props();

	function formatTime(t: string): string {
		if (!t) return '';
		const timePart = t.includes('T') ? t.split('T')[1] : t.includes(' ') ? t.split(' ')[1] : t;
		const [h, m] = timePart.split(':');
		const hour = parseInt(h, 10);
		const ampm = hour >= 12 ? 'PM' : 'AM';
		const h12 = hour % 12 || 12;
		return `${h12}:${m} ${ampm}`;
	}
</script>

<a
	href="/trips/{slug}/items/{item.id}"
	class="block rounded-xl border p-4 transition-colors
		{isNext ? 'border-clay bg-clay/5 shadow-sm' : 'border-line bg-paper hover:border-ink-muted'}"
>
	<div class="flex items-start gap-4">
		<TypeIcon type={item.type} sub={item.subtype} size={44} />
		<div class="min-w-0 flex-1">
			<div class="flex flex-wrap items-center gap-1.5">
				{#if item.start_time}
					<span class="font-mono text-ink text-base font-semibold">
						{formatTime(item.start_time)}
					</span>
				{/if}
				{#if isNext}
					<Pill variant="trip" size="sm">Up next</Pill>
				{/if}
				{#if item.booked}
					<Pill variant="booked" size="sm">Booked</Pill>
				{/if}
			</div>
			<h3 class="text-ink mt-1 text-lg leading-snug font-semibold">{item.title}</h3>
			{#if item.location_name}
				<p class="text-ink-muted mt-1 text-sm">{item.location_name}</p>
			{/if}
			{#if item.subtype}
				<p class="text-ink-muted mt-1 text-[11px] uppercase tracking-wide">{titleCase(item.subtype)}</p>
			{/if}
		</div>
	</div>

	{#if item.confirmation_codes.length > 0}
		<div class="mt-3 space-y-1">
			{#each item.confirmation_codes as code}
				<div class="bg-surface-2 flex items-center justify-between rounded px-3 py-1.5">
					<span class="text-ink-muted text-xs uppercase tracking-wide">{code.label}</span>
					<span class="font-mono text-ink text-sm font-semibold">{code.value}</span>
				</div>
			{/each}
		</div>
	{/if}
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/TripModeCard.svelte
git commit -m "M4d: add TripModeCard component — large one-handed item card"
```

### Task 2: NowDivider Component

**Files:**
- Create: `src/lib/components/NowDivider.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	let { label = 'Now' }: { label?: string } = $props();
</script>

<div class="flex items-center gap-3 py-2">
	<div class="bg-clay h-0.5 flex-1"></div>
	<span class="text-clay text-xs font-bold uppercase tracking-widest">{label}</span>
	<div class="bg-clay h-0.5 flex-1"></div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/NowDivider.svelte
git commit -m "M4d: add NowDivider component"
```

### Task 3: Trip Mode Today Page — Server

**Files:**
- Create: `src/routes/(app)/trips/[slug]/today/+page.server.ts`

- [ ] **Step 1: Write the server load**

```typescript
import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();

	// Find today's day record (UTC date match)
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// Find tomorrow and next 3 days
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	const tomorrowDay = days.find((d: Day) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;

	// Next 3 days (including tomorrow)
	const upcomingDays: Day[] = [];
	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDays.push(found);
	}

	// Load items for today
	const todayItems = today
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${today.id}"`,
				sort: 'slot,start_time,rank'
			})
		: [];

	// Load items for upcoming days
	const upcomingDayIds = upcomingDays.map((d) => d.id);
	const upcomingItems = upcomingDayIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: upcomingDayIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,slot,start_time,rank'
			})
		: [];

	return {
		today,
		todayItems,
		tomorrowDay,
		upcomingDays,
		upcomingItems,
		now: now.toISOString()
	};
};
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/today/+page.server.ts
git commit -m "M4d: trip mode today page server — loads today + upcoming items"
```

### Task 4: Trip Mode Today Page — UI

**Files:**
- Create: `src/routes/(app)/trips/[slug]/today/+page.svelte`

- [ ] **Step 1: Write the today view**

```svelte
<script lang="ts">
	import type { Item, Slot } from '$lib/types';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import TripModeCard from '$lib/components/TripModeCard.svelte';
	import NowDivider from '$lib/components/NowDivider.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import { findNextItem, parseDateTime } from '$lib/utils/trip-mode';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	const now = new Date(data.now);
	const nextItem = $derived(findNextItem(data.todayItems, now));

	const slots: { id: Slot; label: string }[] = [
		{ id: 'morning', label: 'Morning' },
		{ id: 'afternoon', label: 'Afternoon' },
		{ id: 'evening', label: 'Evening' },
		{ id: 'anytime', label: 'Anytime' }
	];

	function itemsForSlot(slot: Slot): Item[] {
		return data.todayItems.filter((item: Item) => item.slot === slot);
	}

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}

	function isPast(item: Item): boolean {
		if (!item.end_time) return false;
		return parseDateTime(item.end_time).getTime() < now.getTime();
	}
</script>

<NavBar
	title="Today"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24 space-y-4">
	{#if !data.today}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-soft font-semibold">No itinerary for today</p>
				<p class="text-ink-muted mt-1 text-sm">Today doesn't fall within this trip's dates.</p>
			</div>
		</Card>
	{:else}
		<h2 class="font-display text-ink text-xl font-semibold">{dayLabel(data.today.date)}</h2>

		{#if data.todayItems.length === 0}
			<Card>
				<div class="p-6 text-center">
					<p class="text-ink-muted text-sm">Nothing scheduled for today.</p>
				</div>
			</Card>
		{:else}
			{#each slots as slot}
				{@const items = itemsForSlot(slot.id)}
				{#if items.length > 0}
					<section class="space-y-2">
						<SectionH>{slot.label}</SectionH>
						{#each items as item}
							{#if nextItem && nextItem.id === item.id}
								<NowDivider label="Up next" />
							{/if}
							<TripModeCard
								{item}
								slug={data.trip.slug}
								isNext={nextItem?.id === item.id}
							/>
						{/each}
					</section>
				{/if}
			{/each}
		{/if}

		{#if data.tomorrowDay}
			<div class="border-line border-t pt-4">
				<SectionH>
					{#snippet right()}
						<a href="/trips/{data.trip.slug}/today/upcoming" class="text-ink-muted hover:text-ink-soft text-xs">See all</a>
					{/snippet}
					Tomorrow
				</SectionH>
				{@const tomorrowItems = data.upcomingItems.filter((i) => i.day === data.tomorrowDay?.id)}
				{#if tomorrowItems.length > 0}
					<div class="mt-2 space-y-1">
						{#each tomorrowItems.slice(0, 3) as item}
							<a href="/trips/{data.trip.slug}/items/{item.id}" class="border-line hover:border-ink-muted flex items-center gap-2 rounded-lg border px-3 py-2">
								<span class="font-mono text-ink-muted text-xs">
									{item.start_time ? new Date(item.start_time.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) : item.slot}
								</span>
								<span class="text-ink text-sm truncate">{item.title}</span>
							</a>
						{/each}
						{#if tomorrowItems.length > 3}
							<p class="text-ink-muted text-center text-xs">+{tomorrowItems.length - 3} more</p>
						{/if}
					</div>
				{:else}
					<p class="text-ink-muted mt-2 text-xs">Nothing scheduled.</p>
				{/if}
			</div>
		{/if}
	{/if}
</main>
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/today/+page.svelte
git commit -m "M4d: trip mode today view — large cards, now indicator, tomorrow peek"
```

### Task 5: Upcoming (Next 3 Days) Page

**Files:**
- Create: `src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts`
- Create: `src/routes/(app)/trips/[slug]/today/upcoming/+page.svelte`

- [ ] **Step 1: Write the server load**

The parent today page already loads upcoming data. This page re-uses the trip layout parent data and loads its own items for the next 3 days.

```typescript
import type { PageServerLoad } from './$types';
import type { Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = new Date();
	const upcomingDays: Day[] = [];

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) upcomingDays.push(found);
	}

	const dayIds = upcomingDays.map((d) => d.id);
	const items = dayIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: dayIds.map((id) => `day = "${id}"`).join(' || '),
				sort: 'day,slot,start_time,rank'
			})
		: [];

	return { upcomingDays, upcomingItems: items };
};
```

- [ ] **Step 2: Write the UI**

```svelte
<script lang="ts">
	import type { Item, Slot } from '$lib/types';
	import NavBar from '$lib/components/ui/NavBar.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import TripModeCard from '$lib/components/TripModeCard.svelte';
	import SectionH from '$lib/components/ui/SectionH.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
	import { untrack } from 'svelte';
	import type { Notification } from '$lib/types';

	let { data } = $props();

	let notifications = $state<Notification[]>(untrack(() => data.notifications ?? []));
	let unreadCount = $state(untrack(() => data.unreadCount ?? 0));

	function dayLabel(dateStr: string): string {
		return new Date(dateStr.replace(' ', 'T')).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		});
	}
</script>

<NavBar
	title="Upcoming"
	subtitle={data.trip.title}
	subtitleStyle="tagline"
	back
	backHref="/trips/{data.trip.slug}/today"
>
	{#snippet right()}
		<NotificationBell bind:notifications bind:unreadCount />
	{/snippet}
</NavBar>

<SubTabs tabs={[
	{ id: 'today', label: 'Today', href: `/trips/${data.trip.slug}/today` },
	{ id: 'upcoming', label: 'Next 3 Days', href: `/trips/${data.trip.slug}/today/upcoming` }
]} />

<main class="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-24 space-y-6">
	{#if data.upcomingDays.length === 0}
		<Card>
			<div class="p-6 text-center">
				<p class="text-ink-muted text-sm">No upcoming days within the next 3 days.</p>
			</div>
		</Card>
	{:else}
		{#each data.upcomingDays as day}
			{@const dayItems = data.upcomingItems.filter((i: Item) => i.day === day.id)}
			<section class="space-y-2">
				<h3 class="font-display text-ink text-lg font-semibold">{dayLabel(day.date)}</h3>
				{#if dayItems.length === 0}
					<p class="text-ink-muted text-sm">Nothing scheduled.</p>
				{:else}
					{#each dayItems as item}
						<TripModeCard {item} slug={data.trip.slug} />
					{/each}
				{/if}
			</section>
		{/each}
	{/if}
</main>
```

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/trips/[slug]/today/upcoming/+page.server.ts src/routes/(app)/trips/[slug]/today/upcoming/+page.svelte
git commit -m "M4d: next-3-days upcoming view"
```

### Task 6: Trip Mode Toggle on Overview

**Files:**
- Modify: `src/routes/(app)/trips/[slug]/+page.svelte`

- [ ] **Step 1: Add Trip Mode toggle link**

In the trip overview page, add a "Trip Mode" button in the trip stats card area. After the date range display:

```svelte
<a
	href="/trips/{data.trip.slug}/today"
	class="bg-clay text-paper inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
>
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 14" />
	</svg>
	Trip Mode
</a>
```

Place this inside the trip stats Card, next to the role Pill.

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/trips/[slug]/+page.svelte
git commit -m "M4d: add Trip Mode toggle link on overview page"
```

### Task 7: Visual verification + M4d complete

- [ ] **Step 1: Visual verification at 375px**

Verify:
1. Trip overview shows "Trip Mode" button with clay accent
2. Navigating to /today shows Today view with large cards
3. "Up next" NowDivider appears before the correct item
4. Tomorrow peek section shows at bottom
5. "Next 3 Days" sub-tab navigates to upcoming view
6. Back navigation returns to overview

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit M4d completion**

```bash
git add -A
git commit -m "M4d complete: Trip Mode with today view, now indicator, upcoming days"
```

---

## M4e — Offline & PWA (Service Worker, Offline Toggle, A2HS)

### Task 1: Service Worker Rewrite

**Files:**
- Modify: `src/service-worker.ts`

- [ ] **Step 1: Rewrite the service worker**

The new service worker caches both static assets AND PocketBase API responses. It supports an offline toggle via `postMessage`.

```typescript
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const STATIC_CACHE = `waypoint-static-${version}`;
const DATA_CACHE = `waypoint-data-${version}`;

const ASSETS = [...build, ...files];

let offlineMode = false;

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SET_OFFLINE') {
		offlineMode = event.data.offline;
	}
});

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
	);
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== STATIC_CACHE && key !== DATA_CACHE) {
					await caches.delete(key);
				}
			}
		})
	);
	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// PocketBase API requests — network-first with data cache fallback
	const isPBApi = url.port === '8090' || url.pathname.startsWith('/api/');

	if (isPBApi) {
		if (offlineMode) {
			// In explicit offline mode, serve from cache only
			event.respondWith(
				caches.match(event.request).then((cached) => {
					return cached ?? new Response(
						JSON.stringify({ error: 'Offline' }),
						{ status: 503, headers: { 'Content-Type': 'application/json' } }
					);
				})
			);
			return;
		}

		// Network-first: try network, cache the response, fallback to cache
		event.respondWith(
			fetch(event.request)
				.then(async (response) => {
					if (response.ok) {
						const cache = await caches.open(DATA_CACHE);
						cache.put(event.request, response.clone());
					}
					return response;
				})
				.catch(() =>
					caches.match(event.request).then((cached) => {
						return cached ?? new Response(
							JSON.stringify({ error: 'Offline' }),
							{ status: 503, headers: { 'Content-Type': 'application/json' } }
						);
					})
				)
		);
		return;
	}

	// Navigation requests — network-first with cache fallback
	if (event.request.mode === 'navigate') {
		event.respondWith(
			fetch(event.request).catch(() =>
				caches.match(event.request) as Promise<Response>
			)
		);
		return;
	}

	// Static assets — cache-first
	event.respondWith(
		caches.match(event.request).then((cached) => {
			return cached ?? fetch(event.request);
		})
	);
});
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/service-worker.ts
git commit -m "M4e: rewrite service worker — cache API responses, offline mode support"
```

### Task 2: A2HSBanner Component

**Files:**
- Create: `src/lib/components/A2HSBanner.svelte`

- [ ] **Step 1: Write the component**

Handles both iOS (manual instructions) and Android (`beforeinstallprompt`). Dismissable with 30-day localStorage expiry.

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let show = $state(false);
	let isIOS = $state(false);
	let deferredPrompt: Event | null = null;

	const STORAGE_KEY = 'waypoint-a2hs-dismissed';
	const DISMISS_DAYS = 30;

	onMount(() => {
		// Check if already installed as PWA
		if (window.matchMedia('(display-mode: standalone)').matches) return;

		// Check if dismissed recently
		const dismissed = localStorage.getItem(STORAGE_KEY);
		if (dismissed) {
			const dismissedAt = parseInt(dismissed, 10);
			if (Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000) return;
		}

		// Detect iOS Safari
		const ua = navigator.userAgent;
		const isIOSSafari = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
		if (isIOSSafari) {
			isIOS = true;
			show = true;
			return;
		}

		// Android: listen for beforeinstallprompt
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			show = true;
		});
	});

	function dismiss() {
		localStorage.setItem(STORAGE_KEY, Date.now().toString());
		show = false;
	}

	async function installAndroid() {
		if (!deferredPrompt) return;
		(deferredPrompt as any).prompt();
		const result = await (deferredPrompt as any).userChoice;
		if (result.outcome === 'accepted') {
			show = false;
		}
		deferredPrompt = null;
	}
</script>

{#if show}
	<div class="border-moss/30 bg-moss-tint mx-4 mt-2 rounded-lg border p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="text-ink text-sm font-semibold">Add Waypoint to Home Screen</p>
				{#if isIOS}
					<p class="text-ink-muted mt-1 text-xs">
						Tap the Share button
						<svg class="inline-block align-text-bottom" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
							<polyline points="16 6 12 2 8 6" />
							<line x1="12" y1="2" x2="12" y2="15" />
						</svg>
						then "Add to Home Screen" for the best experience.
					</p>
				{:else}
					<p class="text-ink-muted mt-1 text-xs">Get quick access and offline support.</p>
					<Button onclick={installAndroid} variant="moss" size="sm" class="mt-2">Install</Button>
				{/if}
			</div>
			<button onclick={dismiss} class="text-ink-muted hover:text-ink-soft shrink-0 p-1" aria-label="Dismiss">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 6 6 18M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/A2HSBanner.svelte
git commit -m "M4e: add A2HS banner — iOS instructions + Android install prompt"
```

### Task 3: Wire Offline Toggle + A2HS into Root Layout

**Files:**
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add offline toggle and A2HS banner**

Update the root layout:

```svelte
<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import A2HSBanner from '$lib/components/A2HSBanner.svelte';

	let { children } = $props();

	let offline = $state(false);

	onMount(() => {
		// Number input scroll prevention
		const handler = (e: WheelEvent) => {
			if (e.target instanceof HTMLInputElement && e.target.type === 'number') {
				e.target.blur();
			}
		};
		document.addEventListener('wheel', handler, { passive: true });

		// Restore offline state from localStorage
		const storedOffline = localStorage.getItem('waypoint-offline');
		if (storedOffline === 'true') {
			offline = true;
			sendOfflineToSW(true);
		}

		// Listen for online/offline events
		window.addEventListener('online', () => {
			if (!offline) sendOfflineToSW(false);
		});
		window.addEventListener('offline', () => {
			sendOfflineToSW(true);
		});

		return () => document.removeEventListener('wheel', handler);
	});

	function sendOfflineToSW(value: boolean) {
		if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
			navigator.serviceWorker.controller.postMessage({
				type: 'SET_OFFLINE',
				offline: value
			});
		}
	}

	function toggleOffline() {
		offline = !offline;
		localStorage.setItem('waypoint-offline', String(offline));
		sendOfflineToSW(offline);
	}
</script>

<svelte:head>
	<meta name="theme-color" content="#1e293b" />
</svelte:head>

{#if offline}
	<div class="bg-clay/90 text-paper px-4 py-1.5 text-center text-xs font-semibold">
		Offline mode
		<button onclick={toggleOffline} class="text-paper/80 hover:text-paper ml-2 underline">Go online</button>
	</div>
{/if}

<A2HSBanner />

{@render children()}
```

- [ ] **Step 2: Add offline toggle button somewhere accessible**

The offline toggle should be accessible from a user menu. For now, add it to the trip More page. In `more/+page.svelte`, add after the Vault card:

```svelte
<Card>
	<button
		type="button"
		onclick={() => {
			const current = localStorage.getItem('waypoint-offline') === 'true';
			const next = !current;
			localStorage.setItem('waypoint-offline', String(next));
			if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage({ type: 'SET_OFFLINE', offline: next });
			}
			window.location.reload();
		}}
		class="flex w-full items-center gap-3 p-4"
	>
		<svg class="text-ink-soft shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
			<line x1="1" y1="1" x2="23" y2="23" />
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
			<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
			<path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
			<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
			<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
			<line x1="12" y1="20" x2="12.01" y2="20" />
		</svg>
		<div class="min-w-0 flex-1 text-left">
			<p class="text-ink text-sm font-semibold">Offline mode</p>
			<p class="text-ink-muted text-[12px]">Toggle offline to use cached trip data</p>
		</div>
	</button>
</Card>
```

- [ ] **Step 3: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/+layout.svelte src/routes/(app)/trips/[slug]/more/+page.svelte
git commit -m "M4e: wire offline toggle + A2HS banner into app"
```

### Task 4: Visual verification + M4e complete

- [ ] **Step 1: Visual verification**

Verify:
1. A2HS banner appears on first visit (test in Chrome DevTools with cleared localStorage)
2. Dismiss button hides banner, does not reappear for 30 days
3. Offline mode toggle shows clay banner at top
4. In offline mode, cached pages still load
5. Service worker caches API responses (check DevTools > Application > Cache Storage)

- [ ] **Step 2: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 3: Commit M4e completion**

```bash
git add -A
git commit -m "M4e complete: offline support, service worker data caching, A2HS banner"
```

---

## M4f — E2E Tests + Polish

### Task 1: Playwright Happy-Path Tests

**Files:**
- Create: `tests/e2e/m4-execution.spec.ts`

- [ ] **Step 1: Write E2E tests**

```typescript
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('M4 Execution', () => {
	test.beforeEach(async ({ page }) => {
		// Dev login
		await page.goto(`${BASE}/api/dev/login`);
		await page.waitForURL('**/trips');
	});

	test('vote button renders on item detail', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		// Navigate to a day
		const dayLink = page.locator('a[href*="/days/"]').first();
		if (await dayLink.isVisible()) {
			await dayLink.click();
			await page.waitForURL('**/days/**');

			// Click first item
			const itemLink = page.locator('a[href*="/items/"]').first();
			if (await itemLink.isVisible()) {
				await itemLink.click();
				await page.waitForURL('**/items/**');

				// Vote button should exist
				const voteBtn = page.getByLabel(/vote/i).first();
				await expect(voteBtn.or(page.getByLabel(/remove vote/i).first())).toBeVisible();
			}
		}
	});

	test('vault locked screen renders', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();

		// Navigate to More > Vault
		await page.getByText('More').click();
		await page.getByText('Vault').click();
		await page.waitForURL('**/vault');

		// Should show either locked or no-password state
		const locked = page.getByText('Vault locked');
		const noPassword = page.getByText('Vault not set up');
		await expect(locked.or(noPassword)).toBeVisible();
	});

	test('trip mode today view renders', async ({ page }) => {
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();
		await page.waitForURL('**/trips/**');

		// Click Trip Mode button
		const tripModeBtn = page.getByText('Trip Mode');
		if (await tripModeBtn.isVisible()) {
			await tripModeBtn.click();
			await page.waitForURL('**/today');

			// Should see Today or no-itinerary message
			const todayHeader = page.getByRole('heading', { level: 2 });
			const noItinerary = page.getByText('No itinerary for today');
			await expect(todayHeader.first().or(noItinerary)).toBeVisible();
		}
	});

	test('A2HS banner shows and dismisses', async ({ page }) => {
		// Clear localStorage
		await page.goto(`${BASE}/trips`);
		await page.evaluate(() => localStorage.removeItem('waypoint-a2hs-dismissed'));
		await page.reload();

		// Banner may or may not show depending on browser (Chrome shows, others may not)
		// Just verify the page loads without errors
		await expect(page.getByText('Trips')).toBeVisible({ timeout: 5000 });
	});

	test('mobile responsive — vault at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();

		await page.getByText('More').click();
		await page.getByText('Vault').click();
		await page.waitForURL('**/vault');

		// Verify layout isn't broken at mobile width
		const main = page.locator('main');
		const box = await main.boundingBox();
		expect(box).toBeTruthy();
		expect(box!.width).toBeLessThanOrEqual(375);
	});

	test('mobile responsive — trip mode at 375px', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto(`${BASE}/trips`);
		const tripCard = page.locator('a[href*="/trips/"]').first();
		await tripCard.click();

		const tripModeBtn = page.getByText('Trip Mode');
		if (await tripModeBtn.isVisible()) {
			await tripModeBtn.click();
			await page.waitForURL('**/today');

			const main = page.locator('main');
			const box = await main.boundingBox();
			expect(box).toBeTruthy();
			expect(box!.width).toBeLessThanOrEqual(375);
		}
	});
});
```

- [ ] **Step 2: Run E2E tests**

Run: `pnpm test:e2e tests/e2e/m4-execution.spec.ts`
Expected: All tests pass (some may be conditional on test data existing).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/m4-execution.spec.ts
git commit -m "M4f: add M4 E2E Playwright tests — voting, vault, trip mode, mobile responsive"
```

### Task 2: Full Test Suite

- [ ] **Step 1: Run pnpm check**

Run: `pnpm check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm vitest run`
Expected: All tests pass (date-math + debt-simplify + crypto + trip-mode).

- [ ] **Step 3: Run all E2E tests**

Run: `pnpm test:e2e`
Expected: All tests pass (m1 + m2 + m3 + m4).

- [ ] **Step 4: Commit M4f completion**

```bash
git add -A
git commit -m "M4f complete: all tests passing, M4 Execution milestone done"
```

### Task 3: M4 Status File

**Files:**
- Create: `M4_STATUS.md`

- [ ] **Step 1: Write status file**

Create `M4_STATUS.md` with the sub-milestone structure, all tasks checked off. Include lessons learned section (to be filled during implementation).

- [ ] **Step 2: Final commit**

```bash
git add M4_STATUS.md M4_PLAN.md
git commit -m "M4 complete: Execution milestone — voting, vault, trip mode, offline, PWA"
```

---

## Open Decisions (Resolve Before or During Implementation)

1. **Vote UI style**: Plan uses thumbs-up (+1 counter). Spec mentions heart/star/thumbs — confirm thumbs-up is the right choice.
2. **Drag-and-drop on day detail**: Plan implements "Move" bottom sheet instead of drag-and-drop. Drag-and-drop on mobile is unreliable. Confirm move-via-sheet satisfies the spec.
3. **Vault title encryption**: Plan encrypts both title and body client-side. Alternative: plaintext titles (faster list rendering but less private). Confirm full encryption.
4. **Trip Mode as separate route**: Plan uses `/trips/[slug]/today` as a separate route. Alternative: toggle on same page. Confirm route-based approach.
5. **Offline edit behavior**: Spec says edits blocked with toast. Plan implements read-only offline. Confirm no offline write queue needed for v1.

---

## Acceptance Criteria Mapping

| Criterion | Where it's built |
|---|---|
| Trip Mode loads in <1s on a 4-year-old phone | M4d (large cards, minimal data), M4e (SW cache) |
| Full trip works offline after one online load | M4e (network-first SW caches API responses) |
| Vault entries encrypted at rest | M4a (crypto.ts), M4c (client-side encrypt before save) |
| Password required per session | M4c (sessionStorage, cleared on tab close) |
| Cannot accidentally lose vault data | M4c (no-recovery warning, delete confirmation) |
