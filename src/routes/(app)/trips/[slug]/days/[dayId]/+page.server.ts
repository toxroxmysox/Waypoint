import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Vote } from '$lib/types';
import { phasesForDay } from '$lib/itinerary/phases';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, phases } = await parent();

	let day: Day;
	try {
		day = await locals.pb.collection('days').getOne<Day>(params.dayId);
	} catch {
		error(404, 'Day not found');
	}

	if (day.trip !== trip.id) {
		error(404, 'Day not found');
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `day = "${day.id}"`,
		sort: 'slot,rank'
	});

	const itemIds = items.map((i) => i.id);
	const votes =
		itemIds.length > 0
			? await locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: [];

	const voteCounts: Record<string, number> = {};
	for (const v of votes) {
		voteCounts[v.item] = (voteCounts[v.item] ?? 0) + 1;
	}

	const dayPhases = phasesForDay(day, phases);

	return { day, dayItems: items, dayPhases, voteCounts };
};

export const actions: Actions = {
	updateNotes: async ({ request, params, locals }) => {
		const data = await request.formData();
		const notes = data.get('notes')?.toString() || '';

		try {
			await locals.pb.collection('days').update(params.dayId, { notes });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update notes.';
			return fail(500, { error: message });
		}
	}
};
