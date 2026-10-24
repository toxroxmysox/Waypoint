import { describe, it, expect } from 'vitest';
import { nightCards, phaseCard, tripNotesCard } from './get-trip';

const night = (n: number, lodging: string) => ({
	date: `2026-10-${String(n).padStart(2, '0')}`,
	lodging
});

describe('nightCards (#512: a long stay is one card, so goals and ideas survive the 50-card cap)', () => {
	it('collapses consecutive nights at the same place into one range', () => {
		const nights = Array.from({ length: 45 }, (_, i) => ({
			date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
			lodging: 'Casa do Rio'
		}));
		const cards = nightCards(nights);
		expect(cards).toHaveLength(1);
		expect(cards[0].title).toBe('Thu Oct 1 → Sat Nov 14');
		expect(cards[0].lines).toEqual(['Casa do Rio · 45 nights']);
	});
	it('keeps a change of place as its own card', () => {
		const cards = nightCards([night(1, 'A'), night(2, 'A'), night(3, 'B'), night(4, 'no lodging')]);
		expect(cards.map((c) => c.lines[0])).toEqual(['A · 2 nights', 'B', 'no lodging']);
		expect(cards[1].title).toBe('Sat Oct 3');
	});
});

describe('#401 notes in get_trip', () => {
	const p = {
		name: 'Tokyo',
		location: 'Tokyo',
		country_code: 'JP',
		start_date: '2027-11-18',
		end_date: '2027-11-22',
		notes: 'Rail pass starts here.'
	};
	it('get_trip shows phase notes line', () => {
		expect(phaseCard(p).lines).toContain('Rail pass starts here.');
	});
	it('omits the notes line when empty', () => {
		expect(phaseCard({ ...p, notes: '' }).lines).not.toContain('');
	});
	it('trip notes card only when non-empty', () => {
		expect(tripNotesCard('JR passes ordered.')).toEqual({
			emoji: '📝',
			title: 'Trip notes',
			lines: ['JR passes ordered.']
		});
		expect(tripNotesCard('')).toBeNull();
	});
});
