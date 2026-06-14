import { describe, it, expect } from 'vitest';
import { plannedByCategory, itemTypeToCategory, type PlannedItem } from './planned-by-category';

describe('itemTypeToCategory', () => {
	it('maps meal to food and flight to transportation', () => {
		expect(itemTypeToCategory('meal')).toBe('food');
		expect(itemTypeToCategory('flight')).toBe('transportation');
		expect(itemTypeToCategory('transportation')).toBe('transportation');
		expect(itemTypeToCategory('lodging')).toBe('lodging');
		expect(itemTypeToCategory('activity')).toBe('activity');
	});

	it('folds note and checklist into other', () => {
		expect(itemTypeToCategory('note')).toBe('other');
		expect(itemTypeToCategory('checklist')).toBe('other');
	});
});

describe('plannedByCategory', () => {
	it('returns all categories at zero for no items', () => {
		expect(plannedByCategory([])).toEqual({
			lodging: 0,
			transportation: 0,
			food: 0,
			activity: 0,
			other: 0
		});
	});

	it('sums cost_estimate_usd into the mapped category', () => {
		const items: PlannedItem[] = [
			{ type: 'lodging', cost_estimate_usd: 100 },
			{ type: 'lodging', cost_estimate_usd: 50 },
			{ type: 'meal', cost_estimate_usd: 20 },
			{ type: 'flight', cost_estimate_usd: 300 },
			{ type: 'transportation', cost_estimate_usd: 40 },
			{ type: 'activity', cost_estimate_usd: 75 },
			{ type: 'note', cost_estimate_usd: 5 }
		];
		expect(plannedByCategory(items)).toEqual({
			lodging: 150,
			transportation: 340, // flight 300 + transportation 40
			food: 20,
			activity: 75,
			other: 5
		});
	});

	it('treats missing or zero cost_estimate_usd as zero', () => {
		const items: PlannedItem[] = [
			{ type: 'activity' },
			{ type: 'activity', cost_estimate_usd: 0 },
			{ type: 'activity', cost_estimate_usd: 10 }
		];
		expect(plannedByCategory(items).activity).toBe(10);
	});
});
