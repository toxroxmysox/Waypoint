import { describe, it, expect } from 'vitest';
import {
	composeReminders,
	remindersFor,
	hasReminders,
	daysBetween,
	type ReminderItem
} from './digest-reminders';
import { renderDigestEmail } from './digest-email';

const item = (o: Partial<ReminderItem>): ReminderItem => ({
	title: 'x',
	type: 'activity',
	dayDate: '',
	phaseStart: '',
	requiresBooking: false,
	booked: false,
	going: [],
	...o
});
const trip = { tripStart: '2026-11-06', tripEnd: '2026-11-20', archived: false };

describe('daysBetween', () => {
	it('counts calendar days, across months, NaN on blanks', () => {
		expect(daysBetween('2026-10-31', '2026-11-30')).toBe(30);
		expect(daysBetween('2026-11-23', '2026-11-20')).toBe(-3);
		expect(daysBetween('', '2026-11-20')).toBeNaN();
	});
});

describe('booking reminders (#522)', () => {
	const items = [
		item({ title: 'On day', dayDate: '2026-11-30', requiresBooking: true }),
		item({ title: 'Phase only', phaseStart: '2026-11-30', requiresBooking: true }),
		item({ title: 'Trip only', requiresBooking: true }),
		item({ title: 'Already booked', dayDate: '2026-11-30', requiresBooking: true, booked: true }),
		item({ title: 'No booking needed', dayDate: '2026-11-30' })
	];
	it('fires at exactly 60/30/14 days, using day → phase start → trip start', () => {
		const r30 = composeReminders({ ...trip, today: '2026-10-31', items });
		expect(r30.booking.map((b) => b.title)).toEqual(['On day', 'Phase only']);
		expect(r30.booking[0].daysOut).toBe(30);
		const r14 = composeReminders({ ...trip, today: '2026-10-23', items });
		expect(r14.booking.map((b) => b.title)).toEqual(['Trip only']);
		expect(composeReminders({ ...trip, today: '2026-10-30', items }).booking).toEqual([]);
	});
	it('never nags about a considered (abandoned) option (#537)', () => {
		const maybe = item({
			title: 'Maybe hotel',
			type: 'lodging',
			status: 'considered',
			dayDate: '2026-11-30',
			requiresBooking: true
		});
		expect(composeReminders({ ...trip, today: '2026-10-31', items: [maybe] }).booking).toEqual([]);
	});
	it('nothing on an archived trip', () => {
		expect(
			hasReminders(composeReminders({ ...trip, archived: true, today: '2026-10-31', items }))
		).toBe(false);
	});
});

describe('pre-trip brief + closeout (#522)', () => {
	const items = [
		item({ title: 'Ryokan', type: 'lodging', dayDate: '2026-11-07' }),
		// #537 — an abandoned option isn't a stay.
		item({ title: 'Maybe inn', type: 'lodging', status: 'considered', dayDate: '2026-11-08' }),
		item({ title: 'Flight', type: 'flight', dayDate: '2026-11-06' }),
		item({ title: 'Train', type: 'transportation', dayDate: '2026-11-09' }),
		item({ title: 'Kaiseki', dayDate: '2026-11-08', requiresBooking: true })
	];
	it('brief exactly 3 days before the trip starts', () => {
		const r = composeReminders({ ...trip, today: '2026-11-03', items });
		expect(r.brief?.stays.map((x) => x.title)).toEqual(['Ryokan']);
		expect(r.brief?.travel.map((x) => x.title)).toEqual(['Flight', 'Train']);
		expect(r.brief?.unbooked.map((x) => x.title)).toEqual(['Kaiseki']);
		expect(composeReminders({ ...trip, today: '2026-11-04', items }).brief).toBeNull();
	});
	it('brief lists only unbooked items during the trip, never one already in Still to book', () => {
		const r = composeReminders({
			...trip,
			today: '2026-11-03',
			items: [
				item({ title: 'In trip', dayDate: '2026-11-08', requiresBooking: true }),
				item({ title: 'After trip', dayDate: '2026-12-17', requiresBooking: true }),
				item({ title: 'Due now', dayDate: '2026-11-17', requiresBooking: true })
			]
		});
		expect(r.booking.map((b) => b.title)).toEqual(['Due now']);
		expect(r.brief?.unbooked.map((x) => x.title)).toEqual(['In trip']);
	});
	it('closeout exactly 3 days after the trip ends, not when dateless', () => {
		expect(composeReminders({ ...trip, today: '2026-11-23', items }).closeout).toBe(true);
		expect(composeReminders({ ...trip, today: '2026-11-24', items }).closeout).toBe(false);
		expect(
			composeReminders({ tripStart: '', tripEnd: '', archived: false, today: '2026-11-23', items })
				.closeout
		).toBe(false);
	});
});

describe('remindersFor (#522 recipients)', () => {
	const r = composeReminders({
		...trip,
		today: '2026-11-03',
		items: [
			item({ title: 'Mine', dayDate: '2026-12-03', requiresBooking: true, going: ['me'] }),
			item({ title: 'Theirs', dayDate: '2026-12-03', requiresBooking: true, going: ['them'] })
		]
	});
	it('planners get all booking reminders, travelers only theirs, viewers none', () => {
		expect(remindersFor(r, 'owner', 'x').booking).toHaveLength(2);
		expect(remindersFor(r, 'co_owner', 'x').booking).toHaveLength(2);
		expect(remindersFor(r, 'traveler', 'me').booking.map((b) => b.title)).toEqual(['Mine']);
		expect(remindersFor(r, 'viewer', 'me').booking).toEqual([]);
	});
	it('closeout to planners only; brief to everyone', () => {
		const end = composeReminders({ ...trip, today: '2026-11-23', items: [] });
		expect(remindersFor(end, 'owner', 'x').closeout).toBe(true);
		expect(remindersFor(end, 'traveler', 'x').closeout).toBe(false);
		expect(hasReminders(remindersFor(end, 'traveler', 'x'))).toBe(false);
		expect(remindersFor(r, 'viewer', 'x').brief).not.toBeNull();
	});
});

describe('renderDigestEmail with reminders (#522)', () => {
	const empty = { added: [], edited: [], moved: [], removed: [] };
	it('closeout-only email reads "Wrapping up" with the closeout + profile links', () => {
		const reminders = composeReminders({ ...trip, today: '2026-11-23', items: [] });
		const out = renderDigestEmail({
			recipientName: 'Abby',
			appUrl: 'https://app.example.com',
			sections: [{ tripTitle: 'Japan', tripSlug: 'japan', diff: empty, reminders }]
		});
		expect(out.subject).toBe('Wrapping up Japan');
		expect(out.text).toContain('Time to wrap up Japan.');
		expect(out.text).toContain(
			'Or for all your trips in your profile: https://app.example.com/account'
		);
		expect(out.html).toContain('href="https://app.example.com/account"');
		expect(out.text).toContain('https://app.example.com/trips/japan/closeout');
	});
	it('booking or brief reminders read "Coming up"', () => {
		const reminders = composeReminders({
			...trip,
			today: '2026-11-03',
			items: [item({ title: 'Ryokan', type: 'lodging', dayDate: '2026-11-07' })]
		});
		const out = renderDigestEmail({
			recipientName: 'Abby',
			appUrl: 'https://app.example.com',
			sections: [{ tripTitle: 'Japan', tripSlug: 'japan', diff: empty, reminders }]
		});
		expect(out.subject).toBe('Coming up on Japan');
	});
	it('no reminders → unchanged "What changed" email', () => {
		const out = renderDigestEmail({
			recipientName: '',
			appUrl: 'https://app.example.com',
			sections: [
				{ tripTitle: 'Japan', tripSlug: 'japan', diff: { ...empty, removed: [{ title: 'Bar' }] } }
			]
		});
		expect(out.subject).toBe('What changed on Japan');
		expect(out.text).not.toContain('Still to book');
	});
});
