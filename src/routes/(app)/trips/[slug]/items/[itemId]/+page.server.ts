import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, Checklist, Task, TripMember, Vote, Comment, Document, Expense, TripGoal } from '$lib/types';
import { VOTE_OPTIONS, type VoteValue } from '$lib/collaboration/voting';
import { toDocumentView } from '$lib/documents/view';
import { memberAvatarUrl, withAvatarUrls } from '$lib/collaboration/member-avatar';
import { computeMovePatch } from '$lib/itinerary/move-item';
import { paidSummaryForItem } from '$lib/money/linked-expenses';

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

	const [tasks, members, rawComments, votes, rawDocuments, linkedExpenses, tripGoals] = await Promise.all([
		checklist
			? locals.pb.collection('tasks').getFullList<Task>({
					filter: `checklist = "${checklist.id}"`,
					sort: 'order'
				})
			: Promise.resolve([]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		}),
		// Comments, newest first (#122).
		locals.pb.collection('suggestions').getFullList<Comment>({
			filter: `target_item = "${item.id}" && target_type = "comment" && status = "approved"`,
			sort: '-created',
			expand: 'author.user'
		}).catch(() => [] as Comment[]),
		locals.pb.collection('votes').getFullList<Vote>({
			filter: `item = "${item.id}"`
		}),
		// Item-scoped documents, newest first.
		locals.pb.collection('documents').getFullList<Document>({
			filter: `item = "${item.id}"`,
			sort: '-created',
			expand: 'uploaded_by'
		}).catch(() => [] as Document[]),
		// #128 — does any expense link this item? Drives the conditional "View in
		// expenses" affordance. id-only fetch; the count is all the detail needs.
		locals.pb.collection('expenses').getFullList<Expense>({
			filter: `linked_item = "${item.id}"`,
			fields: 'id,amount_usd,linked_item'
		}).catch(() => [] as Expense[]),
		// #129 — Goals peek (back-link). The link lives goal-side on
		// `trip_goals.items`; fetch the trip's goals and keep the ones whose
		// relation contains this item (JS filter mirrors syncGoalLinks — goals
		// per trip are few, sidesteps PB relation-filter syntax).
		locals.pb.collection('trip_goals').getFullList<TripGoal>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,title,items',
			sort: 'sort_order'
		}).catch(() => [] as TripGoal[])
	]);

	const linkedGoals = tripGoals.filter((g) => (g.items ?? []).includes(item.id));

	const documents = rawDocuments.map((d) => toDocumentView(d, trip.slug, item));

	// Annotate comments with author display info from the expand.
	const comments = rawComments.map((c) => {
		const authorMember = c.expand?.author as TripMember | undefined;
		return {
			...c,
			author_name: authorMember?.display_name || authorMember?.placeholder_name || 'Unknown',
			author_role: authorMember?.role ?? '',
			author_avatar: authorMember ? memberAvatarUrl(locals.pb, authorMember) : ''
		};
	});

	const day = item.day ? days.find((d) => d.id === item.day) ?? null : null;
	const phase = item.phase ? phases.find((p) => p.id === item.phase) ?? null : null;

	const myVote = votes.find((v) => v.member === membership.id) ?? null;

	// #219 — who may edit this item directly: owner/co_owner, OR the member who
	// created it (created_by holds a trip_members.id). Mirrors the items.pb.js
	// update gate so the Edit affordance never shows when the submit would 403.
	const canEdit =
		membership.role === 'owner' ||
		membership.role === 'co_owner' ||
		(!!item.created_by && item.created_by === membership.id);

	// #229 / ADR-0014 — the paid-moment affordance. "Paid" is DERIVED: paid IFF ≥1 linked
	// expense (no `paid` flag, no migration). 0 linked → "Log payment" (opens #228's
	// prefilled add); ≥1 → "Paid $X" (summed) with a link-out. Shown on every Item Type
	// except `note`, open to any non-viewer. `booked` is orthogonal and never consulted.
	const paidSummary = paidSummaryForItem(linkedExpenses, item.id);
	const canLogPayment = membership.role !== 'viewer' && item.type !== 'note';

	return { item, checklist, tasks, members: withAvatarUrls(locals.pb, members), comments, votes, myVote, documents, itemDay: day, itemPhase: phase, linkedExpenseCount: linkedExpenses.length, linkedGoals, canEdit, paidSummary, canLogPayment };
};

async function getMembership(locals: App.Locals, tripId: string): Promise<TripMember> {
	return locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(`trip = "${tripId}" && user = "${locals.user!.id}" && removed_at = ""`);
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
			const phaseId = item['phase'] as string;
			await locals.pb.collection('items').delete(params.itemId);

			// Post-delete lands where the detail's back would (#197 B-023): the
			// item's day, else its phase (parking ideas have no day), else Overview.
			if (dayId) {
				redirect(303, `/trips/${params.slug}/days/${dayId}`);
			}
			if (phaseId) {
				redirect(303, `/trips/${params.slug}/phases/${phaseId}`);
			}
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete item.';
			return fail(500, { error: message });
		}
	},

	// Upload a document scoped to this item. Multipart form action (not client
	// fetch). The documents.pb.js hook pins uploaded_by + blocks viewers; PB
	// mimeTypes/maxSize enforce type + 20 MB.
	uploadDocument: async ({ request, params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		const formData = await request.formData();
		const file = formData.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { uploadError: 'Choose a file to upload.' });
		}

		const caption = formData.get('caption')?.toString().trim() ?? '';

		try {
			const fd = new FormData();
			fd.set('trip', item.trip);
			fd.set('item', item.id);
			if (caption) fd.set('caption', caption);
			fd.set('file', file);
			await locals.pb.collection('documents').create(fd);
			return { uploadSuccess: true };
		} catch (err: unknown) {
			const e = err as { status?: number; response?: { data?: Record<string, unknown> } };
			if (e?.status === 403) {
				return fail(403, { uploadError: 'You do not have permission to upload here.' });
			}
			if (e?.response?.data?.file) {
				return fail(400, { uploadError: 'PDF or image only, up to 20 MB.' });
			}
			return fail(400, { uploadError: 'Failed to upload document.' });
		}
	},

	deleteDocument: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const docId = formData.get('document_id')?.toString();
		if (!docId) return fail(400, { error: 'Missing document id.' });

		try {
			const doc = await locals.pb.collection('documents').getOne<Document>(docId);
			if (doc.item !== params.itemId) return fail(403, { error: 'Not authorized.' });
			await locals.pb.collection('documents').delete(docId);
			return { documentDeleted: true };
		} catch (err: unknown) {
			const e = err as { status?: number };
			if (e?.status === 403) {
				return fail(403, { error: 'Only the uploader or a trip owner/co-owner can delete this.' });
			}
			const message = err instanceof Error ? err.message : 'Failed to delete document.';
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
					.getFirstListItem<TripMember>(`id = "${assignee}" && trip = "${item.trip}" && removed_at = ""`)
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
				.getFirstListItem<TripMember>(`trip = "${targetItem.trip}" && user = "${locals.user!.id}" && removed_at = ""`);

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

	moveItem: async ({ request, params, locals }) => {
		const data = await request.formData();
		const newDay = data.get('day')?.toString() || '';
		const newPhase = data.get('phase')?.toString() || '';

		try {
			// #172 — keep status in lockstep with day so the item can't land in a
			// contradictory state (unplanned-with-day → invisible on the day;
			// planned-without-day → renders nowhere or twice). The patch is computed
			// by a pure, unit-tested function (move-item.ts) from the item's current
			// status, mirroring the day view's pullToPlan/pushToParking invariant.
			const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
			const patch = computeMovePatch({
				currentStatus: item.status,
				newDay,
				newPhase
			});

			// #196 invariant carried into the move: an unplanned item must keep a
			// phase or it falls into the no-surface limbo. If the move would leave
			// it unplanned-and-phase-less, fall back to the trip's first phase (by
			// order) so it stays renderable — same policy as the suggestion hook.
			if (patch.status === 'unplanned' && !patch.phase) {
				const firstPhase = await locals.pb
					.collection('phases')
					.getFirstListItem(`trip = "${item.trip}"`, { sort: 'order' })
					.catch(() => null);
				if (firstPhase) patch.phase = firstPhase.id;
			}

			await locals.pb.collection('items').update(params.itemId, patch);

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to move item.';
			return fail(500, { error: message });
		}
	},

	// #246 Door 2 — skip from item detail (the second entry point; the Today card's
	// overflow is the first). Same semantics as the Now route's skipItem: clear day
	// → unplanned, strip time, keep phase → returns to the parking lot, reversible,
	// never `considered`. Owner/co_owner only (SPEC §4). Reuses computeMovePatch.
	skipItem: async ({ params, locals }) => {
		const item = await locals.pb.collection('items').getOne<Item>(params.itemId);
		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${item.trip}" && user = "${locals.user!.id}" && removed_at = ""`
			)
			.catch(() => null);
		if (!membership || (membership.role !== 'owner' && membership.role !== 'co_owner')) {
			return fail(403, { error: 'Only the trip owner or a co-owner can skip an item.' });
		}

		try {
			const patch = computeMovePatch({
				currentStatus: item.status,
				newDay: '',
				newPhase: item.phase
			});
			if (patch.status === 'unplanned' && !patch.phase) {
				const firstPhase = await locals.pb
					.collection('phases')
					.getFirstListItem(`trip = "${item.trip}"`, { sort: 'order' })
					.catch(() => null);
				if (firstPhase) patch.phase = firstPhase.id;
			}
			await locals.pb.collection('items').update(params.itemId, patch);
			return { success: true };
		} catch (err: unknown) {
			const e = err as { status?: number };
			if (e?.status === 403) {
				return fail(403, { error: 'Only the trip owner or a co-owner can skip an item.' });
			}
			const message = err instanceof Error ? err.message : 'Failed to skip item.';
			return fail(500, { error: message });
		}
	}
};
