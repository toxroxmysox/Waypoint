import type { PageServerLoad } from './$types';
import type { Expense, Settlement, TripMember, Item, TripBudget } from '$lib/types';
import { tripToday, tripTz } from '$lib/shell/trip-time';
import { computeBalances } from '$lib/money/debt-simplify';
import { moneyGlance } from '$lib/money/money-glance';

// Trip-Mode Money summary (#227) — a read-only, per-person glance answering "how much
// do I have left to spend?". Reuses the pure `money-glance` module; this loader is just
// the I/O glue (expenses + budget + roster + remaining-planned items in, figures out).
// Read-only: every figure deep-links to the planning Money pages (/budget, /expenses)
// to settle or edit. The Money *tab* is blocked by #166's nav merge; this route is
// reachable directly and renders Trip-Mode (clay) chrome via resolveChromeMode.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const [expenses, settlements, members, items] = await Promise.all([
		locals.pb.collection('expenses').getFullList<Expense>({
			filter: `trip = "${trip.id}"`,
			sort: '-date,-id'
		}),
		locals.pb.collection('settlements').getFullList<Settlement>({
			filter: `trip = "${trip.id}"`,
			sort: '-date,-id'
		}),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			fields: 'id'
		}),
		// Remaining-planned items (N2) need only booked + estimate + a few display fields
		// for the drill-down list; linkage to an expense is read from expenses.linked_item.
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,title,type,subtype,booked,cost_estimate_usd',
			sort: '-cost_estimate_usd'
		})
	]);

	let budget: TripBudget | null = null;
	try {
		budget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
	} catch {
		// No budget yet — the glance shows my share and omits "left" (PRD A3).
	}

	// Trip-local "today" + trip length. NEVER machine-tz: tripTz validates the stored
	// zone (a bare city name would 500 every consumer via Intl) and falls back to UTC.
	const tz = tripTz(trip);
	const today = tripToday(tz);
	const startStr = trip.start_date.split(/[T ]/)[0];
	const endStr = trip.end_date.split(/[T ]/)[0];
	const start = new Date(startStr + 'T00:00:00Z');
	const end = new Date(endStr + 'T00:00:00Z');
	const tripDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

	const glance = moneyGlance(expenses, budget, items, {
		meId: membership.id,
		memberCount: members.length,
		tripEnd: trip.end_date,
		today,
		tripDays
	});

	// Optional "you owe / are owed" bridge (#227 — nearly free, sharpens the
	// reconciliation story). computeBalances net: > 0 you're owed, < 0 you owe.
	const myBalance = computeBalances(expenses, settlements).get(membership.id) ?? 0;

	// The items behind N2, for the drill-down list: still planned (unbooked) AND not
	// yet captured as an expense. Mirrors money-glance's remaining-planned predicate.
	const linkedItemIds = new Set(expenses.map((e) => e.linked_item).filter(Boolean) as string[]);
	const remainingPlannedItems = items
		.filter((i) => !i.booked && !linkedItemIds.has(i.id) && (i.cost_estimate_usd ?? 0) > 0)
		.map((i) => ({
			id: i.id,
			title: i.title,
			type: i.type,
			subtype: i.subtype,
			cost_estimate_usd: i.cost_estimate_usd
		}));

	return {
		trip,
		glance,
		myBalance,
		memberCount: members.length,
		remainingPlannedItems,
		hasExpenses: expenses.length > 0
	};
};
