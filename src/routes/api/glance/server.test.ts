import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(
	() =>
		({ WAYPOINT_GLANCE_TOKEN: 'tok', WAYPOINT_GLANCE_EMAILS: 'scott@x.com, abby@x.com' }) as Record<
			string,
			string | undefined
		>
);
vi.mock('$env/dynamic/private', () => ({ env: envMock }));

type Member = { user: string; trip: string; role: string };
const state = vi.hoisted(() => ({
	users: [] as { id: string; email: string }[],
	members: [] as { user: string; trip: string; role: string }[],
	trips: {} as Record<
		string,
		{ id: string; start_date: string; end_date: string } | { status: number }
	>,
	items: {} as Record<string, number>
}));

vi.mock('$lib/server/mcp/admin-pb', () => ({
	adminPb: async () => ({
		collection: (name: string) => ({
			getFullList: async ({ filter }: { filter: string }) => {
				if (name === 'users')
					return state.users
						.filter((u) => filter.includes(`"${u.email}"`))
						.map((u) => ({ id: u.id }));
				// trip_members: honour user ids and the viewer exclusion present in the filter
				return state.members
					.filter(
						(m: Member) =>
							filter.includes(`user = "${m.user}"`) &&
							(!filter.includes('role != "viewer"') || m.role !== 'viewer')
					)
					.map((m) => ({ trip: m.trip }));
			},
			getOne: async (id: string) => {
				const t = state.trips[id];
				if (t && 'status' in t) throw Object.assign(new Error('x'), { status: t.status });
				return t;
			},
			getList: async (_p: number, _n: number, { filter }: { filter: string }) => ({
				totalItems: state.items[/"(.+)"/.exec(filter)![1]] ?? 0
			})
		})
	})
}));

import { GET } from './+server';

const call = (auth?: string) =>
	GET({
		request: new Request('http://app.test/api/glance', {
			headers: auth ? { authorization: auth } : {}
		})
	} as Parameters<typeof GET>[0]);

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-10-11T16:00:00Z'));
	envMock.WAYPOINT_GLANCE_TOKEN = 'tok';
	envMock.WAYPOINT_GLANCE_EMAILS = 'scott@x.com, abby@x.com';
	state.users = [
		{ id: 'u1', email: 'scott@x.com' },
		{ id: 'u2', email: 'abby@x.com' }
	];
	state.members = [];
	state.trips = {};
	state.items = {};
});

describe('GET /api/glance', () => {
	it('401 + no-store without or with wrong token, or token unset', async () => {
		for (const [auth, tok] of [
			[undefined, 'tok'],
			['Bearer nope', 'tok'],
			['Bearer tok', undefined]
		] as const) {
			envMock.WAYPOINT_GLANCE_TOKEN = tok;
			const r = await call(auth);
			expect(r.status).toBe(401);
			expect(r.headers.get('cache-control')).toBe('no-store');
		}
	});

	it('returns exact numbers; shared trip counted once; viewer-only trip excluded', async () => {
		state.members = [
			{ user: 'u1', trip: 'shared', role: 'owner' },
			{ user: 'u2', trip: 'shared', role: 'traveler' },
			{ user: 'u1', trip: 'solo', role: 'co_owner' },
			{ user: 'u2', trip: 'viewonly', role: 'viewer' }
		];
		state.trips = {
			shared: {
				id: 'shared',
				start_date: '2026-03-01 00:00:00.000Z',
				end_date: '2026-03-05 00:00:00.000Z'
			},
			solo: {
				id: 'solo',
				start_date: '2026-11-10 00:00:00.000Z',
				end_date: '2026-11-12 00:00:00.000Z'
			},
			viewonly: {
				id: 'viewonly',
				start_date: '2026-06-01 00:00:00.000Z',
				end_date: '2026-06-09 00:00:00.000Z'
			}
		};
		state.items = { shared: 10, solo: 3, viewonly: 100 };
		const r = await call('Bearer tok');
		expect(r.status).toBe(200);
		expect(r.headers.get('cache-control')).toBe('no-store');
		expect(await r.json()).toEqual({ year: 2026, trips: 2, days: 5, items: 13 });
	});

	it('skips a 404 trip but rethrows other errors', async () => {
		state.members = [
			{ user: 'u1', trip: 'gone', role: 'owner' },
			{ user: 'u1', trip: 'ok', role: 'owner' }
		];
		state.trips = {
			gone: { status: 404 },
			ok: { id: 'ok', start_date: '2026-03-01', end_date: '2026-03-02' }
		};
		expect(await (await call('Bearer tok')).json()).toMatchObject({ trips: 1, days: 2 });
		state.trips.gone = { status: 503 };
		await expect(call('Bearer tok')).rejects.toMatchObject({ status: 503 });
	});

	it('503 + no-store when emails unset/empty (token still checked first)', async () => {
		envMock.WAYPOINT_GLANCE_EMAILS = undefined;
		const r = await call('Bearer tok');
		expect(r.status).toBe(503);
		expect(r.headers.get('cache-control')).toBe('no-store');
		expect(await r.json()).toEqual({ error: 'glance misconfigured' });
		expect((await call()).status).toBe(401);
	});

	it('503 when a configured email matches no user', async () => {
		state.users = [{ id: 'u1', email: 'scott@x.com' }];
		const r = await call('Bearer tok');
		expect(r.status).toBe(503);
		expect(r.headers.get('cache-control')).toBe('no-store');
		expect(await r.json()).toEqual({ error: 'glance misconfigured' });
	});
});
