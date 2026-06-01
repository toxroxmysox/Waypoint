import { describe, it, expect } from 'vitest';
import { getFieldConfig, buildEmptyFormData } from './item-fields';
import type { ItemType } from '$lib/types';

const ALL_TYPES: ItemType[] = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist', 'flight'];

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
		it('typeLabel matches itemTypeLabels for every type', () => {
			expect(getFieldConfig('lodging').labels.typeLabel).toBe('Lodging');
			expect(getFieldConfig('transportation').labels.typeLabel).toBe('Transportation');
			expect(getFieldConfig('activity').labels.typeLabel).toBe('Activity');
			expect(getFieldConfig('meal').labels.typeLabel).toBe('Meal');
			expect(getFieldConfig('note').labels.typeLabel).toBe('Note');
			expect(getFieldConfig('checklist').labels.typeLabel).toBe('Checklist');
			expect(getFieldConfig('flight').labels.typeLabel).toBe('Flight');
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

	it('returns config for flight type', () => {
		const config = getFieldConfig('flight');
		expect(config.visibility.location).toBe(true);
		expect(config.visibility.times).toBe(true);
		expect(config.visibility.booking).toBe(true);
		expect(config.visibility.subtype).toBe(false);
	});
});

describe('buildEmptyFormData', () => {
	it('sets type to the given type', () => {
		const data = buildEmptyFormData('meal');
		expect(data.type).toBe('meal');
	});

	it('uses defaults from config: status, booked, costs', () => {
		const data = buildEmptyFormData('meal');
		expect(data.status).toBe('planned');
		expect(data.booked).toBe(false);
		expect(data.free_cancellation).toBe(false);
		expect(data.cost_estimate_usd).toBe(0);
		expect(data.cost_actual_usd).toBe(0);
	});

	it('initializes string fields as empty strings', () => {
		const data = buildEmptyFormData('activity');
		expect(data.title).toBe('');
		expect(data.description).toBe('');
		expect(data.day).toBe('');
		expect(data.phase).toBe('');
		expect(data.start_time).toBe('');
		expect(data.end_time).toBe('');
		expect(data.location_name).toBe('');
		expect(data.location_address).toBe('');
		expect(data.google_place_id).toBe('');
		expect(data.reservation_url).toBe('');
	});

	it('initializes arrays and objects correctly', () => {
		const data = buildEmptyFormData('lodging');
		expect(data.confirmation_codes).toEqual([]);
		expect(data.assigned_to).toEqual([]);
		expect(data.location_coords).toBeNull();
	});

	it('subtype comes from config defaults', () => {
		const mealData = buildEmptyFormData('meal');
		expect(mealData.subtype).toBe('breakfast'); // first meal subtype

		const noteData = buildEmptyFormData('note');
		expect(noteData.subtype).toBe(''); // no subtypes
	});
});

describe('config exhaustiveness', () => {
	it('every ItemType has a complete config with all four sections', () => {
		for (const type of ALL_TYPES) {
			const config = getFieldConfig(type);
			expect(config.labels.typeLabel).toBeTruthy();
			expect(config.visibility).toBeDefined();
			expect(config.defaults).toBeDefined();
			expect(config.validation).toBeDefined();
		}
	});

	it('buildEmptyFormData produces valid form data for every type', () => {
		for (const type of ALL_TYPES) {
			const data = buildEmptyFormData(type);
			expect(data.type).toBe(type);
			expect(data.title).toBe('');
			expect(typeof data.status).toBe('string');
		}
	});
});
