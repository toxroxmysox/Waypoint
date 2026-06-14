import { describe, it, expect } from 'vitest';
import { getActiveTab, resolveChromeMode, fromTrip } from './nav-tabs';

const P = '/trips/spain-2025';

describe('getActiveTab', () => {
	it('maps trip-mode tab routes', () => {
		expect(getActiveTab(`${P}/now`, 'trip')).toBe('now');
		expect(getActiveTab(`${P}/today`, 'trip')).toBe('today');
		expect(getActiveTab(`${P}/documents`, 'trip')).toBe('documents');
	});

	it('returns no active tab for non-tab trip surfaces (#197)', () => {
		// Item detail reached from Trip Mode must not false-highlight "Now".
		expect(getActiveTab(`${P}/items/abc123`, 'trip')).toBe('');
	});

	it('maps planning tab routes', () => {
		expect(getActiveTab(P, 'planning')).toBe('itinerary');
		expect(getActiveTab(`${P}/expenses`, 'planning')).toBe('money');
		expect(getActiveTab(`${P}/members`, 'planning')).toBe('members');
		expect(getActiveTab(`${P}/documents`, 'planning')).toBe('documents');
		expect(getActiveTab(`${P}/more`, 'planning')).toBe('more');
	});
});

describe('resolveChromeMode (#197 B-011)', () => {
	it('always planning when the trip is not date-active', () => {
		expect(resolveChromeMode(`${P}/now`, false, null)).toBe('planning');
		expect(resolveChromeMode(`${P}/today`, false, 'trip')).toBe('planning');
	});

	it('renders trip chrome on the exclusive Trip-Mode surfaces', () => {
		expect(resolveChromeMode(`${P}/now`, true, null)).toBe('trip');
		expect(resolveChromeMode(`${P}/today`, true, null)).toBe('trip');
		expect(resolveChromeMode(`${P}/today/upcoming`, true, null)).toBe('trip');
	});

	it('renders PLANNING chrome on the active-trip Overview — no chimera', () => {
		expect(resolveChromeMode(P, true, null)).toBe('planning');
		expect(resolveChromeMode(`${P}/`, true, null)).toBe('planning');
		expect(resolveChromeMode(`${P}/expenses`, true, null)).toBe('planning');
		expect(resolveChromeMode(`${P}/phases/p1`, true, null)).toBe('planning');
		expect(resolveChromeMode(`${P}/days/d1`, true, null)).toBe('planning');
	});

	it('shared surfaces (items, documents) follow the user override, defaulting to trip', () => {
		expect(resolveChromeMode(`${P}/items/abc`, true, null)).toBe('trip');
		expect(resolveChromeMode(`${P}/items/abc`, true, 'planning')).toBe('planning');
		expect(resolveChromeMode(`${P}/items/new`, true, null)).toBe('trip');
		expect(resolveChromeMode(`${P}/documents`, true, null)).toBe('trip');
		expect(resolveChromeMode(`${P}/documents`, true, 'planning')).toBe('planning');
	});
});

describe('fromTrip', () => {
	it('detects the ?from=trip marker', () => {
		expect(fromTrip(new URL(`http://x${P}/items/abc?from=trip`))).toBe(true);
		expect(fromTrip(new URL(`http://x${P}/items/abc`))).toBe(false);
		expect(fromTrip(new URL(`http://x${P}/items/abc?from=planning`))).toBe(false);
	});
});
