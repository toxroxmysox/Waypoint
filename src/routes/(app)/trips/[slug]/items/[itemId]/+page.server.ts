import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ChecklistItem, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases, days } = await parent();

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	if (item.trip !== trip.id) {
		error(404, 'Item not found');
	}

	const [checklistItems, members] = await Promise.all([
		item.type === 'checklist'
			? locals.pb.collection('checklist_items').getFullList<ChecklistItem>({
					filter: `item = "${item.id}"`,
					sort: 'order'
				})
			: Promise.resolve([]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		})
	]);

	const day = item.day ? days.find((d) => d.id === item.day) ?? null : null;
	const phase = item.phase ? phases.find((p) => p.id === item.phase) ?? null : null;

	return { item, checklistItems, members, itemDay: day, itemPhase: phase };
};

async function getMembership(locals: App.Locals, tripId: string): Promise<TripMember> {
	return locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(`trip = "${tripId}" && user = "${locals.user!.id}"`);
}

export const actions: Actions = {
	delete: async ({ params, locals }) => {
		try {
			const item = await locals.pb.collection('items').getOne(params.itemId);
			const dayId = item['day'] as string;
			await locals.pb.collection('items').delete(params.itemId);

			if (dayId) {
				redirect(303, `/trips/${params.slug}/days/${dayId}`);
			}
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete item.';
			return fail(500, { error: message });
		}
	},

	addChecklistItem: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne(params.itemId);
		const formData = await request.formData();
		const text = formData.get('text')?.toString().trim();
		if (!text) return fail(400, { error: 'Text required.' });

		try {
			const existing = await locals.pb.collection('checklist_items').getFullList({
				filter: `item = "${item.id}"`,
				sort: '-order',
				fields: 'order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['order']) + 1 : 0;

			await locals.pb.collection('checklist_items').create({
				item: item.id,
				text,
				order: nextOrder
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add item.';
			return fail(500, { error: message });
		}
	},

	toggleChecklistItem: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne(params.itemId);
		const formData = await request.formData();
		const ciId = formData.get('ci_id')?.toString();
		if (!ciId) return fail(400, { error: 'Missing id.' });

		try {
			const ci = await locals.pb.collection('checklist_items').getOne(ciId);
			if (ci['item'] !== params.itemId) return fail(403, { error: 'Not authorized.' });
			const isChecked = !!ci['checked_by'];

			if (isChecked) {
				await locals.pb.collection('checklist_items').update(ciId, {
					checked_by: null,
					checked_at: null
				});
			} else {
				const member = await getMembership(locals, item['trip'] as string);
				await locals.pb.collection('checklist_items').update(ciId, {
					checked_by: member.id,
					checked_at: new Date().toISOString()
				});
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to toggle.';
			return fail(500, { error: message });
		}
	},

	deleteChecklistItem: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const ciId = formData.get('ci_id')?.toString();
		if (!ciId) return fail(400, { error: 'Missing id.' });

		try {
			const ci = await locals.pb.collection('checklist_items').getOne(ciId);
			if (ci['item'] !== params.itemId) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('checklist_items').delete(ciId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete.';
			return fail(500, { error: message });
		}
	},

	reorderChecklistItem: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne(params.itemId);
		const formData = await request.formData();
		const ciId = formData.get('ci_id')?.toString();
		const direction = formData.get('direction')?.toString();
		if (!ciId || !direction) return fail(400, { error: 'Missing params.' });

		try {
			const all = await locals.pb.collection('checklist_items').getFullList({
				filter: `item = "${item.id}"`,
				sort: 'order'
			});
			const idx = all.findIndex((c) => c.id === ciId);
			if (idx === -1) return fail(404, { error: 'Not found.' });

			const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
			if (swapIdx < 0 || swapIdx >= all.length) return { success: true };

			const a = Number(all[idx]['order']);
			const b = Number(all[swapIdx]['order']);
			await Promise.all([
				locals.pb.collection('checklist_items').update(all[idx].id, { order: b }),
				locals.pb.collection('checklist_items').update(all[swapIdx].id, { order: a })
			]);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reorder.';
			return fail(500, { error: message });
		}
	}
};
