import { describe, it, expect } from 'vitest';
import { getFieldConfig } from './item-fields';
import type { ItemType } from '$lib/types';

const ALL_TYPES: ItemType[] = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist'];

describe('getFieldConfig', () => {
	it('returns a config for every ItemType', () => {
		for (const type of ALL_TYPES) {
			const config = getFieldConfig(type);
			expect(config).toBeDefined();
			expect(config.type).toBe(type);
		}
	});

	it('config includes visibility, validation, defaults, and labels', () => {
		const config = getFieldConfig('lodging');
		expect(config.visibility).toBeDefined();
		expect(config.validation).toBeDefined();
		expect(config.defaults).toBeDefined();
		expect(config.labels).toBeDefined();
	});

	describe('visibility', () => {
		it('preserves lodging visibility flags', () => {
			const { visibility } = getFieldConfig('lodging');
			expect(visibility.subtype).toBe(true);
			expect(visibility.location).toBe(true);
			expect(visibility.times).toBe(true);
			expect(visibility.booking).toBe(true);
			expect(visibility.costs).toBe(true);
			expect(visibility.confirmationCodes).toBe(true);
			expect(visibility.checklist).toBe(false);
			expect(visibility.parentItem).toBe(false);
		});

		it('preserves note visibility flags (all false)', () => {
			const { visibility } = getFieldConfig('note');
			expect(visibility.subtype).toBe(false);
			expect(visibility.location).toBe(false);
			expect(visibility.times).toBe(false);
			expect(visibility.booking).toBe(false);
			expect(visibility.costs).toBe(false);
			expect(visibility.confirmationCodes).toBe(false);
			expect(visibility.checklist).toBe(false);
			expect(visibility.parentItem).toBe(false);
		});
	});

	describe('validation', () => {
		it('title is required with maxLength 200', () => {
			const { validation } = getFieldConfig('lodging');
			expect(validation.title.required).toBe(true);
			expect(validation.title.maxLength).toBe(200);
		});

		it('costs have min 0', () => {
			const { validation } = getFieldConfig('activity');
			expect(validation.cost_estimate_usd.min).toBe(0);
			expect(validation.cost_actual_usd.min).toBe(0);
		});

		it('reservation_url has url pattern', () => {
			const { validation } = getFieldConfig('lodging');
			expect(validation.reservation_url.pattern).toBe('url');
		});

		it('same validation rules for every type', () => {
			for (const type of ALL_TYPES) {
				const { validation } = getFieldConfig(type);
				expect(validation.title.required).toBe(true);
				expect(validation.title.maxLength).toBe(200);
				expect(validation.cost_estimate_usd.min).toBe(0);
				expect(validation.cost_actual_usd.min).toBe(0);
				expect(validation.reservation_url.pattern).toBe('url');
			}
		});
	});

	describe('defaults', () => {
		it('slot defaults to anytime', () => {
			const { defaults } = getFieldConfig('lodging');
			expect(defaults.slot).toBe('anytime');
		});

		it('status defaults to planned', () => {
			const { defaults } = getFieldConfig('activity');
			expect(defaults.status).toBe('planned');
		});

		it('booked defaults to false', () => {
			const { defaults } = getFieldConfig('lodging');
			expect(defaults.booked).toBe(false);
		});

		it('free_cancellation defaults to false', () => {
			const { defaults } = getFieldConfig('lodging');
			expect(defaults.free_cancellation).toBe(false);
		});

		it('costs default to 0', () => {
			const { defaults } = getFieldConfig('meal');
			expect(defaults.cost_estimate_usd).toBe(0);
			expect(defaults.cost_actual_usd).toBe(0);
		});

		it('subtype defaults to empty string for types with no subtypes', () => {
			const { defaults } = getFieldConfig('note');
			expect(defaults.subtype).toBe('');
		});

		it('subtype defaults to first subtype for types that have subtypes', () => {
			const { defaults } = getFieldConfig('lodging');
			expect(defaults.subtype).toBe('hotel');
		});
	});

	describe('labels', () => {
		it('typeLabel matches itemTypeLabels', () => {
			expect(getFieldConfig('lodging').labels.typeLabel).toBe('Lodging');
			expect(getFieldConfig('transportation').labels.typeLabel).toBe('Transportation');
			expect(getFieldConfig('note').labels.typeLabel).toBe('Note');
		});

		it('subtypeLabel describes the subtype field', () => {
			const { labels } = getFieldConfig('lodging');
			expect(typeof labels.subtypeLabel).toBe('string');
			expect(labels.subtypeLabel.length).toBeGreaterThan(0);
		});

		it('subtypeOptions are title-cased value/label pairs', () => {
			const { labels } = getFieldConfig('lodging');
			expect(labels.subtypeOptions).toHaveLength(4);
			expect(labels.subtypeOptions[0]).toEqual({ value: 'hotel', label: 'Hotel' });
			expect(labels.subtypeOptions[3]).toEqual({ value: 'other', label: 'Other' });
		});

		it('subtypeOptions is empty for types with no subtypes', () => {
			const { labels } = getFieldConfig('note');
			expect(labels.subtypeOptions).toHaveLength(0);
		});
	});
});
