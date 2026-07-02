import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Expense, Settlement, TripMember, Item, TripBudget, MoneyUnitRecord } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { trip, membership } = await parent();

	// #128 — optional ?item=<id> deep-link from item detail. Filtering itself
	// happens client-side over the full list; here we just resolve the title for
	// the filter banner (and null it out if the id isn't a real item this trip).
	const filterItemId = url.searchParams.get('item') ?? '';

	const [expenses, settlements, members, items, moneyUnits] = await Promise.all([
		locals.pb.collection('expenses').getFullList<Expense>({
			filter: `trip = "${trip.id}"`,
			sort: '-date,-id',
			expand: 'paid_by'
		}),
		locals.pb.collection('settlements').getFullList<Settlement>({
			filter: `trip = "${trip.id}"`,
			sort: '-date,-id'
		}),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			sort: 'id',
			expand: 'user'
		}),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: '-id'
		}),
		// #230 — Money Units for the unit-collapsed settle-up (ADR-0015). Tolerate the
		// collection being absent (pre-0050 PB) so the page never 500s on a stale schema.
		locals.pb
			.collection('money_units')
			.getFullList<MoneyUnitRecord>({ filter: `trip = "${trip.id}"`, sort: 'created' })
			.catch(() => [] as MoneyUnitRecord[])
	]);

	let budget: TripBudget | null = null;
	try {
		budget = await locals.pb
			.collection('trip_budgets')
			.getFirstListItem<TripBudget>(`trip = "${trip.id}"`);
	} catch {
		// No budget yet
	}

	const spentByCategory: Record<string, number> = {};
	for (const exp of expenses) {
		const cat = exp.category || 'other';
		spentByCategory[cat] = (spentByCategory[cat] ?? 0) + exp.amount_usd;
	}

	const filterItem = filterItemId ? items.find((i) => i.id === filterItemId) ?? null : null;

	return {
		trip,
		membership,
		expenses,
		settlements,
		members,
		items,
		budget,
		spentByCategory,
		moneyUnits,
		filterItemId: filterItem ? filterItemId : '',
		filterItemTitle: filterItem?.title ?? ''
	};
};

export const actions: Actions = {
	addExpense: async ({ request, locals, params }) => {
		const fd = await request.formData();

		const amount = parseFloat(fd.get('amount_usd')?.toString() || '0');
		const description = fd.get('description')?.toString().trim() || '';
		const date = fd.get('date')?.toString() || '';
		const category = fd.get('category')?.toString() || 'other';
		const paidBy = fd.get('paid_by')?.toString() || '';
		const splitMode = fd.get('split_mode')?.toString() || 'equal';
		const splitDataRaw = fd.get('split_data')?.toString() || '';
		const linkedItem = fd.get('linked_item')?.toString() || '';

		if (!amount || amount <= 0) return fail(400, { addExpense: { error: 'Amount is required.' } });
		if (!description) return fail(400, { addExpense: { error: 'Description is required.' } });
		if (!date) return fail(400, { addExpense: { error: 'Date is required.' } });
		if (!paidBy) return fail(400, { addExpense: { error: 'Paid by is required.' } });

		let splitData: unknown;
		try {
			splitData = JSON.parse(splitDataRaw);
		} catch {
			return fail(400, { addExpense: { error: 'Invalid split data.' } });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem(`trip = "${trip.id}" && user = "${locals.pb.authStore.record?.id}" && removed_at = ""`);

			await locals.pb.collection('expenses').create({
				trip: trip.id,
				created_by: membership.id,
				paid_by: paidBy,
				amount_usd: amount,
				description,
				date,
				category,
				linked_item: linkedItem || null,
				split_mode: splitMode,
				split_data: splitData
			});

			return { addExpense: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to add expense.';
			return fail(400, { addExpense: { error: message } });
		}
	},

	recordSettlement: async ({ request, locals, params }) => {
		const fd = await request.formData();
		const fromMember = fd.get('from_member')?.toString() || '';
		const toMember = fd.get('to_member')?.toString() || '';
		const amount = parseFloat(fd.get('amount_usd')?.toString() || '0');
		const note = fd.get('note')?.toString().trim() || '';

		if (!fromMember || !toMember) return fail(400, { recordSettlement: { error: 'Both parties are required.' } });
		if (!amount || amount <= 0) return fail(400, { recordSettlement: { error: 'Amount must be positive.' } });

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem(`trip = "${trip.id}" && user = "${locals.pb.authStore.record?.id}" && removed_at = ""`);

			await locals.pb.collection('settlements').create({
				trip: trip.id,
				created_by: membership.id,
				from_member: fromMember,
				to_member: toMember,
				amount_usd: amount,
				date: new Date().toISOString().split('T')[0],
				note
			});

			return { recordSettlement: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to record settlement.';
			return fail(400, { recordSettlement: { error: message } });
		}
	},

	updateExpense: async ({ request, locals }) => {
		const fd = await request.formData();
		const expenseId = fd.get('expense_id')?.toString();
		if (!expenseId) return fail(400, { updateExpense: { error: 'Missing expense id.' } });

		const amount = parseFloat(fd.get('amount_usd')?.toString() || '0');
		const description = fd.get('description')?.toString().trim() || '';
		const date = fd.get('date')?.toString() || '';
		const category = fd.get('category')?.toString() || 'other';
		const paidBy = fd.get('paid_by')?.toString() || '';
		const splitMode = fd.get('split_mode')?.toString() || 'equal';
		const splitDataRaw = fd.get('split_data')?.toString() || '';

		if (!amount || amount <= 0) return fail(400, { updateExpense: { error: 'Amount is required.' } });
		if (!description) return fail(400, { updateExpense: { error: 'Description is required.' } });
		if (!date) return fail(400, { updateExpense: { error: 'Date is required.' } });
		if (!paidBy) return fail(400, { updateExpense: { error: 'Paid by is required.' } });

		let splitData: unknown;
		try {
			splitData = JSON.parse(splitDataRaw);
		} catch {
			return fail(400, { updateExpense: { error: 'Invalid split data.' } });
		}

		try {
			await locals.pb.collection('expenses').update(expenseId, {
				paid_by: paidBy,
				amount_usd: amount,
				description,
				date,
				category,
				split_mode: splitMode,
				split_data: splitData
			});

			return { updateExpense: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to update expense.';
			return fail(400, { updateExpense: { error: message } });
		}
	},

	deleteExpense: async ({ request, locals }) => {
		const fd = await request.formData();
		const expenseId = fd.get('expense_id')?.toString();
		if (!expenseId) return fail(400, { deleteExpense: { error: 'Missing expense id.' } });

		try {
			await locals.pb.collection('expenses').delete(expenseId);
			return { deleteExpense: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to delete expense.';
			return fail(400, { deleteExpense: { error: message } });
		}
	}
	// Money Unit actions (saveMoneyUnit / leaveMoneyUnit / deleteMoneyUnit) live on the
	// Groups route now (#332) — /trips/[slug]/groups. The Expenses page still LOADS
	// `moneyUnits` for the settle-up collapse, but no longer manages them.
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
