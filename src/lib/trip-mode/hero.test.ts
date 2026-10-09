import { describe, it, expect } from 'vitest';
import { heroStatus, goingNames, mapsUrl } from './hero';

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
	it('is null with no end time', () => {
		expect(heroStatus({ start_time: at('13:00'), end_time: '' }, now('14:00'))).toBeNull();
	});
});

describe('goingNames', () => {
	const members = [
		{ id: 'm1', display_name: 'Scott' },
		{ id: 'm2', display_name: 'Kim' },
		{ id: 'm3', display_name: 'Gone', removed_at: '2026-01-01' }
	] as never[];
	it('lists going members in assigned order, skipping departed and unknown', () => {
		expect(goingNames({ assigned_to: ['m2', 'm3', 'm1', 'zz'] }, members)).toEqual([
			{ memberId: 'm2', name: 'Kim' },
			{ memberId: 'm1', name: 'Scott' }
		]);
	});
	it('is empty when nobody is going', () => {
		expect(goingNames({ assigned_to: [] }, members)).toEqual([]);
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
