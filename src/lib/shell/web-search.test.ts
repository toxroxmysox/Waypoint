import { describe, it, expect } from 'vitest';
import { whatIsQuery, whatIsSearchUrl } from './web-search';

describe('whatIsSearchUrl (#406)', () => {
	it('asks what the thing is, in the trip place', () => {
		expect(whatIsQuery('Pastéis de Belém', 'Lisbon, Portugal')).toBe('what is Pastéis de Belém in Lisbon, Portugal');
	});
	it('drops the place when the trip has none', () => {
		expect(whatIsQuery(' Fado ', '  ')).toBe('what is Fado');
	});
	it('is an encoded Google search', () => {
		expect(whatIsSearchUrl('Fado & port', 'Porto')).toBe(
			'https://www.google.com/search?q=what%20is%20Fado%20%26%20port%20in%20Porto'
		);
	});
	it("'' for an empty title", () => {
		expect(whatIsSearchUrl('  ', 'Porto')).toBe('');
	});
});
