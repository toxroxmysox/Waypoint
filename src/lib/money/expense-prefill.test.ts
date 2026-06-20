import { describe, it, expect } from 'vitest';
import { expensePrefillParams, expensePrefillQuery, type PrefillItem } from './expense-prefill';

const item = (over: Partial<PrefillItem> = {}): PrefillItem => ({
	id: 'item1',
	title: 'Group Airbnb',
	cost_estimate_usd: 2400,
	...over
});

describe('expensePrefillParams', () => {
	it('maps estimate → amount, title → description, id → linked_item', () => {
		expect(expensePrefillParams(item())).toEqual({
			amount: '2400',
			description: 'Group Airbnb',
			linked_item: 'item1'
		});
	});

	it('omits amount when the estimate is missing (blank amount, never "0")', () => {
		const params = expensePrefillParams(item({ cost_estimate_usd: undefined }));
		expect(params.amount).toBeUndefined();
		expect(params).toEqual({ description: 'Group Airbnb', linked_item: 'item1' });
	});

	it('omits amount when the estimate is zero', () => {
		const params = expensePrefillParams(item({ cost_estimate_usd: 0 }));
		expect(params.amount).toBeUndefined();
	});

	it('omits amount when the estimate is negative (defensive)', () => {
		const params = expensePrefillParams(item({ cost_estimate_usd: -5 }));
		expect(params.amount).toBeUndefined();
	});

	it('serializes a fractional estimate without trailing-zero noise', () => {
		expect(expensePrefillParams(item({ cost_estimate_usd: 12.5 })).amount).toBe('12.5');
	});

	it('trims the title and omits description when blank', () => {
		expect(expensePrefillParams(item({ title: '  Hotel  ' })).description).toBe('Hotel');
		expect(expensePrefillParams(item({ title: '   ' })).description).toBeUndefined();
	});

	it('does NOT emit a paid_by or date param (payer = form default; date = caller)', () => {
		const params = expensePrefillParams(item());
		expect('paid_by' in params).toBe(false);
		expect('date' in params).toBe(false);
	});

	it('always carries linked_item so the expense links back to the item', () => {
		expect(expensePrefillParams(item({ id: 'xyz' })).linked_item).toBe('xyz');
	});
});

describe('expensePrefillQuery', () => {
	it('encodes the params as a query string with only the set keys', () => {
		const q = new URLSearchParams(expensePrefillQuery(item()));
		expect(q.get('amount')).toBe('2400');
		expect(q.get('description')).toBe('Group Airbnb');
		expect(q.get('linked_item')).toBe('item1');
	});

	it('URL-encodes a title with spaces and symbols', () => {
		const q = new URLSearchParams(expensePrefillQuery(item({ title: 'Car & ferry' })));
		expect(q.get('description')).toBe('Car & ferry');
	});

	it('drops the amount key entirely when there is no estimate', () => {
		const raw = expensePrefillQuery(item({ cost_estimate_usd: 0 }));
		expect(raw).not.toContain('amount=');
		expect(new URLSearchParams(raw).get('linked_item')).toBe('item1');
	});
});
