import { describe, it, expect } from 'vitest';
import { itemTypeLine, itemTimeText, detailsRows, addLine, newestFirst, hostLabel, goingView, bookingControls, parseMarkBooked, markBookedDestination } from './item-page';

describe('goingView (#440): the Hero Going row', () => {
	const members = [
		{ id: 'm1', display_name: 'Ana', role: 'owner' },
		{ id: 'm2', display_name: 'Ben', role: 'traveler' },
		{ id: 'm3', display_name: 'Cy', role: 'viewer' }
	] as any[];
	const base = { members, myMemberId: 'm1', role: 'owner' as const };
	it('unanswered: asks "Are you going?"', () => {
		const v = goingView({ ...base, item: { assigned_to: [], not_going: [] } });
		expect(v.mine).toBe('no_answer');
		expect(v.line).toBe('Are you going?');
		expect(v.canAnswer).toBe(true);
	});
	it('answered going', () => {
		const v = goingView({ ...base, item: { assigned_to: ['m1'], not_going: [] } });
		expect(v.mine).toBe('going');
		expect(v.line).toBe("You're going");
	});
	it('answered not going', () => {
		const v = goingView({ ...base, item: { assigned_to: [], not_going: ['m1'] } });
		expect(v.mine).toBe('not_going');
		expect(v.line).toBe("You're not going");
	});
	it('people: going before struck not-going; no-answer members absent', () => {
		const v = goingView({ ...base, item: { assigned_to: ['m2'], not_going: ['m1'] } });
		expect(v.people.map((p) => [p.name, p.notGoing])).toEqual([
			['Ben', false],
			['Ana', true]
		]);
	});
	it('viewers get no controls and no prompt, but still see people', () => {
		const v = goingView({ ...base, myMemberId: 'm3', role: 'viewer', item: { assigned_to: ['m1'], not_going: [] } });
		expect(v.canAnswer).toBe(false);
		expect(v.line).toBe('');
		expect(v.people).toHaveLength(1);
	});
	it('no membership id: no controls', () => {
		expect(goingView({ ...base, myMemberId: '', item: {} }).canAnswer).toBe(false);
	});
	it('solo trip (one active member): no controls', () => {
		expect(goingView({ ...base, members: [members[0]], item: {} }).canAnswer).toBe(false);
	});
});

describe('itemTypeLine: type and subtype in words', () => {
	it('joins the type label and the subtype', () => {
		expect(itemTypeLine('meal', 'dinner')).toBe('Meal · Dinner');
		expect(itemTypeLine('lodging', 'airbnb')).toBe('Lodging · Airbnb');
	});
	it('type alone when there is no subtype, or it is "other"', () => {
		expect(itemTypeLine('flight', '')).toBe('Flight');
		expect(itemTypeLine('activity', undefined)).toBe('Activity');
		expect(itemTypeLine('activity', 'other')).toBe('Activity');
	});
});

describe('itemTimeText: the Hero time line', () => {
	it('date leads, then the text grammar', () => {
		expect(
			itemTimeText({ type: 'meal', start_time: '2026-10-01 18:30:00.000Z', end_time: '' }, '2026-10-01 00:00:00.000Z')
		).toBe('Thu Oct 1 · 6:30p');
	});
	it('multi-day: range and nights', () => {
		expect(itemTimeText({ type: 'lodging', end_date: '2026-10-03', start_time: '', end_time: '' }, '2026-10-01')).toBe(
			'Thu Oct 1–Sat Oct 3 · 2 nights'
		);
	});
	it('no day (an idea) and no clock: empty', () => {
		expect(itemTimeText({ type: 'meal', start_time: '', end_time: '' }, '')).toBe('');
	});
	it('never includes the place', () => {
		expect(
			itemTimeText({ type: 'meal', start_time: '', end_time: '', location_name: 'Cafe' } as never, '2026-10-01')
		).toBe('Thu Oct 1');
	});
});

const base = {
	item: { cost_estimate_usd: 0, reservation_url: '', free_cancellation: false },
	phaseName: '',
	paid: { isPaid: false, total: 0, count: 0 },
	canLogPayment: true,
	payHref: '/pay',
	expensesHref: '/exp'
};

describe('detailsRows', () => {
	it('is empty for a bare item a viewer sees', () => {
		expect(detailsRows({ ...base, canLogPayment: false })).toEqual([]);
	});
	it('Log payment is its own row even with NO estimate', () => {
		const rows = detailsRows(base);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ key: 'payment', value: 'Log payment', href: '/pay' });
	});
	it('Paid $X replaces Log payment, with the expenses link, independent of the estimate', () => {
		const rows = detailsRows({ ...base, paid: { isPaid: true, total: 85.5, count: 2 } });
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ key: 'payment', value: 'Paid $85.50', href: '/exp', hint: '2 expenses' });
		expect(detailsRows({ ...base, paid: { isPaid: true, total: 10, count: 1 } })[0].hint).toBe('1 expense');
	});
	it('paid shows even to a role that cannot log payment', () => {
		const rows = detailsRows({ ...base, canLogPayment: false, paid: { isPaid: true, total: 10, count: 1 } });
		expect(rows.map((r) => r.key)).toEqual(['payment']);
	});
	it('estimate, payment, booking, cancellation, phase in that order', () => {
		const rows = detailsRows({
			...base,
			item: { cost_estimate_usd: 240, reservation_url: 'https://www.opentable.com/r/x', free_cancellation: true },
			phaseName: 'Milwaukee'
		});
		expect(rows.map((r) => r.key)).toEqual(['cost', 'payment', 'booking', 'cancellation', 'phase']);
		expect(rows[0]).toMatchObject({ label: 'Estimate', value: '$240.00' });
		expect(rows[2]).toMatchObject({
			label: 'Booking',
			value: 'opentable.com',
			href: 'https://www.opentable.com/r/x',
			external: true
		});
		expect(rows[3]).toMatchObject({ label: 'Cancellation', value: 'Free cancellation' });
		expect(rows[4]).toMatchObject({ label: 'Phase', value: 'Milwaukee' });
	});
	it('a zero estimate has no row', () => {
		expect(detailsRows(base).some((r) => r.key === 'cost')).toBe(false);
	});
});

describe('hostLabel', () => {
	it('strips scheme and www; falls back to the raw string', () => {
		expect(hostLabel('https://www.opentable.com/r/x')).toBe('opentable.com');
		expect(hostLabel('not a url')).toBe('not a url');
	});
});

describe('addLine: the one-line add for empty sections', () => {
	const p = { docCount: 0, hasChecklist: false, canUpload: true, canEditChecklist: true, docsOpen: false };
	it('both empty: + Document and + Checklist', () => {
		expect(addLine(p)).toEqual(['document', 'checklist']);
	});
	it('documents present: only + Checklist', () => {
		expect(addLine({ ...p, docCount: 2 })).toEqual(['checklist']);
	});
	it('checklist present: only + Document', () => {
		expect(addLine({ ...p, hasChecklist: true })).toEqual(['document']);
	});
	it('docs opened by the tap: the line drops + Document', () => {
		expect(addLine({ ...p, docsOpen: true })).toEqual(['checklist']);
	});
	it('viewers get no line at all', () => {
		expect(addLine({ ...p, canUpload: false, canEditChecklist: false })).toEqual([]);
	});
	it('per-permission', () => {
		expect(addLine({ ...p, canUpload: false })).toEqual(['checklist']);
		expect(addLine({ ...p, canEditChecklist: false })).toEqual(['document']);
	});
});

describe('newestFirst', () => {
	const c = (id: string, created: string) => ({ id, created });
	it('sorts by created descending across PB and ISO formats', () => {
		const out = newestFirst([
			c('old', '2026-10-01 10:00:00.000Z'),
			c('opt', '2026-10-02T09:00:00.000Z'),
			c('mid', '2026-10-01 12:00:00.000Z')
		]);
		expect(out.map((x) => x.id)).toEqual(['opt', 'mid', 'old']);
	});
	it('does not mutate and is stable on ties', () => {
		const input = [c('a', '2026-10-01 10:00:00.000Z'), c('b', '2026-10-01 10:00:00.000Z')];
		expect(newestFirst(input).map((x) => x.id)).toEqual(['a', 'b']);
		expect(input.map((x) => x.id)).toEqual(['a', 'b']);
	});
});

describe('bookingControls (#441): Book / Mark booked', () => {
	const open = { status: 'planned', requires_booking: true, booked: false, reservation_url: 'https://opentable.com/x' } as any;
	it('shows for an editor on an item that needs booking, with the link', () => {
		expect(bookingControls({ item: open, canEdit: true })).toEqual({ show: true, bookHref: 'https://opentable.com/x' });
	});
	it('hidden for roles that cannot edit', () => {
		expect(bookingControls({ item: open, canEdit: false }).show).toBe(false);
	});
	it('hidden once booked or when booking is not required', () => {
		expect(bookingControls({ item: { ...open, booked: true }, canEdit: true }).show).toBe(false);
		expect(bookingControls({ item: { ...open, requires_booking: false }, canEdit: true }).show).toBe(false);
	});
	it('no link: Mark booked still shows, Book does not', () => {
		expect(bookingControls({ item: { ...open, reservation_url: '' }, canEdit: true })).toEqual({ show: true, bookHref: '' });
	});
	it('only http(s) links become Book', () => {
		expect(bookingControls({ item: { ...open, reservation_url: 'javascript:alert(1)' }, canEdit: true }).bookHref).toBe('');
	});
});

describe('parseMarkBooked (#441)', () => {
	it('trims the code; checkbox on = log payment', () => {
		const fd = new FormData();
		fd.set('code', '  ABC123 ');
		fd.set('log_payment', 'on');
		expect(parseMarkBooked(fd)).toEqual({ code: 'ABC123', logPayment: true });
	});
	it('defaults: no code, no payment', () => {
		expect(parseMarkBooked(new FormData())).toEqual({ code: '', logPayment: false });
	});
});

describe('markBookedDestination (#441)', () => {
	const item = { id: 'i1', title: 'Hotel', cost_estimate_usd: 240 };
	it('unticked: stay on the item page (null)', () => {
		expect(markBookedDestination('t', item, false)).toBeNull();
	});
	it('ticked: the existing Add expense, prefilled from the estimate', () => {
		const href = markBookedDestination('t', item, true)!;
		expect(href.startsWith('/trips/t/expenses?')).toBe(true);
		const sp = new URL(href, 'http://x').searchParams;
		expect(sp.get('action')).toBe('add');
		expect(sp.get('amount')).toBe('240');
		expect(sp.get('linked_item')).toBe('i1');
	});
	it('no estimate: amount left blank', () => {
		const sp = new URL(markBookedDestination('t', { id: 'i1', title: 'H' }, true)!, 'http://x').searchParams;
		expect(sp.has('amount')).toBe(false);
	});
});
