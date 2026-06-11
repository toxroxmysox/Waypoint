import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Checklist, Task, TripMember } from '$lib/types';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, days } = await parent();

	const now = tripNow(tripTz(trip));

	// Find today's day record (UTC date match)
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// Load items for today + upcoming (let client derive state)
	const todayAndUpcomingIds: string[] = [];
	if (today) todayAndUpcomingIds.push(today.id);

	for (let i = 1; i <= 3; i++) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() + i);
		const ds = d.toISOString().split('T')[0];
		const found = days.find((day: Day) => day.date.split(/[T ]/)[0] === ds);
		if (found) todayAndUpcomingIds.push(found.id);
	}

	const items = todayAndUpcomingIds.length > 0
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `(${todayAndUpcomingIds.map((id) => `day = "${id}"`).join(' || ')}) && end_date = ""`,
				sort: 'day,start_time,sort_order'
			})
		: [];

	const multiDayItems = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}" && end_date != ""`,
		sort: 'day'
	});

	// Trip Mode checklists (#52): read + check only. Trip/phase-scoped manual
	// lists (e.g. packing); item-scoped grocery lists stay on their Item.
	const { checklists: lists, tasks: listTasks } = await fetchManualChecklists(locals.pb, trip.id);
	const checklists = lists.map((c) => ({
		id: c.id,
		title: c.title,
		tasks: listTasks.filter((t) => t.checklist === c.id)
	}));

	return {
		items,
		multiDayItems,
		checklists,
		now: now.toISOString()
	};
};

export const actions: Actions = {
	// Check-only toggle for Trip Mode. Membership-gated, viewer read-only.
	toggleTask: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`);
		if (membership.role === 'viewer') return fail(403, { error: 'Viewers cannot check tasks.' });

		const data = await request.formData();
		const taskId = data.get('task_id')?.toString();
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const task = await locals.pb.collection('tasks').getOne<Task>(taskId);
			const checklist = await locals.pb.collection('checklists').getOne<Checklist>(task.checklist);
			// Trip Mode only surfaces trip/phase-scoped lists; reject item-scoped tasks.
			if (checklist.trip !== trip.id || checklist.item) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('tasks').update(taskId, { checked: !task.checked });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to toggle.' });
		}
	}
};
