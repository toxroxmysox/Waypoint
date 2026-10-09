import { describe, expect, it } from 'vitest';
import {
	cardAccessibleName,
	cardMeta,
	fitStrip,
	freeTimeGaps,
	freeTimeLabel,
	goingBubbles,
	overlapPairs,
	railSegments,
	spokenTime,
	stripCode,
	stripEntries,
	type CardItemFields,
	type OverlapInfo
} from './card-anatomy';

const mk = (o: Partial<CardItemFields> & { id: string }): CardItemFields => ({ title: o.id, type: 'activity', ...o });
const t = (hhmm: string) => `2026-10-01 ${hhmm}:00.000Z`;

describe('railSegments', () => {
	it('drops both segments on a minimum-height timed card (<6px)', () => {
		expect(railSegments(62, 'range')).toEqual({ top: null, bottom: null });
	});
	it('keeps both once the card is tall enough', () => {
		const s = railSegments(100, 'range');
		expect(s.top).toEqual({ top: 20, length: 14 });
		expect(s.bottom).toEqual({ top: 66, length: 14 });
	});
	it('drops a segment of 5px, keeps 6px', () => {
		expect(railSegments(82, 'range').top).toBeNull();
		expect(railSegments(84, 'range').top?.length).toBe(6);
	});
	it('start-only has only a top segment, end-only only a bottom, untimed none', () => {
		expect(railSegments(100, 'start-only').bottom).toBeNull();
		expect(railSegments(100, 'start-only').top).not.toBeNull();
		expect(railSegments(100, 'end-only').top).toBeNull();
		expect(railSegments(100, 'end-only').bottom).not.toBeNull();
		expect(railSegments(100, 'untimed')).toEqual({ top: null, bottom: null });
	});
});

describe('fitStrip', () => {
	const e = [
		{ key: 'a', full: 80, icon: 14 },
		{ key: 'b', full: 70, icon: 14 },
		{ key: 'c', full: 50, icon: 14 }
	];
	it('keeps everything when it fits', () => {
		expect(fitStrip(e, 300)).toEqual({ a: 'full', b: 'full', c: 'full' });
	});
	it('shrinks the lowest priority to its icon first', () => {
		expect(fitStrip(e, 190)).toEqual({ a: 'full', b: 'full', c: 'icon' });
	});
	it('then drops it before touching the next', () => {
		expect(fitStrip(e, 160)).toEqual({ a: 'full', b: 'full', c: 'dropped' });
	});
	it('then shrinks the next lowest', () => {
		expect(fitStrip(e, 110)).toEqual({ a: 'full', b: 'icon', c: 'dropped' });
	});
});

describe('cardMeta', () => {
	it("uses location, a flight route, a note's first line", () => {
		expect(cardMeta({ type: 'meal', location_name: 'The Immigrant' })).toBe('The Immigrant');
		expect(cardMeta({ type: 'flight', location_name: 'Milwaukee (MKE)', description: '→ Denver (DEN)' })).toBe('MKE → DEN');
		expect(cardMeta({ type: 'note', location_name: 'x', description: '\nBring cash\nmore' })).toBe('Bring cash');
		expect(cardMeta({ type: 'activity' })).toBe('');
	});
});

describe('goingBubbles', () => {
	it('shows going then struck not-going, max 3, then +n', () => {
		const r = goingBubbles({ assigned_to: ['a', 'b'], not_going: ['c', 'd'] });
		expect(r.shown.map((b) => [b.memberId, b.notGoing])).toEqual([
			['a', false],
			['b', false],
			['c', true]
		]);
		expect(r.extra).toBe(1);
	});
	it('shows nobody for no answers', () => {
		expect(goingBubbles({})).toEqual({ shown: [], extra: 0 });
	});
});

describe('overlapPairs', () => {
	const tee = mk({ id: 'tee', title: 'Tee time', start_time: t('10:00'), end_time: t('14:00'), assigned_to: ['k'] });
	const lunch = mk({ id: 'lunch', title: 'Lunch', start_time: t('12:00'), end_time: t('13:00'), assigned_to: ['k', 'j'] });
	it('both items carry it, red when people are shared', () => {
		const m = overlapPairs([lunch, tee]);
		expect(m.get('tee')).toMatchObject({ partnerTitle: 'Lunch', shared: true, role: 'earlier' });
		expect(m.get('lunch')).toMatchObject({ partnerTitle: 'Tee time', shared: true, role: 'later' });
	});
	it('is not shared when nobody is going or people differ', () => {
		const a = mk({ id: 'a', start_time: t('10:00'), end_time: t('12:00') });
		const b = mk({ id: 'b', start_time: t('11:00'), end_time: t('13:00') });
		expect(overlapPairs([a, b]).get('a')?.shared).toBe(false);
		expect(overlapPairs([{ ...a, assigned_to: ['x'] }, { ...b, assigned_to: ['y'] }]).get('a')?.shared).toBe(false);
	});
	it('touching ranges do not overlap; start-only never does', () => {
		const a = mk({ id: 'a', start_time: t('10:00'), end_time: t('12:00') });
		const b = mk({ id: 'b', start_time: t('12:00'), end_time: t('13:00') });
		const c = mk({ id: 'c', start_time: t('11:00') });
		expect(overlapPairs([a, b, c]).size).toBe(0);
	});
});

describe('freeTimeGaps', () => {
	it('labels a >=60min gap between a known end and the next start', () => {
		const a = mk({ id: 'a', start_time: t('15:00'), end_time: t('16:30') });
		const b = mk({ id: 'b', start_time: t('18:30'), end_time: t('20:00') });
		expect(freeTimeLabel(freeTimeGaps([a, b]).get('b')!)).toBe('2h free · 4:30p to 6:30p');
	});
	it('counts a deadline as a known end; ignores < 60 min', () => {
		const d = mk({ id: 'd', end_time: t('16:00') });
		const b = mk({ id: 'b', start_time: t('17:00') });
		expect(freeTimeGaps([d, b]).get('b')?.minutes).toBe(60);
		const c = mk({ id: 'c', start_time: t('16:59') });
		expect(freeTimeGaps([d, c]).size).toBe(0);
	});
	it('a start-only item opens no gap', () => {
		const a = mk({ id: 'a', start_time: t('09:00') });
		const b = mk({ id: 'b', start_time: t('15:00') });
		expect(freeTimeGaps([a, b]).size).toBe(0);
	});
});

describe('accessible name', () => {
	const dinner = mk({ id: 'd', title: 'Dinner at The Immigrant', type: 'meal', start_time: t('18:30'), end_time: t('20:30') });
	it('time + title + type + state', () => {
		expect(cardAccessibleName({ item: dinner, needsBooking: true, booked: false })).toBe(
			'6:30 to 8:30 PM, Dinner at The Immigrant, meal, needs booking'
		);
	});
	it('spoken time forms', () => {
		expect(spokenTime({ start_time: t('11:30'), end_time: t('13:00') })).toBe('11:30 AM to 1:00 PM');
		expect(spokenTime({ start_time: t('09:30') })).toBe('9:30 AM');
		expect(spokenTime({ end_time: t('16:30') })).toBe('by 4:30 PM');
		expect(spokenTime({})).toBe('');
	});
	it('carries overlap and booked', () => {
		expect(
			cardAccessibleName({ item: mk({ id: 'x', title: 'Hike' }), needsBooking: false, booked: true, overlapWith: 'Lunch' })
		).toBe('Hike, activity, overlaps Lunch, booked');
	});
});

describe('stripCode (#429: the Trip Mode ✓ {code} chip)', () => {
	it('null without a usable code', () => {
		expect(stripCode([])).toBeNull();
		expect(stripCode(undefined)).toBeNull();
		expect(stripCode([{ label: 'PIN', value: '   ' }])).toBeNull();
	});
	it('one code: the code itself', () => {
		const c = stripCode([{ label: 'Confirmation', value: ' IMM-48213 ' }])!;
		expect(c.value).toBe('IMM-48213');
		expect(c.text).toBe('IMM-48213');
		expect(c.extra).toBe(0);
		expect(c.label).toBe('Copy confirmation code IMM-48213');
	});
	it('several: the first code plus +n, and the label says how many more', () => {
		const c = stripCode([
			{ label: 'Confirmation', value: 'IMM-48213' },
			{ label: '', value: '   ' },
			{ label: 'Door PIN', value: '7731' },
			{ label: 'Gate', value: 'B12' }
		])!;
		expect(c.value).toBe('IMM-48213');
		expect(c.text).toBe('IMM-48213 +2');
		expect(c.extra).toBe(2);
		expect(c.label).toBe('Copy confirmation code IMM-48213, 2 more codes on the item');
	});
	it('singular wording for exactly one more', () => {
		expect(stripCode([{ label: '', value: 'A1' }, { label: '', value: 'B2' }])!.label).toBe(
			'Copy confirmation code A1, 1 more code on the item'
		);
	});
});

describe('stripEntries (#429)', () => {
	const pair: OverlapInfo = { partnerId: 'p', partnerTitle: 'Lunch', shared: true, role: 'later' };
	const base = { overlap: pair, needsBooking: false, booked: true, codes: [{ label: '', value: 'ABC123' }], docCount: 2 };
	const kinds = (e: { kind: string }[]) => e.map((x) => x.kind);

	it('Planning Mode: overlap first, then booked, then documents; never a code chip', () => {
		expect(kinds(stripEntries({ ...base, mode: 'planning' }))).toEqual(['overlap', 'booked', 'docs']);
	});
	it('Trip Mode shows no overlap at all, even when a pair is passed', () => {
		const e = stripEntries({ ...base, mode: 'trip' });
		expect(kinds(e)).not.toContain('overlap');
		expect(e.some((x) => x.tone === 'red')).toBe(false);
	});
	it('Trip Mode: a booked item with a code gets the chip in the booked slot', () => {
		const e = stripEntries({ ...base, mode: 'trip' });
		expect(kinds(e)).toEqual(['code', 'docs']);
		expect(e[0].copy).toBe('ABC123');
		expect(e[0].text).toBe('ABC123');
	});
	it('Trip Mode: booked without a code keeps ✓ Booked', () => {
		const e = stripEntries({ ...base, mode: 'trip', codes: [] });
		expect(kinds(e)).toEqual(['booked', 'docs']);
		expect(e[0].text).toBe('Booked');
	});
	it('Trip Mode: a stray code on an unbooked item shows Needs booking, not a chip', () => {
		const e = stripEntries({ ...base, mode: 'trip', booked: false, needsBooking: true });
		expect(kinds(e)).toEqual(['needs-booking', 'docs']);
	});
});
