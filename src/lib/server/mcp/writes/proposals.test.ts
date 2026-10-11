import { describe, it, expect } from 'vitest';
import { saveProposal, takeProposal, markCommitted, staleFields } from './proposals';
import type { PlannedChange } from './types';

const change: PlannedChange = {
	action: 'update',
	collection: 'items',
	id: 'lunch',
	via: 'record',
	before: { title: 'Lunch', start_time: '2026-11-03 09:00:00.000Z' },
	after: { title: 'Lunch at Taberna', start_time: '2026-11-03 09:40:00.000Z' },
	outcome: 'saved',
	title: 'Lunch'
};
const base = { userId: 'u1', connectionId: 'c1', tripId: 'porto', quote: 'call it Lunch at Taberna', changes: [change], cascade: null };

describe('proposal store', () => {
	it('saves and takes back a proposal', () => {
		const p = saveProposal(base, 1000);
		expect(takeProposal(p.id, 'u1', 'c1', 2000)).toMatchObject({ id: p.id, quote: base.quote });
	});
	it('expires after 15 minutes', () => {
		const p = saveProposal(base, 0);
		expect(takeProposal(p.id, 'u1', 'c1', 15 * 60 * 1000 + 1)).toBe('expired');
	});
	it('is not yours from another user or connection', () => {
		const p = saveProposal(base, 0);
		expect(takeProposal(p.id, 'u2', 'c1', 1)).toBe('not_yours');
		expect(takeProposal(p.id, 'u1', 'c2', 1)).toBe('not_yours');
	});
	it('an unknown id reads as expired', () => {
		expect(takeProposal('nope', 'u1', 'c1', 1)).toBe('expired');
	});
	it('remembers it was committed', () => {
		const p = saveProposal(base, 0);
		markCommitted(p.id, 'chg1');
		expect(takeProposal(p.id, 'u1', 'c1', 1)).toMatchObject({ committedChangeId: 'chg1' });
	});
});

describe('staleFields', () => {
	it('lists only the fields changed since the preview', () => {
		expect(staleFields(change, { title: 'Brunch', start_time: '2026-11-03 09:00:00.000Z' })).toEqual(['title']);
	});
	it('treats a deleted record as all fields stale', () => {
		expect(staleFields(change, null)).toEqual(['title', 'start_time']);
	});
	it('ignores PB\'s own formatting of an empty value', () => {
		expect(staleFields({ ...change, before: { title: '', start_time: '' } }, { title: '', start_time: '' })).toEqual([]);
	});
});
