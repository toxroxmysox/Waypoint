import { describe, expect, it } from 'vitest';
import { flightPlaceLine, flightTitle, formatFlightNumber } from './flight-place';

describe('formatFlightNumber', () => {
	it('spaces the carrier from the digits and uppercases', () => {
		expect(formatFlightNumber('ua1234')).toBe('UA 1234');
		expect(formatFlightNumber(' AA  88 ')).toBe('AA 88');
		expect(formatFlightNumber('3K123')).toBe('3K 123');
	});
	it('leaves unparseable input trimmed and uppercased', () => {
		expect(formatFlightNumber('spirit')).toBe('SPIRIT');
		expect(formatFlightNumber('')).toBe('');
	});
});

describe('flightTitle', () => {
	it('number to city', () => {
		expect(flightTitle({ number: 'UA1234', city: 'Denver', code: 'DEN' })).toBe('UA 1234 to Denver');
	});
	it('falls back to the airport code when no city', () => {
		expect(flightTitle({ number: 'UA1234', city: '', code: 'DEN' })).toBe('UA 1234 to DEN');
	});
	it('no number: Flight to city', () => {
		expect(flightTitle({ number: '', city: 'Denver', code: 'DEN' })).toBe('Flight to Denver');
		expect(flightTitle({ number: '', city: '', code: 'DEN' })).toBe('Flight to DEN');
	});
	it('no destination: the number, or Flight', () => {
		expect(flightTitle({ number: 'UA1234', city: '', code: '' })).toBe('UA 1234');
		expect(flightTitle({ number: '', city: '', code: '' })).toBe('Flight');
	});
});

describe('flightPlaceLine', () => {
	const route = 'MKE → DEN';
	it('new flight: title carries the number, so the line is the route', () => {
		expect(flightPlaceLine({ title: 'UA 1234 to Denver', flight_number: 'UA 1234', route })).toBe(route);
	});
	it('contains check ignores spaces and case', () => {
		expect(flightPlaceLine({ title: 'ua1234 overnight', flight_number: 'UA 1234', route })).toBe(route);
	});
	it('legacy flight with a stored number the title lacks', () => {
		expect(flightPlaceLine({ title: 'Spirit to the coast', flight_number: 'NK 345', route })).toBe(
			'NK 345 · MKE → DEN'
		);
	});
	it('no stored number: route only', () => {
		expect(flightPlaceLine({ title: 'Flight to Denver', flight_number: '', route })).toBe(route);
		expect(flightPlaceLine({ title: 'x', route })).toBe(route);
	});
	it('legacy number with no route: just the number', () => {
		expect(flightPlaceLine({ title: 'Spirit', flight_number: 'NK 345', route: '' })).toBe('NK 345');
	});
});
