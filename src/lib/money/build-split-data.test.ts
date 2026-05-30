import { describe, it, expect } from 'vitest';
import { buildSplitData } from './build-split-data';

describe('buildSplitData', () => {
	it('returns equal split JSON with member IDs', () => {
		const result = buildSplitData('equal', new Set(['m1', 'm2', 'm3']), {});
		expect(JSON.parse(result)).toEqual({ members: ['m1', 'm2', 'm3'] });
	});

	it('returns by_amount split JSON with positive amounts only', () => {
		const result = buildSplitData('by_amount', new Set(), {
			m1: '10.50',
			m2: '0',
			m3: '5.25'
		});
		const parsed = JSON.parse(result);
		expect(parsed).toEqual({ amounts: { m1: 10.5, m3: 5.25 } });
	});

	it('filters out zero and negative amounts in by_amount mode', () => {
		const result = buildSplitData('by_amount', new Set(), {
			m1: '-5',
			m2: '0',
			m3: ''
		});
		expect(JSON.parse(result)).toEqual({ amounts: {} });
	});

	it('handles empty member set in equal mode', () => {
		const result = buildSplitData('equal', new Set(), {});
		expect(JSON.parse(result)).toEqual({ members: [] });
	});
});
