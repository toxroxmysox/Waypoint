import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import type PocketBase from 'pocketbase';
import type { MemberRole } from '$lib/types';
import {
	callerIsViewer,
	failStatus,
	findActiveMembership,
	isOrganizer,
	isOwner,
	isViewer,
	loadTripAccess,
	requireOrganizer,
	ORGANIZER_ONLY
} from './trip-access';

const ROLES: MemberRole[] = ['owner', 'co_owner', 'traveler', 'viewer'];

type Lookup = (filter: string) => Promise<unknown>;

// Minimal fake: records each collection's getFirstListItem filter.
function fakePb(trips: Lookup, members: Lookup) {
	const seen: Record<string, string> = {};
	const pb = {
		filter: (expr: string, params: Record<string, string>) =>
			expr.replace('{:slug}', JSON.stringify(params.slug)),
		collection: (name: string) => ({
			getFirstListItem: (filter: string) => {
				seen[name] = filter;
				return name === 'trips' ? trips(filter) : members(filter);
			}
		})
	};
	return { pb: pb as unknown as PocketBase, seen };
}

const notFound = () => Promise.reject(Object.assign(new Error('nf'), { status: 404 }));
const trip = () => Promise.resolve({ id: 't1', slug: 'paris' });
const member = (role: MemberRole) => () => Promise.resolve({ id: 'm1', role });

async function httpStatus(p: Promise<unknown>): Promise<[number, string]> {
	try {
		await p;
	} catch (e) {
		if (isHttpError(e)) return [e.status, e.body.message];
		throw e;
	}
	throw new Error('expected an HttpError');
}

describe('role predicates', () => {
	it('isOrganizer = owner or co_owner', () => {
		expect(ROLES.filter(isOrganizer)).toEqual(['owner', 'co_owner']);
	});
	it('isOwner = owner only', () => {
		expect(ROLES.filter(isOwner)).toEqual(['owner']);
	});
	it('isViewer = viewer only', () => {
		expect(ROLES.filter(isViewer)).toEqual(['viewer']);
	});
	it('missing role is none of them', () => {
		for (const r of [undefined, null]) {
			expect(isOrganizer(r)).toBe(false);
			expect(isOwner(r)).toBe(false);
			expect(isViewer(r)).toBe(false);
		}
	});
});

describe('failStatus', () => {
	it.each([
		[{ status: 400 }, 400],
		[{ status: 403 }, 403],
		[{ status: 404 }, 404],
		[{ status: 599 }, 599],
		[{ status: 600 }, 500],
		[{ status: 399 }, 500],
		[{ status: 0 }, 500],
		[{ status: '403' }, 500],
		[{}, 500],
		[new Error('x'), 500],
		[null, 500],
		[undefined, 500]
	])('%j → %i', (err, want) => {
		expect(failStatus(err)).toBe(want);
	});
});

describe('loadTripAccess', () => {
	it('unknown trip → 404 Trip not found', async () => {
		const { pb } = fakePb(notFound, member('owner'));
		expect(await httpStatus(loadTripAccess(pb, 'x', 'u1'))).toEqual([404, 'Trip not found']);
	});
	it('non-member → 403', async () => {
		const { pb } = fakePb(trip, notFound);
		expect(await httpStatus(loadTripAccess(pb, 'paris', 'u1'))).toEqual([
			403,
			'You are not a member of this trip'
		]);
	});
	it('signed out → 403 without querying members', async () => {
		const { pb, seen } = fakePb(trip, member('owner'));
		expect(await httpStatus(loadTripAccess(pb, 'paris', undefined))).toEqual([
			403,
			'You are not a member of this trip'
		]);
		expect(seen.trip_members).toBeUndefined();
	});
	it('member → trip + membership, querying ACTIVE membership only', async () => {
		const { pb, seen } = fakePb(trip, member('viewer'));
		const got = await loadTripAccess(pb, 'paris', 'u1');
		expect(got.trip.id).toBe('t1');
		expect(got.membership.role).toBe('viewer');
		expect(seen.trips).toBe('slug = "paris"');
		expect(seen.trip_members).toBe('trip = "t1" && user = "u1" && removed_at = ""');
	});
});

describe('requireOrganizer', () => {
	it.each(['owner', 'co_owner'] as MemberRole[])('%s → ok', async (role) => {
		const { pb } = fakePb(trip, member(role));
		const gate = await requireOrganizer(pb, 'paris', 'u1');
		expect(gate.ok).toBe(true);
		if (gate.ok) expect(gate.trip.id).toBe('t1');
	});
	it.each(['traveler', 'viewer'] as MemberRole[])('%s → 403', async (role) => {
		const { pb } = fakePb(trip, member(role));
		expect(await requireOrganizer(pb, 'paris', 'u1')).toEqual({
			ok: false,
			status: 403,
			message: ORGANIZER_ONLY
		});
	});
	it('missing trip or membership throws the PB error (caller maps it)', async () => {
		await expect(
			requireOrganizer(fakePb(notFound, member('owner')).pb, 'x', 'u1')
		).rejects.toMatchObject({
			status: 404
		});
		await expect(requireOrganizer(fakePb(trip, notFound).pb, 'paris', 'u1')).rejects.toMatchObject({
			status: 404
		});
	});
});

describe('findActiveMembership', () => {
	it('null when not a member', async () => {
		expect(await findActiveMembership(fakePb(trip, notFound).pb, 't1', 'u1')).toBeNull();
	});
	it('the membership when active', async () => {
		expect(
			await findActiveMembership(fakePb(trip, member('traveler')).pb, 't1', 'u1')
		).toMatchObject({
			role: 'traveler'
		});
	});
	it('null when signed out, without querying', async () => {
		const { pb, seen } = fakePb(trip, member('owner'));
		expect(await findActiveMembership(pb, 't1', undefined)).toBeNull();
		expect(seen.trip_members).toBeUndefined();
	});
});

describe('callerIsViewer', () => {
	it.each([
		['viewer', true],
		['traveler', false],
		['owner', false]
	] as [MemberRole, boolean][])('%s → %s', async (role, want) => {
		expect(await callerIsViewer(fakePb(trip, member(role)).pb, 't1', 'u1')).toBe(want);
	});
	it('non-member throws (caller propagates, as before)', async () => {
		await expect(callerIsViewer(fakePb(trip, notFound).pb, 't1', 'u1')).rejects.toMatchObject({
			status: 404
		});
	});
});
