import { describe, it, expect } from 'vitest';
import { buildGoalPrompts, locationPhrase } from './goal-prompts';

describe('locationPhrase', () => {
	it('prefers location_summary when present', () => {
		expect(locationPhrase('Barcelona, Spain', ['ES'])).toBe('Barcelona, Spain');
	});

	it('falls back to a single country when summary is blank', () => {
		expect(locationPhrase('', ['Japan'])).toBe('Japan');
	});

	it('joins two countries with an ampersand', () => {
		expect(locationPhrase('   ', ['Spain', 'Portugal'])).toBe('Spain & Portugal');
	});

	it('folds 3+ countries into a readable list', () => {
		expect(locationPhrase('', ['Spain', 'Portugal', 'France'])).toBe('Spain, Portugal & France');
	});

	it('returns null when there is no location at all', () => {
		expect(locationPhrase('', [])).toBeNull();
		expect(locationPhrase('  ', ['', '  '])).toBeNull();
	});
});

describe('buildGoalPrompts', () => {
	it('injects the location into every prompt when present', () => {
		const prompts = buildGoalPrompts('Spain', []);
		expect(prompts.length).toBeGreaterThanOrEqual(6);
		expect(prompts.every((p) => p.text.includes('Spain'))).toBe(true);
		expect(prompts.some((p) => p.text.includes('{place}'))).toBe(false);
	});

	it('degrades to generic prompts when the trip has no destination', () => {
		const prompts = buildGoalPrompts('', []);
		expect(prompts.every((p) => !p.text.includes('{place}'))).toBe(true);
		expect(prompts.find((p) => p.id === 'food')?.text).toBe('A food you have to try?');
	});

	it('keeps stable ids across located and generic variants', () => {
		const located = buildGoalPrompts('Spain', []).map((p) => p.id);
		const generic = buildGoalPrompts('', []).map((p) => p.id);
		expect(located).toEqual(generic);
		expect(new Set(located).size).toBe(located.length); // ids unique
	});
});
