import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Checklist, Task, TripMember } from '$lib/types';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { trip } = await parent();

	let checklist: Checklist;
	try {
		checklist = await locals.pb.collection('checklists').getOne<Checklist>(params.listId);
	} catch {
		error(404, 'List not found');
	}
	if (checklist.trip !== trip.id || checklist.item) {
		error(404, 'List not found');
	}

	const [tasks, members] = await Promise.all([
		locals.pb.collection('tasks').getFullList<Task>({
			filter: `checklist = "${checklist.id}"`,
			sort: 'order'
		}),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);

	return { checklist, tasks, members: withAvatarUrls(locals.pb, members) };
};

async function getTrip(locals: App.Locals, slug: string) {
	return locals.pb.collection('trips').getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
}

async function isViewer(locals: App.Locals, tripId: string): Promise<boolean> {
	const membership = await locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(`trip = "${tripId}" && user = "${locals.user!.id}" && removed_at = ""`);
	return membership.role === 'viewer';
}

// Load the parent checklist for this route and assert it owns the given task.
async function loadChecklist(locals: App.Locals, tripId: string, listId: string): Promise<Checklist | null> {
	const checklist = await locals.pb.collection('checklists').getOne<Checklist>(listId).catch(() => null);
	if (!checklist || checklist.trip !== tripId || checklist.item) return null;
	return checklist;
}

export const actions: Actions = {
	addTask: async ({ request, params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const checklist = await loadChecklist(locals, trip.id, params.listId);
		if (!checklist) return fail(404, { error: 'List not found.' });

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		if (!title) return fail(400, { error: 'Title required.' });

		try {
			const existing = await locals.pb.collection('tasks').getFullList<Task>({
				filter: `checklist = "${checklist.id}"`,
				sort: '-order',
				fields: 'order'
			});
			const nextOrder = existing.length > 0 ? Number(existing[0].order) + 1 : 0;
			await locals.pb.collection('tasks').create({
				checklist: checklist.id,
				title,
				checked: false,
				order: nextOrder
			});
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to add task.' });
		}
	},

	toggleTask: async ({ request, params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const data = await request.formData();
		const taskId = data.get('task_id')?.toString();
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const task = await locals.pb.collection('tasks').getOne<Task>(taskId);
			if (task.checklist !== params.listId) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('tasks').update(taskId, { checked: !task.checked });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to toggle.' });
		}
	},

	assignTask: async ({ request, params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const data = await request.formData();
		const taskId = data.get('task_id')?.toString();
		const assignee = data.get('assignee')?.toString() ?? '';
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const task = await locals.pb.collection('tasks').getOne<Task>(taskId);
			if (task.checklist !== params.listId) return fail(403, { error: 'Not authorized.' });
			if (assignee) {
				const member = await locals.pb
					.collection('trip_members')
					.getFirstListItem<TripMember>(`id = "${assignee}" && trip = "${trip.id}" && removed_at = ""`)
					.catch(() => null);
				if (!member) return fail(400, { error: 'Invalid assignee.' });
			}
			await locals.pb.collection('tasks').update(taskId, { assignee: assignee || null });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to assign.' });
		}
	},

	deleteTask: async ({ request, params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const data = await request.formData();
		const taskId = data.get('task_id')?.toString();
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const task = await locals.pb.collection('tasks').getOne<Task>(taskId);
			if (task.checklist !== params.listId) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('tasks').delete(taskId);
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	},

	rename: async ({ request, params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const checklist = await loadChecklist(locals, trip.id, params.listId);
		if (!checklist) return fail(404, { error: 'List not found.' });

		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		if (!title) return fail(400, { error: 'Name required.' });

		try {
			await locals.pb.collection('checklists').update(checklist.id, { title });
			return { success: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to rename.' });
		}
	},

	deleteList: async ({ params, locals }) => {
		const trip = await getTrip(locals, params.slug);
		if (await isViewer(locals, trip.id)) return fail(403, { error: 'Viewers cannot modify lists.' });

		const checklist = await loadChecklist(locals, trip.id, params.listId);
		if (!checklist) return fail(404, { error: 'List not found.' });

		try {
			await locals.pb.collection('checklists').delete(checklist.id); // tasks cascade
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete list.' });
		}
		redirect(303, `/trips/${params.slug}/lists`);
	}
};
