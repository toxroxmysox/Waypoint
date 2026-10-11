import { z } from 'zod';
import type { Expense, ExpenseCategory, Item, MoneyUnitRecord, Settlement, TripBudget } from '$lib/types';
import { computeBalances } from '$lib/money/debt-simplify';
import { groupBudgetTotal, myShareOfExpenses, remainingPlannedTotal } from '$lib/money/money-glance';
import { unitDebts } from '$lib/money/money-units';
import { daysBetween } from '$lib/shell/trip-time';
import { resolveTrip } from '../context';
import { offTrip, result, type Card } from '../present';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

const usd = (n: number) => `$${Math.abs(n).toFixed(2).replace(/\.00$/, '')}`;

export const getMoney: ToolDef = {
	name: 'get_money',
	title: 'Trip money',
	description:
		"A trip's money as Waypoint computes it: total spent against the budget, spend by category, each member's balance, " +
		'who owes whom to settle up (money units respected), what planned-but-unbooked items are still estimated to cost, ' +
		"and the user's own share.",
	inputSchema: { trip: z.string().describe('Trip slug, or part of its title') },
	async run(ctx, { trip: ref }: { trip: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const pb = ctx.pb;
		const byTrip = pb.filter('trip = {:t}', { t: t.trip.id });
		const [expenses, settlements, members, items, units, budget] = await Promise.all([
			pb.collection('expenses').getFullList<Expense>({
				filter: byTrip,
				fields: 'id,trip,paid_by,amount_usd,description,date,category,linked_item,split_mode,split_data',
				requestKey: null
			}),
			pb.collection('settlements').getFullList<Settlement>({
				filter: byTrip,
				fields: 'id,trip,from_member,to_member,amount_usd,date',
				requestKey: null
			}),
			loadMembers(ctx, t.trip.id),
			pb.collection('items').getFullList<Item>({ filter: byTrip, fields: 'id,booked,cost_estimate_usd,type', requestKey: null }),
			pb
				.collection('money_units')
				.getFullList<MoneyUnitRecord>({ filter: byTrip, fields: 'id,members,budget_usd', requestKey: null })
				.catch(() => [] as MoneyUnitRecord[]),
			pb
				.collection('trip_budgets')
				.getFirstListItem<TripBudget>(byTrip, { fields: 'id,trip,categories', requestKey: null })
				.catch(() => null)
		]);

		const name = new Map(members.map((m) => [m.id, memberName(m)]));
		const unitName = (key: string) => {
			const u = units.find((x) => x.id === key);
			return u ? u.members.map((m) => name.get(m) ?? 'member').join(' & ') : (name.get(key) ?? 'former member');
		};

		const spent = expenses.reduce((s, e) => s + e.amount_usd, 0);
		const tripDays = t.trip.start_date ? daysBetween(t.trip.start_date.slice(0, 10), t.trip.end_date.slice(0, 10)) + 1 : 1;
		const budgetTotal = groupBudgetTotal(budget, Math.max(1, tripDays));
		const cards: Card[] = [
			{
				emoji: '💰',
				title: budgetTotal != null ? `Spent ${usd(spent)} of ${usd(budgetTotal)}` : `Spent ${usd(spent)}`,
				lines: [budgetTotal != null ? `${usd(budgetTotal - spent)} ${budgetTotal - spent >= 0 ? 'left' : 'over budget'}` : 'No budget set']
			}
		];

		const byCat = new Map<ExpenseCategory, number>();
		for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount_usd);
		if (byCat.size) {
			cards.push({ emoji: '📊', title: 'By category', lines: [...byCat].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${usd(n)}`) });
		}

		const balances = computeBalances(expenses, settlements);
		const balanceLines = members.map((m) => {
			const b = balances.get(m.id) ?? 0;
			return `${memberName(m)}: ${Math.abs(b) < 0.005 ? 'settled' : b > 0 ? `is owed ${usd(b)}` : `owes ${usd(b)}`}`;
		});
		if (expenses.length || settlements.length) cards.push({ emoji: '⚖️', title: 'Balances', lines: balanceLines });

		const edges = unitDebts(
			expenses,
			settlements,
			units.map((u) => ({ id: u.id, members: u.members, budget_usd: u.budget_usd })),
			members.map((m) => m.id)
		);
		cards.push({
			emoji: '🔁',
			title: 'Settle up',
			lines: edges.length ? edges.map((e) => `${unitName(e.fromUnit)} owes ${unitName(e.toUnit)} ${usd(e.amount)}`) : ['Everyone is settled']
		});

		const linked = new Set(expenses.map((e) => e.linked_item).filter(Boolean) as string[]);
		const planned = remainingPlannedTotal(items, linked);
		if (planned > 0) cards.push({ emoji: '🗓️', title: 'Still planned', lines: [`${usd(planned)} in estimates for items not booked yet`] });

		cards.push({ emoji: '🙋', title: 'Your share', lines: [`${usd(myShareOfExpenses(expenses, t.memberId))} of logged expenses`] });
		return result(`Money · ${t.trip.title}`, cards);
	}
};
