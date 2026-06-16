import { describe, it, expect } from 'vitest';
import { flightsLineup, type FlightItemInput } from './flights-lineup';
import type { MemberWithAvatar } from '$lib/collaboration/member-avatar';
import type { Item } from '$lib/types';

// A flight Item carrying the stored fields the lookup persists, plus the
// loader-resolved `dayDate`. Defaults model a typical timed flight.
function flight(overrides: Partial<FlightItemInput>): FlightItemInput {
	return {
		id: 'f1',
		type: 'flight',
		title: 'Untitled Flight',
		location_name: 'JFK Airport (JFK)',
		description: '→ LAX Airport (LAX)',
		start_time: '2026-07-01 08:00:00.000Z',
		end_time: '2026-07-01 11:30:00.000Z',
		end_date: '',
		dayDate: '2026-07-01',
		assigned_to: [],
		...overrides
	} as FlightItemInput;
}

function member(overrides: Partial<MemberWithAvatar>): MemberWithAvatar {
	return {
		id: 'm1',
		display_name: '',
		placeholder_name: '',
		removed_at: '',
		...overrides
	} as MemberWithAvatar;
}

describe('flightsLineup — route + time projection from stored fields', () => {
	it('projects departure/arrival labels and date-times from stored fields only', () => {
		const [row] = flightsLineup([flight({ title: 'American AA100' })], []);
		expect(row.title).toBe('American AA100');
		expect(row.from).toBe('JFK Airport (JFK)');
		expect(row.to).toBe('LAX Airport (LAX)'); // leading "→ " stripped
		expect(row.departure).toBe('2026-07-01 08:00');
		expect(row.arrival).toBe('2026-07-01 11:30');
	});

	it('tolerates an arrival label without the "→" prefix', () => {
		const [row] = flightsLineup([flight({ description: 'LAX Airport (LAX)' })], []);
		expect(row.to).toBe('LAX Airport (LAX)');
	});

	it('falls back to the resolved day date when a flight has a day but no time', () => {
		const [row] = flightsLineup(
			[flight({ start_time: '', end_time: '', dayDate: '2026-07-04' })],
			[]
		);
		expect(row.departure).toBe('2026-07-04');
		expect(row.arrival).toBe('');
	});

	it('uses a red-eye end_date as the arrival when there is no arrival time', () => {
		const [row] = flightsLineup(
			[flight({ end_time: '', end_date: '2026-07-02 00:00:00.000Z' })],
			[]
		);
		expect(row.arrival).toBe('2026-07-02');
	});

	it('leaves departure empty for a fully unscheduled flight (no day, no time)', () => {
		const [row] = flightsLineup([flight({ start_time: '', dayDate: '' })], []);
		expect(row.departure).toBe('');
	});
});

describe('flightsLineup — chronological ordering across multiple days', () => {
	it('sorts by departure, then arrival', () => {
		const rows = flightsLineup(
			[
				flight({ id: 'c', start_time: '2026-07-03 06:00:00.000Z', dayDate: '2026-07-03' }),
				flight({ id: 'a', start_time: '2026-07-01 08:00:00.000Z', dayDate: '2026-07-01' }),
				flight({ id: 'b', start_time: '2026-07-01 22:00:00.000Z', dayDate: '2026-07-01' })
			],
			[]
		);
		expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
	});

	it('breaks a departure tie by arrival time', () => {
		const rows = flightsLineup(
			[
				flight({
					id: 'late-arr',
					start_time: '2026-07-01 08:00:00.000Z',
					end_time: '2026-07-01 14:00:00.000Z'
				}),
				flight({
					id: 'early-arr',
					start_time: '2026-07-01 08:00:00.000Z',
					end_time: '2026-07-01 10:00:00.000Z'
				})
			],
			[]
		);
		expect(rows.map((r) => r.id)).toEqual(['early-arr', 'late-arr']);
	});

	it('sorts a time-less flight by its day relative to timed flights', () => {
		const rows = flightsLineup(
			[
				flight({ id: 'timed-jul2', start_time: '2026-07-02 09:00:00.000Z', dayDate: '2026-07-02' }),
				flight({ id: 'dayonly-jul1', start_time: '', end_time: '', dayDate: '2026-07-01' })
			],
			[]
		);
		// Jul-1 (date-only) sorts before Jul-2 08:00 — a bare date precedes any time that day.
		expect(rows.map((r) => r.id)).toEqual(['dayonly-jul1', 'timed-jul2']);
	});

	it('pushes fully-unscheduled flights to the bottom, then sorts them by title', () => {
		const rows = flightsLineup(
			[
				flight({ id: 'z', title: 'Zeta', start_time: '', dayDate: '' }),
				flight({ id: 'scheduled', start_time: '2026-07-01 08:00:00.000Z', dayDate: '2026-07-01' }),
				flight({ id: 'a', title: 'Alpha', start_time: '', dayDate: '' })
			],
			[]
		);
		expect(rows.map((r) => r.id)).toEqual(['scheduled', 'a', 'z']);
	});
});

describe('flightsLineup — assignee resolution', () => {
	const members: MemberWithAvatar[] = [
		member({ id: 'm1', display_name: 'Ada Lovelace', avatarUrl: 'https://pb/ada.png' }),
		member({ id: 'm2', display_name: 'Grace Hopper', avatarUrl: '' }), // real member, no avatar
		member({ id: 'm3', placeholder_name: 'Plus One', avatarUrl: '' }) // placeholder
	];

	it('resolves an assignee to name + initial + avatar url', () => {
		const [row] = flightsLineup([flight({ assigned_to: ['m1'] })], members);
		expect(row.assignees).toEqual([
			{ initial: 'A', name: 'Ada Lovelace', img: 'https://pb/ada.png' }
		]);
	});

	it('falls back to placeholder initials (no avatar) for a placeholder member', () => {
		const [row] = flightsLineup([flight({ assigned_to: ['m3'] })], members);
		expect(row.assignees).toEqual([{ initial: 'P', name: 'Plus One', img: '' }]);
	});

	it('resolves a multi-passenger flight in assigned order', () => {
		const [row] = flightsLineup([flight({ assigned_to: ['m1', 'm2', 'm3'] })], members);
		expect(row.assignees.map((a) => a.name)).toEqual(['Ada Lovelace', 'Grace Hopper', 'Plus One']);
		expect(row.assignees.map((a) => a.img)).toEqual(['https://pb/ada.png', '', '']);
	});

	it('returns no assignees for a flight with an empty assigned_to', () => {
		const [row] = flightsLineup([flight({ assigned_to: [] })], members);
		expect(row.assignees).toEqual([]);
	});

	it('renders the Unknown fallback for an assignee id not in the roster', () => {
		// Mirrors member-name.ts: an unresolved member → name 'Unknown', initial 'U'.
		const [row] = flightsLineup([flight({ assigned_to: ['ghost'] })], members);
		expect(row.assignees).toEqual([{ initial: 'U', name: 'Unknown', img: '' }]);
	});
});

describe('flightsLineup — input filtering', () => {
	it('excludes non-flight items', () => {
		const items = [
			flight({ id: 'flight-a' }),
			{ ...flight({ id: 'lodging-x' }), type: 'lodging' } as unknown as Item,
			{ ...flight({ id: 'meal-y' }), type: 'meal' } as unknown as Item
		] as FlightItemInput[];
		const rows = flightsLineup(items, []);
		expect(rows.map((r) => r.id)).toEqual(['flight-a']);
	});

	it('returns an empty lineup for empty input', () => {
		expect(flightsLineup([], [])).toEqual([]);
	});
});
