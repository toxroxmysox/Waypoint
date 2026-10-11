import { describe, it, expect } from 'vitest';
import { heroStatus, goingPeople, mapsUrl } from './hero';

describe('goingPeople (#440): going first, then struck not-going; no answer never listed', () => {
	const ms = [
		{ id: 'm1', display_name: 'Ana' },
		{ id: 'm2', display_name: 'Ben' },
		{ id: 'm3', display_name: 'Cy' },
		{ id: 'm4', display_name: 'Di', removed_at: '2026-01-01' }
	] as any[];
	it('orders going (assigned_to order) before not going', () => {
		const r = goingPeople({ assigned_to: ['m2'], not_going: ['m1', 'm3'] }, ms);
		expect(r.map((p) => [p.memberId, p.notGoing])).toEqual([
			['m2', false],
			['m1', true],
			['m3', true]
		]);
	});
	it('a member with no answer (in neither list) does not appear', () => {
		expect(goingPeople({ assigned_to: ['m1'], not_going: [] }, ms).map((p) => p.memberId)).toEqual(['m1']);
	});
	it('departed and unknown ids drop; names resolve', () => {
		const r = goingPeople({ assigned_to: ['m4', 'zz', 'm1'], not_going: ['m4'] }, ms);
		expect(r).toEqual([{ memberId: 'm1', name: 'Ana', notGoing: false }]);
	});
	it('tolerates missing lists', () => {
		expect(goingPeople({}, ms)).toEqual([]);
	});
});

const at = (hm: string) => `2026-10-15 ${hm}:00.000Z`;
const now = (hm: string) => new Date(`2026-10-15T${hm}:00Z`);

describe('heroStatus (the NOW line)', () => {
	const item = { start_time: at('13:00'), end_time: at('16:00') };

	it('reads until + time left', () => {
		expect(heroStatus(item, now('15:05'))).toEqual({ label: 'NOW', text: 'until 4:00p · 55m left' });
	});
	it('counts hours and minutes', () => {
		expect(heroStatus(item, now('14:55'))?.text).toBe('until 4:00p · 1h 5m left');
		expect(heroStatus(item, now('14:00'))?.text).toBe('until 4:00p · 2h left');
	});
	it('says < 1m in the last minute', () => {
		expect(heroStatus(item, new Date('2026-10-15T15:59:40Z'))?.text).toBe('until 4:00p · < 1m left');
	});
	it('is null once the end has arrived (end exclusive)', () => {
		expect(heroStatus(item, now('16:00'))).toBeNull();
	});
	it('is null before the start', () => {
		expect(heroStatus(item, now('12:59'))).toBeNull();
	});
	it('#431: start-only reads `since` (no time left to count)', () => {
		expect(heroStatus({ start_time: at('13:00'), end_time: '' }, now('14:00'))).toEqual({
			label: 'NOW',
			text: 'since 1:00p'
		});
		expect(heroStatus({ start_time: at('13:00') }, now('13:00'))?.text).toBe('since 1:00p');
	});
	it('#431: start-only is null before its start', () => {
		expect(heroStatus({ start_time: at('13:00'), end_time: '' }, now('12:59'))).toBeNull();
	});
	it('#431: a deadline (end-only) has no live line', () => {
		expect(heroStatus({ start_time: '', end_time: at('16:30') }, now('16:00'))).toBeNull();
	});
});

describe('mapsUrl', () => {
	it('prefers the place id', () => {
		expect(
			mapsUrl({ google_place_id: 'P1', location_name: 'A B', location_address: 'x', location_coords: { lat: 1, lng: 2 } })
		).toContain('query_place_id=P1');
	});
	it('then coords', () => {
		expect(mapsUrl({ location_coords: { lat: 1, lng: 2 }, location_address: 'x' })).toContain('query=1,2');
	});
	it('then the address, then nothing', () => {
		expect(mapsUrl({ location_address: '1 Main St' })).toContain('query=1%20Main%20St');
		expect(mapsUrl({ location_name: 'Only a name' })).toContain('query=Only%20a%20name');
		expect(mapsUrl({})).toBe('');
	});
});
