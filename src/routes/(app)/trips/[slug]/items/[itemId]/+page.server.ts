import { error, fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ChecklistItem, TripMember, Vote, Comment } from '$lib/types';
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

	const [checklistItems, members, rawComments, votes, alternates] = await Promise.all([
		item.type === 'checklist'
			? locals.pb.collection('checklist_items').getFullList<ChecklistItem>({
					filter: `item = "${item.id}"`,
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

	return { item, checklistItems, members, comments, votes, myVote, alternates, itemDay: day, itemPhase: phase };
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
