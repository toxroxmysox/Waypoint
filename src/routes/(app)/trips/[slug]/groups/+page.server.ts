import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember, MoneyUnitRecord } from '$lib/types';

// #332 / ADR-0015 — the Money Units ("Groups") home. A money unit is a self-declared,
// shared, trip-scoped pool of members who share a card; settle-up nets across the unit,
// splits are never affected. The unit-collapse math + labels live in `money-units.ts` and
// render on the Expenses settle-up sheet — this route owns discovery + lifecycle
// (create / edit / leave / delete). `money_units.pb.js` gates edit/delete to owner/co-owner
// OR an existing member; leaving is just an update that drops yourself.

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const [members, moneyUnits] = await Promise.all([
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			sort: 'id',
			expand: 'user'
		}),
		// Tolerate the collection being absent (pre-0050 PB) so the page never 500s.
		locals.pb
			.collection('money_units')
			.getFullList<MoneyUnitRecord>({ filter: `trip = "${trip.id}"`, sort: 'created' })
			.catch(() => [] as MoneyUnitRecord[])
	]);

	return { trip, membership, members, moneyUnits };
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}

export const actions: Actions = {
	// Create (no unit_id) OR edit (unit_id) a money unit. `members` = comma-joined
	// trip_members.id; `budget_usd` = optional absolute override (blank = even-share
	// default). A unit needs ≥2 members (a lone member is a unit of one by default);
	// editing down to <2 dissolves it.
	saveMoneyUnit: async ({ request, locals, params }) => {
		const fd = await request.formData();
		const unitId = fd.get('unit_id')?.toString() || '';
		const memberIds = (fd.get('members')?.toString() || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		const budgetRaw = fd.get('budget_usd')?.toString().trim() || '';

		if (memberIds.length < 2) {
			return fail(400, {
				saveMoneyUnit: { error: 'Pick at least two people — a group needs more than one.' }
			});
		}
		let budgetUsd: number | null = null;
		if (budgetRaw) {
			const n = parseFloat(budgetRaw);
			if (Number.isNaN(n) || n < 0) {
				return fail(400, { saveMoneyUnit: { error: 'Budget must be a positive number.' } });
			}
			budgetUsd = n;
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem(
					`trip = "${trip.id}" && user = "${locals.pb.authStore.record?.id}" && removed_at = ""`
				);

			if (unitId) {
				await locals.pb.collection('money_units').update(unitId, {
					members: memberIds,
					budget_usd: budgetUsd
				});
			} else {
				await locals.pb.collection('money_units').create({
					trip: trip.id,
					created_by: membership.id,
					members: memberIds,
					budget_usd: budgetUsd
				});
			}
			return { saveMoneyUnit: { success: true } };
		} catch (err: unknown) {
			return fail(400, { saveMoneyUnit: { error: extractErrorMessage(err) || 'Failed to save group.' } });
		}
	},

	// Leave: drop just yourself from the unit. If ≥2 remain, update; if it would drop
	// below 2, dissolve the unit (a unit of one is not a shared card). ADR-0015's
	// consent valve — never touches other members' grouping beyond dissolving a husk.
	leaveMoneyUnit: async ({ request, locals }) => {
		const fd = await request.formData();
		const unitId = fd.get('unit_id')?.toString();
		if (!unitId) return fail(400, { leaveMoneyUnit: { error: 'Missing group id.' } });

		try {
			const me = locals.pb.authStore.record?.id;
			const unit = await locals.pb.collection('money_units').getOne<MoneyUnitRecord>(unitId);
			const myMembership = await locals.pb
				.collection('trip_members')
				.getFirstListItem(`trip = "${unit.trip}" && user = "${me}" && removed_at = ""`);

			const remaining = unit.members.filter((id) => id !== myMembership.id);
			if (remaining.length >= 2) {
				await locals.pb.collection('money_units').update(unitId, { members: remaining });
			} else {
				await locals.pb.collection('money_units').delete(unitId);
			}
			return { leaveMoneyUnit: { success: true } };
		} catch (err: unknown) {
			return fail(400, { leaveMoneyUnit: { error: extractErrorMessage(err) || 'Failed to leave group.' } });
		}
	},

	deleteMoneyUnit: async ({ request, locals }) => {
		const fd = await request.formData();
		const unitId = fd.get('unit_id')?.toString();
		if (!unitId) return fail(400, { deleteMoneyUnit: { error: 'Missing group id.' } });

		try {
			await locals.pb.collection('money_units').delete(unitId);
			return { deleteMoneyUnit: { success: true } };
		} catch (err: unknown) {
			return fail(400, { deleteMoneyUnit: { error: extractErrorMessage(err) || 'Failed to delete group.' } });
		}
	}
};
