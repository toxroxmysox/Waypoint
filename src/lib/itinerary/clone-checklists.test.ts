import { describe, it, expect } from 'vitest';
import { cloneChecklistPayloads } from './clone-checklists';
import type { Checklist, Task } from '$lib/types';

function cl(o: Partial<Checklist>): Checklist {
	return { id: 'c', trip: 'src', phase: '', item: '', title: 'L', kind: 'manual', order: 0, ...o } as Checklist;
}
function tk(o: Partial<Task>): Task {
	return { id: 't', checklist: 'c', title: 'T', checked: false, assignee: '', order: 0, ...o } as Task;
}

describe('cloneChecklistPayloads (#53)', () => {
	it('resets checked to false and drops assignee', () => {
		const checklists = [cl({ id: 'c1', title: 'Packing' })];
		const tasks = [
			tk({ id: 't1', checklist: 'c1', title: 'Passport', checked: true, assignee: 'mem1', order: 0 }),
			tk({ id: 't2', checklist: 'c1', title: 'Socks', checked: false, order: 1 })
		];
		const [out] = cloneChecklistPayloads(checklists, tasks, new Map(), 'newTrip');
		expect(out.checklist).toMatchObject({ trip: 'newTrip', phase: '', item: '', title: 'Packing', kind: 'manual' });
		expect(out.tasks).toEqual([
			{ title: 'Passport', checked: false, order: 0 },
			{ title: 'Socks', checked: false, order: 1 }
		]);
		// no assignee key carried through
		expect(JSON.stringify(out.tasks)).not.toContain('mem1');
	});

	it('skips the booking smart list and item-scoped lists', () => {
		const checklists = [
			cl({ id: 'c1', title: 'Packing', kind: 'manual' }),
			cl({ id: 'c2', title: 'Booking', kind: 'booking' }),
			cl({ id: 'c3', title: 'Grocery', item: 'i9' })
		];
		const out = cloneChecklistPayloads(checklists, [], new Map(), 'newTrip');
		expect(out.map((o) => o.checklist.title)).toEqual(['Packing']);
	});

	it('remaps phase-scoped lists and drops those whose phase was not cloned', () => {
		const checklists = [
			cl({ id: 'c1', title: 'Has phase', phase: 'oldP' }),
			cl({ id: 'c2', title: 'Orphan phase', phase: 'goneP' })
		];
		const out = cloneChecklistPayloads(checklists, [], new Map([['oldP', 'newP']]), 'newTrip');
		expect(out).toHaveLength(1);
		expect(out[0].checklist).toMatchObject({ title: 'Has phase', phase: 'newP' });
	});
});
