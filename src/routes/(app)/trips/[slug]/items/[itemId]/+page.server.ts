import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Checklist, Task, TripMember, Vote, Comment } from '$lib/types';
import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	let item: Item;
	try {
		item = await locals.pb.collection('items').getOne<Item>(params.itemId);
	} catch {
		error(404, 'Item not found');
	}

	if (item.trip !== trip.id) {
		error(404, 'Item not found');
	}

	// ADR-0003 — item-scoped manual Checklist rendered inline (the grocery case).
	const checklist = await locals.pb
		.collection('checklists')
		.getFirstListItem<Checklist>(`item = "${item.id}" && kind = "manual"`)
		.catch(() => null);

	const [tasks, members, rawComments, votes, alternates] = await Promise.all([
		checklist
			? locals.pb.collection('tasks').getFullList<Task>({
					filter: `checklist = "${checklist.id}"`,
					sort: 'order'
				})
			: Promise.resolve([]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}"`,
			expand: 'user'
		}),
		locals.pb.collection('suggestions').getFullList<Comment>({
			filter: `target_item = "${item.id}" && target_type = "comment" && status = "approved"`,
			sort: 'created',
			expand: 'author'
		}).catch(() => [] as Comment[]),
		locals.pb.collection('votes').getFullList<Vote>({
			filter: `item = "${item.id}"`
		}),
		item.day
			? locals.pb.collection('items').getFullList<Item>({
					filter: `day = "${item.day}" && id != "${item.id}"`,
					sort: 'sort_order'
				})
			: Promise.resolve([])
	]);

	// Annotate comments with author display info from the expand.
	const comments = rawComments.map((c) => {
		const authorMember = c.expand?.author as TripMember | undefined;
		return {
			...c,
			author_name: authorMember?.display_name || authorMember?.placeholder_name || 'Unknown',
			author_role: authorMember?.role ?? ''
		};
	});

	const day = item.day ? days.find((d) => d.id === item.day) ?? null : null;
	const phase = item.phase ? phases.find((p) => p.id === item.phase) ?? null : null;

	const myVote = votes.find((v) => v.member === membership.id) ?? null;

	return { item, checklist, tasks, members, comments, votes, myVote, alternates, itemDay: day, itemPhase: phase };
};

async function getMembership(locals: App.Locals, tripId: string): Promise<TripMember> {
	return locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(`trip = "${tripId}" && user = "${locals.user!.id}"`);
}

// Tasks sit outside the Suggestion pipeline (ADR-0003): traveler+ mutate freely,
// viewers are read-only. PB rules are membership-scoped, so the viewer gate lives
// here at the app layer.
async function isViewer(locals: App.Locals, tripId: string): Promise<boolean> {
	const membership = await getMembership(locals, tripId);
	return membership.role === 'viewer';
}

// Resolve a task with its parent checklist and assert it belongs to this item.
// Returns null when the task isn't attached to this item's checklist (tampering).
async function loadTaskInItem(
	locals: App.Locals,
	item: Item,
	taskId: string
): Promise<{ task: Task; checklist: Checklist } | null> {
	const task = await locals.pb.collection('tasks').getOne<Task>(taskId);
	const checklist = await locals.pb.collection('checklists').getOne<Checklist>(task.checklist);
	if (checklist.item !== item.id || checklist.trip !== item.trip) return null;
	return { task, checklist };
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

	// Attach a manual Checklist to this Item (the inline grocery case). One per
	// item for v1 — no-op if one already exists.
	attachChecklist: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const title = formData.get('title')?.toString().trim() || 'Checklist';

		try {
			const existing = await locals.pb
				.collection('checklists')
				.getFirstListItem<Checklist>(`item = "${item.id}" && kind = "manual"`)
				.catch(() => null);
			if (existing) return { success: true };

			await locals.pb.collection('checklists').create({
				trip: item.trip,
				phase: item.phase || '',
				item: item.id,
				title,
				kind: 'manual',
				order: 0
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to add checklist.';
			return fail(500, { error: message });
		}
	},

	deleteChecklist: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const checklistId = formData.get('checklist_id')?.toString();
		if (!checklistId) return fail(400, { error: 'Missing id.' });

		try {
			const checklist = await locals.pb.collection('checklists').getOne<Checklist>(checklistId);
			if (checklist.item !== item.id) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('checklists').delete(checklistId); // tasks cascade
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete checklist.';
			return fail(500, { error: message });
		}
	},

	addTask: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const checklistId = formData.get('checklist_id')?.toString();
		const title = formData.get('title')?.toString().trim();
		if (!checklistId) return fail(400, { error: 'Missing checklist.' });
		if (!title) return fail(400, { error: 'Title required.' });

		try {
			const checklist = await locals.pb.collection('checklists').getOne<Checklist>(checklistId);
			if (checklist.item !== item.id) return fail(403, { error: 'Not authorized.' });

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
			const message = err instanceof Error ? err.message : 'Failed to add task.';
			return fail(500, { error: message });
		}
	},

	toggleTask: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const taskId = formData.get('task_id')?.toString();
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const found = await loadTaskInItem(locals, item, taskId);
			if (!found) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('tasks').update(taskId, { checked: !found.task.checked });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to toggle.';
			return fail(500, { error: message });
		}
	},

	assignTask: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const taskId = formData.get('task_id')?.toString();
		const assignee = formData.get('assignee')?.toString() ?? '';
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const found = await loadTaskInItem(locals, item, taskId);
			if (!found) return fail(403, { error: 'Not authorized.' });
			// Empty string clears the relation. Otherwise the value must be a member of this trip.
			if (assignee) {
				const member = await locals.pb
					.collection('trip_members')
					.getFirstListItem<TripMember>(`id = "${assignee}" && trip = "${item.trip}"`)
					.catch(() => null);
				if (!member) return fail(400, { error: 'Invalid assignee.' });
			}
			await locals.pb.collection('tasks').update(taskId, { assignee: assignee || null });
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to assign.';
			return fail(500, { error: message });
		}
	},

	deleteTask: async ({ request, locals, params }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		if (await isViewer(locals, item.trip)) return fail(403, { error: 'Viewers cannot modify checklists.' });

		const formData = await request.formData();
		const taskId = formData.get('task_id')?.toString();
		if (!taskId) return fail(400, { error: 'Missing id.' });

		try {
			const found = await loadTaskInItem(locals, item, taskId);
			if (!found) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('tasks').delete(taskId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete.';
			return fail(500, { error: message });
		}
	},

	addComment: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const commentText = formData.get('comment_text')?.toString().trim() ?? '';
		if (!commentText) return fail(400, { commentError: 'Comment cannot be empty.' });

		const BASE = locals.pb.baseUrl;
		const token = locals.pb.authStore.token;

		const res = await fetch(`${BASE}/api/comments/add`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ item_id: params.itemId, comment_text: commentText })
		});

		if (!res.ok) {
			const json = (await res.json().catch(() => ({}))) as { message?: string };
			return fail(res.status, { commentError: json.message || 'Failed to post comment.' });
		}

		return { commentSuccess: true };
	},

	vote: async ({ request, params, locals }) => {
		const data = await request.formData();
		const value = data.get('value')?.toString() ?? '';
		if (!VOTE_OPTIONS.includes(value as VoteValue)) {
			return fail(400, { error: 'Invalid vote.' });
		}

		try {
			const targetItem = await locals.pb.collection('items').getOne(params.itemId);
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${targetItem.trip}" && user = "${locals.user!.id}"`);

			// One vote per member per item (unique index): change = update, not insert.
			const existing = await locals.pb
				.collection('votes')
				.getFirstListItem<Vote>(`item = "${targetItem.id}" && member = "${membership.id}"`)
				.catch(() => null);

			if (existing) {
				await locals.pb.collection('votes').update(existing.id, { value });
			} else {
				await locals.pb.collection('votes').create({
					trip: targetItem.trip,
					item: targetItem.id,
					member: membership.id,
					value
				});
			}
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to vote.';
			return fail(400, { error: message });
		}
	},

	unvote: async ({ request, locals }) => {
		const data = await request.formData();
		const voteId = data.get('vote_id')?.toString();
		if (!voteId) return fail(400, { error: 'Missing vote_id.' });

		try {
			await locals.pb.collection('votes').delete(voteId);
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove vote.';
			return fail(400, { error: message });
		}
	},

	promote: async ({ params, locals }) => {
		try {
			const targetItem = await locals.pb.collection('items').getOne<Item>(params.itemId);
			if (targetItem.sort_order === 0) return fail(400, { error: 'Item is already primary.' });

			// Find the current primary (sort_order 0) for this day
			const primaries = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${targetItem.day}" && sort_order = 0 && id != "${targetItem.id}"`
			});

			// Swap: demote current primary, promote this item
			for (const p of primaries) {
				await locals.pb.collection('items').update(p.id, { sort_order: targetItem.sort_order });
			}
			await locals.pb.collection('items').update(targetItem.id, { sort_order: 0 });

			return { success: true };
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to promote.';
			return fail(500, { error: message });
		}
	},

	demote: async ({ params, locals }) => {
		try {
			const targetItem = await locals.pb.collection('items').getOne<Item>(params.itemId);
			if (targetItem.sort_order !== 0) return fail(400, { error: 'Item is not primary.' });

			// Find the highest sort_order alternate
			const alts = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${targetItem.day}" && sort_order > 0 && id != "${targetItem.id}"`,
				sort: 'sort_order'
			});

			const nextSortOrder = alts.length > 0 ? alts[alts.length - 1].sort_order + 1 : 1;
			await locals.pb.collection('items').update(targetItem.id, { sort_order: nextSortOrder });

			return { success: true };
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to demote.';
			return fail(500, { error: message });
		}
	},

	moveItem: async ({ request, params, locals }) => {
		const data = await request.formData();
		const newDay = data.get('day')?.toString() || '';
		const newPhase = data.get('phase')?.toString() || '';

		try {
			await locals.pb.collection('items').update(params.itemId, {
				day: newDay,
				phase: newPhase
			});

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to move item.';
			return fail(500, { error: message });
		}
	}
};
