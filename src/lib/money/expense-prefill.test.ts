import { describe, it, expect } from 'vitest';
import {
	expensePrefillParams,
	expensePrefillQuery,
	logPaymentHref,
	type PrefillItem
} from './expense-prefill';

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

describe('logPaymentHref', () => {
	it('builds the ?action=add deep-link to the trip expenses page with the prefill', () => {
		const href = logPaymentHref('spain-2026', item());
		const [path, query] = href.split('?');
		expect(path).toBe('/trips/spain-2026/expenses');
		const sp = new URLSearchParams(query);
		expect(sp.get('action')).toBe('add');
		expect(sp.get('amount')).toBe('2400');
		expect(sp.get('description')).toBe('Group Airbnb');
		expect(sp.get('linked_item')).toBe('item1');
	});

	it('still carries action=add + linked_item when the item has no estimate', () => {
		const href = logPaymentHref('t', item({ cost_estimate_usd: undefined }));
		const sp = new URLSearchParams(href.split('?')[1]);
		expect(sp.get('action')).toBe('add');
		expect(sp.has('amount')).toBe(false);
		expect(sp.get('linked_item')).toBe('item1');
	});

	it('does NOT carry a split, payer, or date param (form defaults own them — ADR-0014)', () => {
		const sp = new URLSearchParams(logPaymentHref('t', item()).split('?')[1]);
		expect(sp.has('split_mode')).toBe(false);
		expect(sp.has('split_data')).toBe(false);
		expect(sp.has('paid_by')).toBe(false);
		expect(sp.has('date')).toBe(false);
	});
});
