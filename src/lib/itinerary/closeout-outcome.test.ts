import { describe, it, expect } from 'vitest';
import { outcomeUpdate, parseOutcome, parseRating, itemOutcome } from './closeout-outcome';

describe('closeout outcome', () => {
	it('maps outcomes to status + rating', () => {
		expect(outcomeUpdate('recommend')).toEqual({ status: 'done', rating: 'recommend' });
		expect(outcomeUpdate('not_recommend')).toEqual({ status: 'done', rating: 'not_recommend' });
		expect(outcomeUpdate('didnt_do')).toEqual({ status: 'considered', rating: '' });
	});
	it('parses outcomes', () => {
		expect(parseOutcome('recommend')).toBe('recommend');
		expect(parseOutcome('didnt_do')).toBe('didnt_do');
		expect(parseOutcome('skip')).toBeNull();
		expect(parseOutcome(null)).toBeNull();
	});
	it('parses ratings; empty string clears', () => {
		expect(parseRating('')).toBe('');
		expect(parseRating('recommend')).toBe('recommend');
		expect(parseRating('not_recommend')).toBe('not_recommend');
		expect(parseRating('meh')).toBeNull();
		expect(parseRating(undefined)).toBeNull();
	});
	it('derives an item outcome', () => {
		expect(itemOutcome({ status: 'done', rating: 'recommend' })).toBe('recommend');
		expect(itemOutcome({ status: 'done', rating: 'not_recommend' })).toBe('not_recommend');
		expect(itemOutcome({ status: 'done', rating: '' })).toBe('done_unrated');
		expect(itemOutcome({ status: 'considered', rating: '' })).toBe('didnt_do');
		expect(itemOutcome({ status: 'planned', rating: '' })).toBe('pending');
		expect(itemOutcome({ status: 'unplanned', rating: '' })).toBe('pending');
	});
});
