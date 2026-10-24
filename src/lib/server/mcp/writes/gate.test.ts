import { describe, it, expect } from 'vitest';
import { writesEnabled, assertCanWrite } from './gate';
import { tripRef } from '../context';
import type { Trip } from '$lib/types';

const trip = (over: Partial<Trip> = {}) =>
	({ id: 't1', title: 'Porto', ai_access: true, ai_write: true, ...over }) as Trip;

describe('writesEnabled — MCP_WRITES server switch', () => {
	it('is on by default', () => expect(writesEnabled({})).toBe(true));
	it('is off only for "off"', () => {
		expect(writesEnabled({ MCP_WRITES: 'off' })).toBe(false);
		expect(writesEnabled({ MCP_WRITES: 'on' })).toBe(true);
	});
});

describe('assertCanWrite', () => {
	it('lets an owner write an open trip', () => {
		expect(() => assertCanWrite(tripRef(trip(), 'owner', 'm1'))).not.toThrow();
		expect(tripRef(trip(), 'traveler', 'm1').canWrite).toBe(true);
	});
	it('refuses a viewer', () => {
		expect(() => assertCanWrite(tripRef(trip(), 'viewer', 'm1'))).toThrow(
			"Viewers can't change this trip."
		);
	});
	it('refuses when AI changes are off', () => {
		expect(() => assertCanWrite(tripRef(trip({ ai_write: false }), 'owner', 'm1'))).toThrow(
			'AI changes are turned off for this trip by its owner.'
		);
	});
	it('refuses when AI access is off, with the read notice', () => {
		expect(() => assertCanWrite(tripRef(trip({ ai_access: false }), 'owner', 'm1'))).toThrow(
			'AI access is turned off for this trip by its owner.'
		);
	});
});
