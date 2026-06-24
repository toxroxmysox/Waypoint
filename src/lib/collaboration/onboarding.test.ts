import { describe, it, expect } from 'vitest';
import { needsOnboarding } from './onboarding';

describe('needsOnboarding', () => {
	it('returns true when onboarded_at is absent (a fresh user)', () => {
		expect(needsOnboarding({} as never)).toBe(true);
	});

	it('returns true when onboarded_at is the empty string (PB unset date)', () => {
		expect(needsOnboarding({ onboarded_at: '' })).toBe(true);
	});

	it('returns true when onboarded_at is whitespace only', () => {
		expect(needsOnboarding({ onboarded_at: '   ' })).toBe(true);
	});

	it('returns false when onboarded_at carries a real timestamp', () => {
		expect(needsOnboarding({ onboarded_at: '2026-06-23 10:00:00.000Z' })).toBe(false);
	});

	it('returns false for a null/undefined user (unauthenticated — never nag)', () => {
		expect(needsOnboarding(null)).toBe(false);
		expect(needsOnboarding(undefined)).toBe(false);
	});
});
