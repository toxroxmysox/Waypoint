import { describe, expect, it } from 'vitest';
import type { Day, Item, Task, Trip } from '$lib/types';
import { auditTrip, type AuditGap } from './audit';

const trip = { id: 't', title: 'T', start_date: '2026-07-01 00:00:00.000Z', end_date: '2026-07-04 00:00:00.000Z' } as Trip;
const days = ['01', '02', '03', '04'].map((d) => ({ id: `d${d}`, trip: 't', date: `2026-07-${d} 00:00:00.000Z`, notes: '', phases: [] }) as unknown as Day);

let n = 0;
const item = (p: Partial<Item>): Item =>
	({
		id: `i${++n}`,
		trip: 't',
		day: 'd01',
		type: 'activity',
		title: `item ${n}`,
		status: 'planned',
		start_time: '',
		end_time: '',
		end_date: '',
		booked: false,
		requires_booking: false,
		sort_order: 0,
		...p
	}) as Item;

const kinds = (gaps: AuditGap[], k: AuditGap['kind']) => gaps.filter((g) => g.kind === k);
const run = (items: Item[], extra: { codeDocs?: { item: string; kind: 'code'; code_label: string; code_value: string }[]; tasks?: Task[] } = {}) =>
	auditTrip({ trip, days, items, codeDocs: extra.codeDocs ?? [], tasks: extra.tasks ?? [] });

describe('auditTrip', () => {
	it('flags nights without lodging, never the last day', () => {
		const stay = item({ type: 'lodging', title: 'Inn', day: 'd01', end_date: '2026-07-03 00:00:00.000Z', booked: true, requires_booking: true });
		const gaps = kinds(run([stay]), 'no_lodging');
		expect(gaps.map((g) => g.date)).toEqual(['2026-07-03']);
	});

	it('flags a placed flight with no confirmation code', () => {
		const f = item({ type: 'flight', title: 'UA 1' , booked: true });
		const g = item({ type: 'flight', title: 'UA 2', booked: true });
		const gaps = kinds(run([f, g], { codeDocs: [{ item: g.id, kind: 'code', code_label: 'PNR', code_value: 'X' }] }), 'flight_no_code');
		expect(gaps.map((x) => x.title)).toEqual(['UA 1']);
	});

	it('flags unbooked items that need booking, not booked ones', () => {
		const a = item({ type: 'transportation', title: 'Train', requires_booking: true, booked: false });
		const b = item({ type: 'lodging', title: 'Hotel', requires_booking: true, booked: true });
		expect(kinds(run([a, b]), 'unbooked').map((x) => x.title)).toEqual(['Train']);
	});

	it('flags one overlap per day, naming both items', () => {
		const a = item({ title: 'Tour', day: 'd02', start_time: '2026-07-02 14:00:00.000Z', end_time: '2026-07-02 16:00:00.000Z' });
		const b = item({ title: 'Cruise', day: 'd02', start_time: '2026-07-02 15:00:00.000Z', end_time: '2026-07-02 17:00:00.000Z' });
		const gaps = kinds(run([a, b]), 'overlap');
		expect(gaps).toHaveLength(1);
		expect(gaps[0].title).toContain('Tour');
		expect(gaps[0].title).toContain('Cruise');
		expect(gaps[0].date).toBe('2026-07-02');
	});

	it('lists unplaced ideas and open tasks only', () => {
		const idea = item({ day: '', title: 'Surf' });
		const tasks = [
			{ id: 'k1', checklist: 'c', title: 'Adapter', checked: false, assignee: '', order: 0 },
			{ id: 'k2', checklist: 'c', title: 'Passports', checked: true, assignee: '', order: 1 }
		] as Task[];
		const gaps = run([idea], { tasks });
		expect(kinds(gaps, 'unplaced_idea').map((g) => g.title)).toEqual(['Surf']);
		expect(kinds(gaps, 'open_task').map((g) => g.title)).toEqual(['Adapter']);
	});
});
