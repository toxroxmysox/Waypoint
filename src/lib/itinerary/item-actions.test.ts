import { describe, it, expect } from 'vitest';
import {
	itemMenuEntries,
	itemPermissions,
	skipDestination,
	type ItemPermissionItem
} from './item-actions';

// #416 — each rule mirrors a real server gate. If one of these flips, the
// matching gate changed (or this drifted from it): check items.pb.js,
// documents.pb.js, checklists.pb.js / tasks.pb.js, votes.createRule (0055) and
// the item page's skipItem action before "fixing" the test.

const ME = 'mem_me';
const OTHER = 'mem_other';

const planned: ItemPermissionItem = {
	created_by: OTHER,
	status: 'planned',
	day: 'day_1',
	type: 'activity'
};

function perms(role: string, item: Partial<ItemPermissionItem> = {}) {
	return itemPermissions({ id: ME, role }, { ...planned, ...item });
}

describe('itemPermissions — edit and move (items.pb.js update gate)', () => {
	it('owner and co_owner may edit and move any item', () => {
		for (const role of ['owner', 'co_owner']) {
			expect(perms(role).canEdit).toBe(true);
			expect(perms(role).canMove).toBe(true);
		}
	});

	it("a traveler may not edit or move someone else's item", () => {
		expect(perms('traveler').canEdit).toBe(false);
		expect(perms('traveler').canMove).toBe(false);
	});

	it('the creator may edit and move their own item', () => {
		expect(perms('traveler', { created_by: ME }).canEdit).toBe(true);
		expect(perms('traveler', { created_by: ME }).canMove).toBe(true);
	});

	it('the creator exception runs before the viewer block, as in the hook', () => {
		// A creator later lowered to viewer still passes the update hook.
		expect(perms('viewer', { created_by: ME }).canEdit).toBe(true);
	});

	it('an item with no creator (import, closeout) never matches the creator branch', () => {
		const p = itemPermissions({ id: '', role: 'traveler' }, { ...planned, created_by: '' });
		expect(p.canEdit).toBe(false);
	});

	it('a viewer may not edit or move', () => {
		expect(perms('viewer').canEdit).toBe(false);
		expect(perms('viewer').canMove).toBe(false);
	});
});

describe('itemPermissions — delete (items.pb.js delete gate)', () => {
	it('only owner and co_owner may delete', () => {
		expect(perms('owner').canDelete).toBe(true);
		expect(perms('co_owner').canDelete).toBe(true);
		expect(perms('traveler').canDelete).toBe(false);
		expect(perms('viewer').canDelete).toBe(false);
	});

	it('creating an item does not grant delete', () => {
		expect(perms('traveler', { created_by: ME }).canDelete).toBe(false);
	});
});

describe('itemPermissions — skip (skipItem action)', () => {
	it('owner and co_owner may skip a planned item on a day', () => {
		expect(perms('owner').canSkip).toBe(true);
		expect(perms('co_owner').canSkip).toBe(true);
	});

	it('travelers, viewers and creators may not skip', () => {
		expect(perms('traveler').canSkip).toBe(false);
		expect(perms('viewer').canSkip).toBe(false);
		expect(perms('traveler', { created_by: ME }).canSkip).toBe(false);
	});

	it('only a planned item that sits on a day can be skipped', () => {
		expect(perms('owner', { status: 'unplanned' }).canSkip).toBe(false);
		expect(perms('owner', { status: 'done' }).canSkip).toBe(false);
		expect(perms('owner', { day: '' }).canSkip).toBe(false);
	});
});

describe('itemPermissions — documents, checklist, votes, payment', () => {
	it('every role but viewer may upload, keep a checklist and vote', () => {
		for (const role of ['owner', 'co_owner', 'traveler']) {
			const p = perms(role);
			expect(p.canUpload).toBe(true);
			expect(p.canEditChecklist).toBe(true);
			expect(p.canVote).toBe(true);
		}
		const v = perms('viewer');
		expect(v.canUpload).toBe(false);
		expect(v.canEditChecklist).toBe(false);
		expect(v.canVote).toBe(false);
	});

	it('logging a payment is for non-viewers, and never on a note', () => {
		expect(perms('traveler').canLogPayment).toBe(true);
		expect(perms('viewer').canLogPayment).toBe(false);
		expect(perms('owner', { type: 'note' }).canLogPayment).toBe(false);
	});
});

describe('itemPermissions — unknown role', () => {
	it('grants nothing to a blank or unknown role', () => {
		const p = itemPermissions({ id: ME, role: '' }, planned);
		expect(Object.values(p).every((v) => v === false)).toBe(true);
	});
});

describe('skipDestination', () => {
	it('Trip Mode goes to Now', () => {
		expect(skipDestination('trip', 'paris-2026')).toBe('/trips/paris-2026/now');
	});

	it('Planning Mode stays on the item page', () => {
		expect(skipDestination('planning', 'paris-2026')).toBeNull();
	});
});

// #437 — the ⋯ menu is a pure projection of the permissions: nothing here
// decides who may do what, it only lists what #416 already allows.
describe('itemMenuEntries (#437)', () => {
	const ids = (role: string, item: Partial<ItemPermissionItem> = {}) =>
		itemMenuEntries(perms(role, item)).map((e) => e.id);

	it('owner and co_owner: Move, Skip, divider, Delete', () => {
		for (const role of ['owner', 'co_owner']) {
			expect(ids(role)).toEqual(['move', 'skip', 'divider', 'delete']);
		}
	});

	it('labels read as the spec words', () => {
		const labels = itemMenuEntries(perms('owner'))
			.filter((e) => e.id !== 'divider')
			.map((e) => (e as { label: string }).label);
		expect(labels).toEqual(['Move to another day', 'Skip…', 'Delete']);
	});

	it("the item's creator (traveler) gets Move only", () => {
		expect(ids('traveler', { created_by: ME })).toEqual(['move']);
	});

	it('a viewer who created the item still gets Move only (creator check precedes the viewer block)', () => {
		expect(ids('viewer', { created_by: ME })).toEqual(['move']);
	});

	it('everyone else gets no entries, so no ⋯', () => {
		expect(ids('traveler')).toEqual([]);
		expect(ids('viewer')).toEqual([]);
		expect(ids('')).toEqual([]);
	});

	it('an idea (not on a day) has nothing to skip', () => {
		expect(ids('owner', { status: 'unplanned', day: '' })).toEqual(['move', 'divider', 'delete']);
	});

	it('never starts or ends with a divider', () => {
		for (const role of ['owner', 'co_owner', 'traveler', 'viewer']) {
			for (const created_by of [ME, OTHER]) {
				for (const item of [{}, { status: 'unplanned', day: '' }]) {
					const e = ids(role, { created_by, ...item });
					expect(e[0]).not.toBe('divider');
					expect(e.at(-1)).not.toBe('divider');
				}
			}
		}
	});
});
