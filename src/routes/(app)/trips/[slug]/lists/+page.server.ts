import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Checklist, Task, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();

	// Trip- and phase-scoped manual checklists (item-scoped ones live on their
	// Item, not the Lists surface). Attachment level is derived: phase set =
	// phase-level, else trip-level.
	const checklists = await locals.pb.collection('checklists').getFullList<Checklist>({
		filter: `trip = "${trip.id}" && kind = "manual" && item = ""`,
		sort: 'order'
	});

	const [members, tasks, bookingCount] = await Promise.all([
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		}),
		checklists.length > 0
			? locals.pb.collection('tasks').getFullList<Task>({
					filter: checklists.map((c) => `checklist = "${c.id}"`).join(' || ')
				})
			: Promise.resolve([] as Task[]),
		locals.pb
			.collection('items')
			.getList(1, 1, {
				filter: `trip = "${trip.id}" && requires_booking = true && booked = false && status = "planned"`
			})
			.then((r) => r.totalItems)
			.catch(() => 0)
	]);

	// Roll up per-checklist progress + distinct assignees.
	const lists = checklists.map((c) => {
		const own = tasks.filter((t) => t.checklist === c.id);
		const assigneeIds = [...new Set(own.filter((t) => t.assignee).map((t) => t.assignee))];
		return {
			id: c.id,
			title: c.title,
			phase: c.phase,
			done: own.filter((t) => t.checked).length,
			total: own.length,
			assigneeIds
		};
	});

	return { lists, members, bookingCount };
};

export const actions: Actions = {
	create: async ({ request, locals, params }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
		if (membership.role === 'viewer') return fail(403, { error: 'Viewers cannot create lists.' });

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const scope = data.get('scope')?.toString() || 'trip'; // 'trip' | <phaseId>
		if (!title) return fail(400, { error: 'List name is required.' });

		// Validate phase scope belongs to this trip.
		let phase = '';
		if (scope !== 'trip') {
			const ok = await locals.pb
				.collection('phases')
				.getFirstListItem(`id = "${scope}" && trip = "${trip.id}"`)
				.catch(() => null);
			if (!ok) return fail(400, { error: 'Invalid phase.' });
			phase = scope;
		}

		try {
			const existing = await locals.pb.collection('checklists').getFullList({
				filter: `trip = "${trip.id}" && kind = "manual" && item = ""`,
				sort: '-order',
				fields: 'order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0]['order']) + 1 : 0;

			const created = await locals.pb.collection('checklists').create<Checklist>({
				trip: trip.id,
				phase,
				item: '',
				title,
				kind: 'manual',
				order: nextOrder
			});

			return { success: true, listId: created.id };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create list.';
			return fail(500, { error: message });
		}
	}
};
