import { describe, it, expect } from 'vitest';
import { getActiveTab, resolveChromeMode, fromTrip } from './nav-tabs';

const P = '/trips/spain-2025';

describe('getActiveTab', () => {
	it('maps trip-mode tab routes', () => {
		expect(getActiveTab(`${P}/now`, 'trip')).toBe('now');
		expect(getActiveTab(`${P}/today`, 'trip')).toBe('today');
		expect(getActiveTab(`${P}/documents`, 'trip')).toBe('documents');
		// #227 — Trip-Mode Money summary maps to 'money' (ready for the #166 nav slot).
		expect(getActiveTab(`${P}/money`, 'trip')).toBe('money');
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
		// #227 — the Trip-Mode Money summary is its own trip surface (clay), distinct
		// from the planning /expenses + /budget pages it deep-links to.
		expect(resolveChromeMode(`${P}/money`, true, null)).toBe('trip');
	});

	it('keeps the Money summary planning chrome before the trip is active', () => {
		// Like /now, /money is planning chrome until the trip's dates make it active.
		expect(resolveChromeMode(`${P}/money`, false, null)).toBe('planning');
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
