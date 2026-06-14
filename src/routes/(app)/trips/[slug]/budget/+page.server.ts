import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripBudget, Expense, BudgetCategory, ExpenseCategory, Item } from '$lib/types';
import { plannedByCategory } from '$lib/money/planned-by-category';

const DEFAULT_CATEGORIES: BudgetCategory[] = [
	{ category: 'lodging', mode: 'total', daily_amount: null, total: 0 },
	{ category: 'transportation', mode: 'total', daily_amount: null, total: 0 },
	{ category: 'food', mode: 'per_day', daily_amount: 0, total: 0 },
	{ category: 'activity', mode: 'total', daily_amount: null, total: 0 },
	{ category: 'other', mode: 'total', daily_amount: null, total: 0 }
];

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	let budget: TripBudget | null = null;
	try {
		budget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
	} catch {
		// No budget yet — use defaults
	}

	// Expenses = money already spent; items carry the plan's forward-looking
	// estimate (cost_estimate_usd). #198: the budget must compare planned vs budget
	// vs spent, so we ride one field-limited items fetch (mirrors the Overview
	// query) alongside the expenses fetch — no N+1, no extra round-trips.
	const [expenses, items] = await Promise.all([
		locals.pb.collection('expenses').getFullList<Expense>({
			filter: `trip = "${trip.id}"`,
			sort: '-date,-id'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,type,cost_estimate_usd'
		})
	]);

	const isOwner = membership.role === 'owner' || membership.role === 'co_owner';

	// Compute trip days — PB dates may be 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS.sssZ'
	const startStr = trip.start_date.split(/[T ]/)[0];
	const endStr = trip.end_date.split(/[T ]/)[0];
	const start = new Date(startStr + 'T00:00:00');
	const end = new Date(endStr + 'T00:00:00');
	const tripDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);

	// Sum expenses by category
	const spentByCategory: Record<string, number> = {};
	for (const exp of expenses) {
		const cat = exp.category || 'other';
		spentByCategory[cat] = (spentByCategory[cat] ?? 0) + exp.amount_usd;
	}

	// Sum the plan's estimate into the SAME budget categories (#198).
	const plannedByCat = plannedByCategory(items);

	return {
		trip,
		membership,
		budget,
		defaultCategories: DEFAULT_CATEGORIES,
		tripDays,
		spentByCategory,
		plannedByCategory: plannedByCat,
		isOwner,
		memberCount: 0 // loaded client-side from parent if needed
	};
};

export const actions: Actions = {
	saveBudget: async ({ request, locals, params }) => {
		const fd = await request.formData();
		const categoriesRaw = fd.get('categories')?.toString() || '[]';

		let categories: BudgetCategory[];
		try {
			categories = JSON.parse(categoriesRaw);
		} catch {
			return fail(400, { saveBudget: { error: 'Invalid budget data.' } });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			// Try to find existing budget
			let existing: TripBudget | null = null;
			try {
				existing = await locals.pb
					.collection('trip_budgets')
					.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
			} catch {
				// No existing budget
			}

			if (existing) {
				await locals.pb.collection('trip_budgets').update(existing.id, {
					categories
				});
			} else {
				await locals.pb.collection('trip_budgets').create({
					trip: trip.id,
					categories
				});
			}

			return { saveBudget: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to save budget.';
			return fail(400, { saveBudget: { error: message } });
		}
	}
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
