import { describe, it, expect } from 'vitest';
import { phaseArrival, phaseDeparture, phaseStaying, dayMenuRows } from './phase-logistics';
import type { Item, Day, Phase } from '$lib/types';
import type { DayCardSummary } from './day-card';

// Japan shape: Tokyo Nov 18–22, Kanazawa Nov 22–24 (Nov 22 is the shared Travel Day).
const tokyo = {
	id: 'tok',
	start_date: '2027-11-18 00:00:00.000Z',
	end_date: '2027-11-22 00:00:00.000Z'
} as Phase;
const kanazawa = {
	id: 'kan',
	start_date: '2027-11-22 00:00:00.000Z',
	end_date: '2027-11-24 00:00:00.000Z'
} as Phase;
const single = {
	id: 'one',
	start_date: '2027-11-24 00:00:00.000Z',
	end_date: '2027-11-24 00:00:00.000Z'
} as Phase;
const dates = ['18', '19', '20', '21', '22', '23', '24'];
const days = dates.map((d) => ({
	id: `n${d}`,
	date: `2027-11-${d} 00:00:00.000Z`,
	phases: d === '22' ? ['tok', 'kan'] : Number(d) < 22 ? ['tok'] : ['kan'],
	notes: ''
})) as Day[];

function item(over: Partial<Item>): Item {
	return {
		id: 'i',
		day: '',
		end_date: '',
		type: 'activity',
		status: 'planned',
		start_time: '',
		title: '',
		...over
	} as Item;
}

const train = item({
	id: 'train',
	type: 'transportation',
	day: 'n22',
	start_time: '2027-11-22 10:00:00.000Z'
});

describe('phaseArrival / phaseDeparture', () => {
	it('a train on the shared day is Tokyo Out and Kanazawa In', () => {
		expect(phaseDeparture([train], days, tokyo).map((i) => i.id)).toEqual(['train']);
		expect(phaseArrival([train], days, kanazawa).map((i) => i.id)).toEqual(['train']);
	});
	it('excludes lodging', () => {
		const hotel = item({
			id: 'h',
			type: 'lodging',
			day: 'n18',
			end_date: '2027-11-20 00:00:00.000Z'
		});
		expect(phaseArrival([hotel], days, tokyo)).toEqual([]);
	});
	it('rental car counted on its start day', () => {
		const car = item({
			id: 'car',
			type: 'transportation',
			day: 'n18',
			end_date: '2027-11-20 00:00:00.000Z'
		});
		expect(phaseArrival([car], days, tokyo).map((i) => i.id)).toEqual(['car']);
	});
	it('includes flights, excludes considered, sorts by start time', () => {
		const late = item({
			id: 'late',
			type: 'flight',
			day: 'n18',
			start_time: '2027-11-18 18:00:00.000Z'
		});
		const early = item({
			id: 'early',
			type: 'transportation',
			day: 'n18',
			start_time: '2027-11-18 08:00:00.000Z'
		});
		const dropped = item({ id: 'x', type: 'flight', day: 'n18', status: 'considered' });
		expect(phaseArrival([late, dropped, early], days, tokyo).map((i) => i.id)).toEqual([
			'early',
			'late'
		]);
	});
	it('single-day phase: In and Out are the same day', () => {
		const bus = item({ id: 'bus', type: 'transportation', day: 'n24' });
		expect(phaseArrival([bus], days, single).map((i) => i.id)).toEqual(['bus']);
		expect(phaseDeparture([bus], days, single).map((i) => i.id)).toEqual(['bus']);
	});
});

describe('phaseStaying', () => {
	const hotel = item({
		id: 'hotel',
		type: 'lodging',
		day: 'n18',
		end_date: '2027-11-20 00:00:00.000Z'
	});
	const ryokan = item({
		id: 'ryokan',
		type: 'lodging',
		day: 'n20',
		end_date: '2027-11-22 00:00:00.000Z'
	});
	it('two stays cover all four Tokyo nights', () => {
		const s = phaseStaying([hotel, ryokan], days, tokyo);
		expect(s.lines.map((l) => [l.item.id, l.nights])).toEqual([
			['hotel', 2],
			['ryokan', 2]
		]);
		expect(s.coveredNights).toBe(4);
		expect(s.totalNights).toBe(4);
	});
	it('only the hotel → 2 of 4 nights', () => {
		const s = phaseStaying([hotel], days, tokyo);
		expect(s.coveredNights).toBe(2);
		expect(s.totalNights).toBe(4);
	});
	it('a stay crossing the boundary counts only nights inside the phase', () => {
		const long = item({
			id: 'long',
			type: 'lodging',
			day: 'n21',
			end_date: '2027-11-24 00:00:00.000Z'
		});
		expect(phaseStaying([long], days, tokyo).lines[0].nights).toBe(1);
		expect(phaseStaying([long], days, kanazawa).lines[0].nights).toBe(2);
	});
	// #537 — same rule as the AI audit (lodging-nights.ts).
	it('a lodging with no end date covers the night of its day', () => {
		const inn = item({ id: 'inn', type: 'lodging', day: 'n19' });
		const s = phaseStaying([inn], days, tokyo);
		expect(s.lines.map((l) => [l.item.id, l.nights])).toEqual([['inn', 1]]);
		expect(s.coveredNights).toBe(1);
	});
	it('a considered stay covers nothing', () => {
		const s = phaseStaying([{ ...hotel, status: 'considered' } as Item], days, tokyo);
		expect(s.lines).toEqual([]);
		expect(s.coveredNights).toBe(0);
	});
	it('single-day phase has 0 nights', () => {
		const s = phaseStaying([hotel], days, single);
		expect(s.totalNights).toBe(0);
		expect(s.lines).toEqual([]);
	});
});

describe('dayMenuRows', () => {
	const summary = (itemCount: number) => ({ itemCount }) as DayCardSummary;
	it('labels, fullness and travel flag', () => {
		const kanDays = days.filter((d) => d.phases.includes('kan'));
		const rows = dayMenuRows(kanDays, { n22: summary(3), n23: summary(1) });
		expect(rows).toEqual([
			{ dayId: 'n22', label: 'Mon 22', fullness: '3 items', travel: true },
			{ dayId: 'n23', label: 'Tue 23', fullness: '1 item', travel: false },
			{ dayId: 'n24', label: 'Wed 24', fullness: 'empty', travel: false }
		]);
	});
});
