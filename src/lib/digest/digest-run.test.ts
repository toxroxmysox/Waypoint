// #542 — runDigest (backend/pb_hooks/digest-core.js) under fakes: PB reads,
// clock and email send come in through the `deps` seam. Pins the send policy:
// the 8am trip-local window, the silent baseline, state advancing only on a
// successful send, and one email per user across trips.
//
// Fakes can't catch goja-only behaviour (Go slices, DateTime, Timezone db);
// backend/test-digest.mjs smoke-tests the real hook on a fresh PB for that.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { core } from './load-digest-core';

// --- fakes -------------------------------------------------------------------

type Fields = Record<string, unknown>;

function rec(id: string, fields: Fields) {
	return {
		id,
		fields,
		getString: (k: string) =>
			fields[k] === undefined || fields[k] === null ? '' : String(fields[k]),
		get: (k: string) => fields[k],
		getBool: (k: string) => !!fields[k],
		getStringSlice: (k: string) => (fields[k] as string[]) || [],
		set: (k: string, v: unknown) => {
			fields[k] = v;
		},
		email: () => fields.email
	};
}
type Rec = ReturnType<typeof rec>;

interface World {
	trips: Rec[];
	days?: Rec[];
	phases?: Rec[];
	items?: Rec[];
	members?: Rec[];
	users?: Rec[];
}

// Emulates the PB filters runDigest issues. trip_members applies the
// active/real-user/opted-in predicate the way PB would, and records the filter
// string so a test can pin that the predicate is actually requested.
function fakeApp(w: World) {
	const saves: Rec[] = [];
	const memberFilters: string[] = [];
	const byTrip = (rows: Rec[] | undefined, t: string) =>
		(rows || []).filter((r) => r.fields.trip === t);
	const app = {
		findRecordsByFilter(
			col: string,
			filter: string,
			_s: string,
			_l: number,
			_o: number,
			p?: { t: string }
		) {
			if (col === 'trips') return w.trips.filter((t) => !t.fields.archived);
			if (col === 'days') return byTrip(w.days, p!.t);
			if (col === 'phases') return byTrip(w.phases, p!.t);
			if (col === 'items') return byTrip(w.items, p!.t);
			if (col === 'trip_members') {
				memberFilters.push(filter);
				return byTrip(w.members, p!.t).filter(
					(m) => m.fields.removed_at === '' && m.fields.user !== '' && !m.fields.digest_opt_out
				);
			}
			throw new Error('unexpected collection ' + col);
		},
		findRecordById(col: string, id: string) {
			const u = col === 'users' && (w.users || []).find((x) => x.id === id);
			if (!u) throw new Error('not found');
			return u;
		},
		save(r: Rec) {
			saves.push(r);
		}
	};
	return { app, saves, memberFilters };
}

// Goja Timezone stand-in (only the id is read back by goTime().in()).
class TimezoneShim {
	constructor(readonly id: string) {}
}

// PB's DateTime -> .time() -> .in(tz) -> .hour()/.format('2006-01-02') chain.
function goTime(instant: Date, zone: string) {
	return {
		hour: () =>
			Number(
				new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' })
					.formatToParts(instant)
					.find((x) => x.type === 'hour')!.value
			),
		format: (layout: string) => {
			// Only the Go date layout digest-core uses is faked.
			if (layout !== '2006-01-02') throw new Error('unfaked layout ' + layout);
			return new Intl.DateTimeFormat('sv-SE', { timeZone: zone }).format(instant);
		},
		in: (tz: TimezoneShim) => goTime(instant, tz.id)
	};
}
const clock = (iso: string) => ({
	string: () => iso.replace('T', ' '),
	time: () => goTime(new Date(iso), 'UTC')
});

const ENV: Record<string, string> = {
	RESEND_API_KEY: 'test-key',
	RESEND_FROM: 'Waypoint <digest@example.test>',
	PUBLIC_APP_URL: 'https://app.example.test'
};

type SendReq = { url: string; headers: Record<string, string>; body: string };
function sender(status: number | ((to: string) => number) = 200) {
	const calls: Array<{ to: string; subject: string; text: string; req: SendReq }> = [];
	const send = (req: SendReq) => {
		const b = JSON.parse(req.body);
		calls.push({ to: b.to[0], subject: b.subject, text: b.text, req });
		return { statusCode: typeof status === 'function' ? status(b.to[0]) : status };
	};
	return { send, calls };
}

// --- fixtures ----------------------------------------------------------------

const AT_8_UTC = '2026-06-01T08:00:00.000Z';
const AT_7_UTC = '2026-06-01T07:00:00.000Z';

// digest_state '{}' = already baselined with no items, so every item is "added".
function trip(id: string, title: string, extra: Fields = {}) {
	return rec(id, {
		title,
		slug: id,
		timezone: 'UTC',
		archived: false,
		start_date: '',
		end_date: '',
		digest_state: '{}',
		last_digest_at: '',
		...extra
	});
}
const item = (id: string, tripId: string, title: string, extra: Fields = {}) =>
	rec(id, { trip: tripId, title, type: 'activity', status: 'unplanned', ...extra });
const member = (id: string, tripId: string, user: string, extra: Fields = {}) =>
	rec(id, {
		trip: tripId,
		user,
		role: 'owner',
		removed_at: '',
		digest_opt_out: false,
		display_name: '',
		...extra
	});
const user = (id: string, email: string, name = '') => rec(id, { email, name });

function oneTripWorld(extraTrip: Fields = {}): World {
	return {
		trips: [trip('t1', 'Lisbon', extraTrip)],
		items: [item('i1', 't1', 'Tram 28')],
		members: [member('m1', 't1', 'u1')],
		users: [user('u1', 'abby@example.test', 'Abby')]
	};
}

beforeEach(() => {
	(globalThis as { Timezone?: unknown }).Timezone = TimezoneShim;
});
afterEach(() => {
	delete (globalThis as { Timezone?: unknown }).Timezone;
});

// --- tests -------------------------------------------------------------------

describe('runDigest — silent baseline', () => {
	it('first sight of a trip writes state at any hour and sends nothing', () => {
		const w = oneTripWorld({ digest_state: null });
		const { app, saves } = fakeApp(w);
		const { send, calls } = sender();
		const s = core.runDigest(
			app,
			{},
			{ now: clock('2026-06-01T03:17:00.000Z'), env: (k: string) => ENV[k] || '', send }
		);

		expect(s.baselined).toEqual(['t1']);
		expect(calls).toHaveLength(0);
		expect(saves).toHaveLength(1);
		expect(JSON.parse(w.trips[0].fields.digest_state as string)).toEqual({
			i1: { t: 'Tram 28', d: '', s: 'unplanned', g: expect.any(String) }
		});
		expect(w.trips[0].fields.last_digest_at).toBe('2026-06-01 03:17:00.000Z');
	});

	it('dry run baselines nothing', () => {
		const w = oneTripWorld({ digest_state: '' });
		const { app, saves } = fakeApp(w);
		const s = core.runDigest(
			app,
			{ dryRun: true },
			{ now: clock(AT_8_UTC), env: () => '', send: sender().send }
		);
		expect(s.baselined).toEqual(['t1 (dry)']);
		expect(saves).toHaveLength(0);
	});
});

describe('runDigest — 8am trip-local window', () => {
	const run = (iso: string, opts = {}, extraTrip: Fields = {}) => {
		const { app } = fakeApp(oneTripWorld(extraTrip));
		const { send, calls } = sender();
		const s = core.runDigest(app, opts, {
			now: clock(iso),
			env: (k: string) => ENV[k] || '',
			send
		});
		return { s, calls };
	};

	it('sends at local hour 8', () => {
		const { s, calls } = run(AT_8_UTC);
		expect(calls).toHaveLength(1);
		expect(s.not_due).toBe(0);
	});

	it('skips any other hour', () => {
		for (const iso of [AT_7_UTC, '2026-06-01T09:00:00.000Z', '2026-06-01T20:00:00.000Z']) {
			const { s, calls } = run(iso);
			expect(calls).toHaveLength(0);
			expect(s.not_due).toBe(1);
		}
	});

	it('uses the trip zone, not UTC', () => {
		// 23:00Z is 08:00 the next morning in Tokyo.
		expect(run('2026-06-01T23:00:00.000Z', {}, { timezone: 'Asia/Tokyo' }).calls).toHaveLength(1);
		expect(run(AT_8_UTC, {}, { timezone: 'Asia/Tokyo' }).calls).toHaveLength(0);
	});

	it('force ignores the window', () => {
		expect(run(AT_7_UTC, { force: true }).calls).toHaveLength(1);
	});

	it('a due trip with no changes and no reminders sends nothing', () => {
		const w = oneTripWorld();
		w.trips[0].fields.digest_state = JSON.stringify(
			core.snapshotItems([
				{
					id: 'i1',
					title: 'Tram 28',
					dayDate: '',
					status: 'unplanned',
					signature: core.buildSignature({ type: 'activity' })
				}
			])
		);
		const { app, saves } = fakeApp(w);
		const { send, calls } = sender();
		const s = core.runDigest(
			app,
			{},
			{ now: clock(AT_8_UTC), env: (k: string) => ENV[k] || '', send }
		);
		expect(s.no_changes).toBe(1);
		expect(calls).toHaveLength(0);
		expect(saves).toHaveLength(0);
	});
});

describe('runDigest — state advances only on a successful send', () => {
	const env = (k: string) => ENV[k] || '';

	it('2xx: state + last_digest_at advance to the new snapshot', () => {
		const w = oneTripWorld();
		const { app, saves } = fakeApp(w);
		const { send, calls } = sender(202);
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });

		expect(calls[0].req.url).toBe('https://api.resend.com/emails');
		expect(calls[0].req.headers.Authorization).toBe('Bearer test-key');
		expect(JSON.parse(calls[0].req.body).from).toBe(ENV.RESEND_FROM);
		expect(s.trips_updated).toEqual(['t1']);
		expect(saves).toHaveLength(1);
		expect(Object.keys(JSON.parse(w.trips[0].fields.digest_state as string))).toEqual(['i1']);
		expect(w.trips[0].fields.last_digest_at).toBe('2026-06-01 08:00:00.000Z');
	});

	it('non-2xx: state untouched, error reported', () => {
		const w = oneTripWorld();
		const { app, saves } = fakeApp(w);
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send: sender(500).send });
		expect(s.trips_updated).toEqual([]);
		expect(s.errors).toEqual(['resend 500 for abby@example.test']);
		expect(saves).toHaveLength(0);
		expect(w.trips[0].fields.digest_state).toBe('{}');
	});

	it('send throws: state untouched', () => {
		const { app, saves } = fakeApp(oneTripWorld());
		const s = core.runDigest(
			app,
			{},
			{
				now: clock(AT_8_UTC),
				env,
				send: () => {
					throw new Error('dial tcp: timeout');
				}
			}
		);
		expect(s.emails[0].error).toContain('dial tcp: timeout');
		expect(saves).toHaveLength(0);
	});

	it('Resend env missing: no send attempted, state untouched', () => {
		const { app, saves } = fakeApp(oneTripWorld());
		const { send, calls } = sender();
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env: () => '', send });
		expect(calls).toHaveLength(0);
		expect(saves).toHaveLength(0);
		expect(s.errors).toEqual(['resend env missing — no sends this run']);
	});

	it('one recipient succeeding is enough to advance the trip', () => {
		const w = oneTripWorld();
		w.members!.push(member('m2', 't1', 'u2', { role: 'traveler' }));
		w.users!.push(user('u2', 'ben@example.test'));
		const { app } = fakeApp(w);
		const { send } = sender((to) => (to === 'ben@example.test' ? 200 : 500));
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });
		expect(s.trips_updated).toEqual(['t1']);
	});

	it('dry run composes the email but neither sends nor saves', () => {
		const { app, saves } = fakeApp(oneTripWorld());
		const { send, calls } = sender();
		const s = core.runDigest(app, { dryRun: true }, { now: clock(AT_8_UTC), env, send });
		expect(calls).toHaveLength(0);
		expect(saves).toHaveLength(0);
		expect(s.emails[0]).toMatchObject({ dry_run: true, subject: 'What changed on Lisbon' });
		expect(s.emails[0].text).toContain('Tram 28');
	});
});

describe('runDigest — recipients and per-user grouping', () => {
	const env = (k: string) => ENV[k] || '';

	it('one email per user covering all their due trips, sections by title', () => {
		const w: World = {
			trips: [trip('t1', 'Tokyo'), trip('t2', 'Lisbon')],
			items: [item('i1', 't1', 'Ramen'), item('i2', 't2', 'Tram 28')],
			members: [
				member('m1', 't1', 'u1'),
				member('m2', 't2', 'u1'),
				member('m3', 't1', 'u2', { role: 'traveler', display_name: 'Benny' })
			],
			users: [user('u1', 'Abby@Example.test ', 'Abby'), user('u2', 'ben@example.test', 'Ben')]
		};
		const { app } = fakeApp(w);
		const { send, calls } = sender();
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });

		expect(calls.map((c) => c.to).sort()).toEqual(['abby@example.test', 'ben@example.test']);
		const abby = calls.find((c) => c.to === 'abby@example.test')!;
		expect(abby.subject).toBe('What changed on 2 of your trips');
		expect(abby.text.indexOf('Lisbon')).toBeLessThan(abby.text.indexOf('Tokyo'));
		expect(abby.text.startsWith('Hi Abby,')).toBe(true);
		const ben = calls.find((c) => c.to === 'ben@example.test')!;
		expect(ben.subject).toBe('What changed on Tokyo');
		expect(ben.text.startsWith('Hi Benny,')).toBe(true); // trip display_name wins
		expect(s.trips_updated.sort()).toEqual(['t1', 't2']);
	});

	it('asks PB for active, real, opted-in members only', () => {
		const w = oneTripWorld();
		w.members!.push(
			member('m2', 't1', 'u2', { digest_opt_out: true }),
			member('m3', 't1', 'u3', { removed_at: '2026-05-01 00:00:00.000Z' }),
			member('m4', 't1', '')
		);
		w.users!.push(user('u2', 'out@example.test'), user('u3', 'gone@example.test'));
		const { app, memberFilters } = fakeApp(w);
		const { send, calls } = sender();
		core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });

		expect(memberFilters[0]).toBe(
			'trip = {:t} && removed_at = "" && user != "" && digest_opt_out = false'
		);
		expect(calls.map((c) => c.to)).toEqual(['abby@example.test']);
	});

	it('changes with nobody to tell are consumed silently', () => {
		const w = oneTripWorld();
		w.members = [];
		const { app, saves } = fakeApp(w);
		const { send, calls } = sender();
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });
		expect(calls).toHaveLength(0);
		expect(s.consumed_no_recipients).toEqual(['t1']);
		expect(saves).toHaveLength(1);
		expect(Object.keys(JSON.parse(w.trips[0].fields.digest_state as string))).toEqual(['i1']);
	});

	it('reminder-only: role-filtered "Coming up" email', () => {
		// Snapshot matches current items (no changes); a booking reminder is due
		// 14 days out. Owner gets it; a traveler not going does not.
		const w: World = {
			trips: [trip('t1', 'Lisbon', { start_date: '2026-06-15 00:00:00.000Z' })],
			items: [
				item('i1', 't1', 'Hotel', { type: 'lodging', requires_booking: true, assigned_to: [] })
			],
			members: [member('m1', 't1', 'u1'), member('m2', 't1', 'u2', { role: 'traveler' })],
			users: [user('u1', 'abby@example.test'), user('u2', 'ben@example.test')]
		};
		w.trips[0].fields.digest_state = JSON.stringify(
			core.snapshotItems([
				{
					id: 'i1',
					title: 'Hotel',
					dayDate: '',
					status: 'unplanned',
					signature: core.buildSignature({ type: 'lodging' })
				}
			])
		);
		const { app, saves } = fakeApp(w);
		const { send, calls } = sender();
		const s = core.runDigest(app, {}, { now: clock(AT_8_UTC), env, send });
		expect(calls.map((c) => c.to)).toEqual(['abby@example.test']);
		expect(calls[0].subject).toBe('Coming up on Lisbon');
		expect(calls[0].text).toContain('Hotel — needed Jun 15 (in 14 days)');
		// Pending trip advances on send (snapshot unchanged, last_digest_at moves).
		expect(s.trips_updated).toEqual(['t1']);
		expect(saves).toHaveLength(1);
	});

	it('toOverride redirects every email and labels the subject', () => {
		const { app } = fakeApp(oneTripWorld());
		const { send, calls } = sender();
		const s = core.runDigest(
			app,
			{ toOverride: 'scott@example.test' },
			{ now: clock(AT_8_UTC), env, send }
		);
		expect(calls[0].to).toBe('scott@example.test');
		expect(calls[0].subject).toBe('[Waypoint digest test] What changed on Lisbon');
		expect(s.emails[0].original_recipient).toBe('abby@example.test');
	});
});
