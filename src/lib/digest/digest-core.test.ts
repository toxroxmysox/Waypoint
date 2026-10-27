// #542 — pinned output of backend/pb_hooks/digest-core.js. These vectors used
// to compare the hook against its TS twins (digest-diff/-email/-reminders.ts,
// deleted); the snapshots were taken while that parity suite was green, so
// they pin the same bytes.
import { describe, it, expect } from 'vitest';
import { core } from './load-digest-core';

const sig = core.buildSignature;
const items = [
	{
		id: 'i1',
		title: 'Sunset kayak',
		dayDate: '2026-06-05',
		status: 'planned',
		signature: sig({ type: 'activity', location_name: 'Pier 3' })
	},
	{ id: 'i2', title: 'Tapas crawl', dayDate: '', status: 'unplanned', signature: sig({}) },
	{
		id: 'i3',
		title: 'Bus tour',
		dayDate: '2026-06-03',
		status: 'planned',
		signature: sig({ type: 'activity', cost_estimate_usd: 25 })
	}
];
const after = [
	{ ...items[0], dayDate: '2026-06-06' }, // moved a day later
	{ ...items[1], title: 'Tapas crawl (old town)' }, // renamed
	// i3 removed; i4 added
	{
		id: 'i4',
		title: 'Museum',
		dayDate: '2026-06-04',
		status: 'planned',
		signature: sig({ type: 'activity' })
	}
];

const item = (o: Record<string, unknown>) => ({
	title: 'x',
	type: 'activity',
	dayDate: '',
	phaseStart: '',
	requiresBooking: false,
	booked: false,
	going: [],
	...o
});
const ritems = [
	item({
		title: 'Ryokan',
		type: 'lodging',
		dayDate: '2026-12-01',
		requiresBooking: true,
		going: ['m2']
	}),
	item({ title: 'Sushi class', dayDate: '2026-11-17', requiresBooking: true, going: ['m3'] }),
	item({ title: 'Onsen day', phaseStart: '2026-12-31', requiresBooking: true }),
	item({ title: 'Booked dinner', dayDate: '2026-12-01', requiresBooking: true, booked: true }),
	item({ title: 'Flight HND', type: 'flight', dayDate: '2026-11-06' }),
	item({
		title: 'Maybe inn',
		type: 'lodging',
		status: 'considered',
		dayDate: '2026-11-08',
		requiresBooking: true
	})
];
const trip = { tripStart: '2026-11-06', tripEnd: '2026-11-20', archived: false, items: ritems };
const reminderCases = [
	{ today: '2026-11-03', ...trip },
	{ today: '2026-10-01', ...trip },
	{ today: '2026-11-23', ...trip },
	{ today: '2026-11-23', ...trip, archived: true },
	{ today: '2026-11-03', ...trip, tripStart: '', tripEnd: '' }
];

describe('digest-core.js pinned output', () => {
	it('composeTripDiff on a mixed add/edit/move/remove scenario', () => {
		expect(core.composeTripDiff(core.snapshotItems(items), after)).toMatchSnapshot();
	});

	it('composeReminders across brief / booking / closeout / archived / no dates', () => {
		expect(reminderCases.map((c) => core.composeReminders(c))).toMatchSnapshot();
	});

	it('renderDigestEmail — single, multi + test label', () => {
		const diff = core.composeTripDiff(core.snapshotItems(items), after);
		expect(
			core.renderDigestEmail({
				recipientName: 'Scott',
				sections: [{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff }],
				appUrl: 'https://app.vandenwarsen.com/'
			})
		).toMatchSnapshot();
		expect(
			core.renderDigestEmail({
				recipientName: '',
				sections: [
					{ tripTitle: 'Barcelona 2026', tripSlug: 'barcelona-2026', diff },
					{ tripTitle: 'Tokyo 2027', tripSlug: 'tokyo-2027', diff }
				],
				appUrl: 'https://app.vandenwarsen.com',
				testLabel: true
			})
		).toMatchSnapshot();
	});

	it('renderDigestEmail — reminders alone, alongside changes, multi-trip', () => {
		const empty = { added: [], edited: [], moved: [], removed: [] };
		const changed = { ...empty, added: [{ title: 'New bar', dayDate: '2026-11-07' }] };
		const r0 = core.composeReminders(reminderCases[0]);
		const r2 = core.composeReminders(reminderCases[2]);
		const variants = [
			[{ tripTitle: 'Japan', tripSlug: 'japan', diff: empty, reminders: r0 }],
			[{ tripTitle: 'Japan', tripSlug: 'japan', diff: changed, reminders: r0 }],
			[
				{ tripTitle: 'Japan', tripSlug: 'japan', diff: empty, reminders: r0 },
				{ tripTitle: 'Lisbon', tripSlug: 'lisbon', diff: empty, reminders: r2 }
			]
		];
		for (const sections of variants) {
			expect(
				core.renderDigestEmail({
					recipientName: 'Abby',
					sections,
					appUrl: 'https://app.example.com/'
				})
			).toMatchSnapshot();
		}
	});
});

describe('parseDigestState', () => {
	it('tolerates string / object / byte-array / junk shapes', () => {
		const snap = core.snapshotItems(items);
		const json = JSON.stringify(snap);
		expect(core.parseDigestState(json)).toEqual(snap);
		expect(core.parseDigestState(JSON.parse(json))).toEqual(snap);
		const bytes = Array.from(json).map((c) => c.charCodeAt(0));
		expect(core.parseDigestState(bytes)).toEqual(snap);
		expect(core.parseDigestState('')).toBeNull();
		expect(core.parseDigestState(null)).toBeNull();
		expect(core.parseDigestState('not json')).toBeNull();
		expect(core.parseDigestState(42)).toBeNull();
	});
});
