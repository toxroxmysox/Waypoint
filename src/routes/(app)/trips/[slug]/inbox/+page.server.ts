import { fail, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Suggestion, SuggestionVote } from '$lib/types';
import type { DisplayVote } from '$lib/collaboration/voting';

const PB_BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

// #251 — a Suggestion plus the votes cast on its ghost (suggestion_votes), so each
// Inbox tab can show a vote tally. Approved suggestions keep their suggestion_votes
// as frozen history (the migrated item votes are separate), so the tally is
// consistent across all three tabs.
export type InboxSuggestion = Suggestion & { votes: DisplayVote[] };

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, membership } = await parent();

	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		error(403, 'Only trip owners and co-owners can view the inbox');
	}

	const token = locals.pb.authStore.token;

	let pending: Suggestion[] = [];
	let approved: Suggestion[] = [];
	let rejected: Suggestion[] = [];
	try {
		// #251 — three tabs: Pending / Approved / Rejected.
		const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
			fetch(`${PB_BASE}/api/suggestions/list?trip_id=${trip.id}&status=pending`, {
				headers: { Authorization: `Bearer ${token}` }
			}),
			fetch(`${PB_BASE}/api/suggestions/list?trip_id=${trip.id}&status=approved`, {
				headers: { Authorization: `Bearer ${token}` }
			}),
			fetch(`${PB_BASE}/api/suggestions/list?trip_id=${trip.id}&status=rejected`, {
				headers: { Authorization: `Bearer ${token}` }
			})
		]);
		const pendingData = await pendingRes.json();
		const approvedData = await approvedRes.json();
		const rejectedData = await rejectedRes.json();
		pending = pendingData.items ?? [];
		approved = approvedData.items ?? [];
		rejected = rejectedData.items ?? [];
	} catch (_) {
		// Non-fatal — render empty state.
	}

	// #251 — load suggestion_votes for every listed suggestion and attach a tally.
	// One query (OR-chained ids), bucketed by suggestion. SuggestionVote satisfies
	// DisplayVote (id + member + value), which is all the tally needs.
	const allIds = [...pending, ...approved, ...rejected].map((s) => s.id);
	const votesBySuggestion: Record<string, DisplayVote[]> = {};
	if (allIds.length > 0) {
		try {
			const votes = await locals.pb.collection('suggestion_votes').getFullList<SuggestionVote>({
				filter: allIds.map((id) => `suggestion = "${id}"`).join(' || ')
			});
			for (const v of votes) (votesBySuggestion[v.suggestion] ??= []).push(v);
		} catch (_) {
			// Non-fatal — tallies just render empty.
		}
	}
	const attach = (list: Suggestion[]): InboxSuggestion[] =>
		list.map((s) => ({ ...s, votes: votesBySuggestion[s.id] ?? [] }));

	return {
		trip,
		membership,
		pending: attach(pending),
		approved: attach(approved),
		rejected: attach(rejected)
	};
};

export const actions: Actions = {
	// #250 — reject requires a one-line note (no one-tap reject). The note is
	// stored on the suggestion and carried in the suggestion_rejected notice; the
	// server re-validates, but we guard here to surface a clean in-context error.
	reject: async ({ request, locals }) => {
		const data = await request.formData();
		const suggestionId = data.get('suggestion_id')?.toString() || '';
		const reviewNote = data.get('review_note')?.toString().trim() || '';
		if (!suggestionId) return fail(400, { reject: { error: 'suggestion_id is required' } });
		if (!reviewNote) return fail(400, { reject: { error: 'A note is required to reject.' } });

		const token = locals.pb.authStore.token;

		try {
			const res = await fetch(`${PB_BASE}/api/suggestions/review`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ suggestion_id: suggestionId, action: 'reject', review_note: reviewNote })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				return fail(res.status, { reject: { error: (err as { message?: string }).message || 'Failed to reject.' } });
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to reject suggestion.';
			return fail(500, { reject: { error: message } });
		}

		return { reject: { success: true } };
	},

	approve: async ({ request, locals }) => {
		const data = await request.formData();
		const suggestionId = data.get('suggestion_id')?.toString() || '';
		if (!suggestionId) return fail(400, { approve: { error: 'suggestion_id is required' } });

		const token = locals.pb.authStore.token;

		try {
			const res = await fetch(`${PB_BASE}/api/suggestions/review`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ suggestion_id: suggestionId, action: 'approve' })
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				return fail(res.status, { approve: { error: (err as { message?: string }).message || 'Failed to approve.' } });
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to approve suggestion.';
			return fail(500, { approve: { error: message } });
		}

		return { approve: { success: true } };
	}
};
