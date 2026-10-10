import { describe, it, expect } from 'vitest';
import {
	canSelfAssign,
	toggleAssignee,
	parseGoingState,
	goingStateOf,
	goingPatch,
	applyGoing
} from './assignment';

describe('applyGoing (#440, optimistic mirror of goingPatch)', () => {
	const lists = { assigned_to: ['a', 'b'], not_going: ['c'] };
	it('going: appended to assigned_to, removed from not_going', () => {
		expect(applyGoing(lists, 'c', 'going')).toEqual({ assigned_to: ['a', 'b', 'c'], not_going: [] });
	});
	it('not going: moves out of assigned_to', () => {
		expect(applyGoing(lists, 'a', 'not_going')).toEqual({ assigned_to: ['b'], not_going: ['c', 'a'] });
	});
	it('no answer: out of both', () => {
		expect(applyGoing(lists, 'b', 'no_answer')).toEqual({ assigned_to: ['a'], not_going: ['c'] });
	});
	it('same state is idempotent; missing lists tolerated; input not mutated', () => {
		expect(applyGoing(lists, 'a', 'going')).toEqual({ assigned_to: ['a', 'b'], not_going: ['c'] });
		expect(applyGoing({}, 'x', 'not_going')).toEqual({ assigned_to: [], not_going: ['x'] });
		expect(lists.assigned_to).toEqual(['a', 'b']);
	});
});

describe('canSelfAssign', () => {
	it('allows traveler, co_owner, owner', () => {
		expect(canSelfAssign('traveler')).toBe(true);
		expect(canSelfAssign('co_owner')).toBe(true);
		expect(canSelfAssign('owner')).toBe(true);
	});

	it('denies viewer', () => {
		expect(canSelfAssign('viewer')).toBe(false);
	});

	it('denies an unknown / blank / missing role (non-member)', () => {
		expect(canSelfAssign('')).toBe(false);
		expect(canSelfAssign(undefined)).toBe(false);
		expect(canSelfAssign(null)).toBe(false);
		expect(canSelfAssign('stranger')).toBe(false);
	});
});

describe('toggleAssignee', () => {
	it('adds the member when absent (appends to the end)', () => {
		expect(toggleAssignee([], 'm1')).toEqual(['m1']);
		expect(toggleAssignee(['m1', 'm2'], 'm3')).toEqual(['m1', 'm2', 'm3']);
	});

	it('removes the member when present', () => {
		expect(toggleAssignee(['m1'], 'm1')).toEqual([]);
		expect(toggleAssignee(['m1', 'm2', 'm3'], 'm2')).toEqual(['m1', 'm3']);
	});

	it('round-trips the membership when toggled twice (add→remove restores exactly)', () => {
		const start = ['m1', 'm2'];
		const once = toggleAssignee(start, 'm3');
		const twice = toggleAssignee(once, 'm3');
		expect(twice).toEqual(start);
	});

	it('toggling an existing id off then on re-adds it (order-stable: appended)', () => {
		const start = ['m1', 'm2'];
		const off = toggleAssignee(start, 'm1'); // ['m2']
		const onAgain = toggleAssignee(off, 'm1'); // ['m2','m1'] — append, not original order
		expect(onAgain).toEqual(['m2', 'm1']);
		expect(new Set(onAgain)).toEqual(new Set(start)); // same membership
	});

	it('is order-stable: the rest keep their order when one is removed', () => {
		expect(toggleAssignee(['a', 'b', 'c', 'd'], 'c')).toEqual(['a', 'b', 'd']);
	});

	it('never produces duplicates (adding an existing id removes it instead)', () => {
		const out = toggleAssignee(['m1', 'm2'], 'm1');
		expect(out).toEqual(['m2']);
		expect(new Set(out).size).toBe(out.length);
	});

	it('does not mutate the input array', () => {
		const start = ['m1', 'm2'];
		const copy = [...start];
		toggleAssignee(start, 'm3');
		toggleAssignee(start, 'm1');
		expect(start).toEqual(copy);
	});
});

// #402 — three-state Going (going / not going / no answer).
describe('parseGoingState', () => {
	it('parses the three states', () => {
		expect(parseGoingState('going')).toBe('going');
		expect(parseGoingState('not_going')).toBe('not_going');
		expect(parseGoingState('no_answer')).toBe('no_answer');
	});

	it('rejects anything else (exact match only)', () => {
		for (const raw of ['Going', '', 'none', 'not going', null, undefined, 1, {}]) {
			expect(parseGoingState(raw)).toBeNull();
		}
	});
});

describe('goingStateOf', () => {
	it('reads going from assigned_to', () => {
		expect(goingStateOf({ assigned_to: ['m1'], not_going: [] }, 'm1')).toBe('going');
	});

	it('reads not going from not_going', () => {
		expect(goingStateOf({ assigned_to: [], not_going: ['m1'] }, 'm1')).toBe('not_going');
	});

	it('reads no answer when the member is in neither list (or the lists are missing)', () => {
		expect(goingStateOf({}, 'm1')).toBe('no_answer');
		expect(goingStateOf({ assigned_to: null, not_going: null }, 'm1')).toBe('no_answer');
		expect(goingStateOf({ assigned_to: ['m2'], not_going: ['m3'] }, 'm1')).toBe('no_answer');
	});

	it('going wins when a member is (illegally) in both lists, as on the server', () => {
		expect(goingStateOf({ assigned_to: ['m1'], not_going: ['m1'] }, 'm1')).toBe('going');
	});
});

describe('goingPatch', () => {
	it('going adds the member to assigned_to and clears their not going', () => {
		expect(goingPatch('going', 'm1')).toEqual({ 'assigned_to+': 'm1', 'not_going-': 'm1' });
	});

	it('not going adds the member to not_going and clears their going', () => {
		expect(goingPatch('not_going', 'm1')).toEqual({ 'not_going+': 'm1', 'assigned_to-': 'm1' });
	});

	it('no answer removes the member from both lists', () => {
		expect(goingPatch('no_answer', 'm1')).toEqual({ 'assigned_to-': 'm1', 'not_going-': 'm1' });
	});

	it('only ever touches the given member', () => {
		for (const state of ['going', 'not_going', 'no_answer'] as const) {
			expect(Object.values(goingPatch(state, 'm1')).every((v) => v === 'm1')).toBe(true);
		}
	});
});
