import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Trip, Day, Item, Checklist, Task, TripMember, Vote, Document } from '$lib/types';
import { attachCodesToItems } from '$lib/documents/codes';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { isTripActive } from '$lib/trip-mode/activation';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';
import { primaryPhaseForDay } from '$lib/itinerary/phases';
import { currentPhaseId } from '$lib/trip-mode/current-phase';
import { computeMovePatch } from '$lib/itinerary/move-item';
import { promotePlacement } from '$lib/trip-mode/promote';
import { scoreVotes, sortByVoteScore } from '$lib/collaboration/voting';
import { handleSaveMemory } from '$lib/memory/save-memory.server';
import type { Memory } from '$lib/memory/types';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, membership, phases, days } = await parent();

	// Trip Mode is only reachable on an active trip (#204). A deep link on a
	// planning or past trip would otherwise render trip-mode views under the
	// planning bottom-nav — redirect to the trip home instead.
	if (!isTripActive(trip)) redirect(303, `/trips/${params.slug}`);

	const now = tripNow(tripTz(trip));
	const todayStr = now.toISOString().split('T')[0];
	const today = days.find((d: Day) => d.date.split(/[T ]/)[0] === todayStr) ?? null;

	// #244: Now absorbed Today — it is the whole day, not just the forward slice.
	// All of today's discrete (non-spanning) items, TIMED AND UNTIMED, so a promoted
	// (untimed) idea renders. Weights (faded past / Focus / normal rest) derive client-
	// side via `getNowFeed`; the loader just supplies the full set.
	const todayItems = today
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${today.id}" && end_date = ""`,
				sort: 'start_time,sort_order'
			})
		: [];

	// Next-day preview (the divider tail → "Next 3 days"). Just tomorrow's items;
	// the full 3-day list lives on /today/upcoming (the "Next 3 days" sub-tab).
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
	const tomorrowStr = tomorrow.toISOString().split('T')[0];
	const tomorrowDay = days.find((d: Day) => d.date.split(/[T ]/)[0] === tomorrowStr) ?? null;
	const tomorrowItems = tomorrowDay
		? await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${tomorrowDay.id}" && end_date = ""`,
				sort: 'start_time,sort_order'
			})
		: [];

	// Spanning multi-day items (lodging, rental car) that cover today: they start
	// on/before today and end on/after it. Surfaced as slim context banners (Slice
	// B) — never the Focus pick (#82/#83). Lexicographic compare is safe for the
	// `YYYY-MM-DD...` date/datetime strings PocketBase stores.
	const startedByTodayIds = days
		.filter((d: Day) => d.date.split(/[T ]/)[0] <= todayStr)
		.map((d: Day) => d.id);
	const multiDayItems =
		startedByTodayIds.length > 0
			? await locals.pb.collection('items').getFullList<Item>({
					filter: `(${startedByTodayIds.map((id) => `day = "${id}"`).join(' || ')}) && end_date != "" && end_date >= "${todayStr}"`,
					sort: 'start_time'
				})
			: [];

	// Roster + votes for the merged Now cards (#244, mirroring Today): card avatars
	// denote assignees, votes show as a count pill. Roster also carries email for the
	// member-contact strip (#244: members left the nav — surface tap-to-contact here).
	const itemIds = [...todayItems, ...multiDayItems].map((i) => i.id);
	const [votes, members] = await Promise.all([
		itemIds.length > 0
			? locals.pb.collection('votes').getFullList<Vote>({
					filter: itemIds.map((id) => `item = "${id}"`).join(' || ')
				})
			: Promise.resolve([] as Vote[]),
		locals.pb.collection('trip_members').getFullList<TripMember>({
			filter: `trip = "${trip.id}" && removed_at = ""`,
			expand: 'user'
		})
	]);
	const votesByItem: Record<string, Vote[]> = {};
	for (const v of votes) (votesByItem[v.item] ??= []).push(v);

	// #268 / ADR-0016 — the TripModeCard renders `item.confirmation_codes`, but codes
	// now live as `kind: 'code'` Documents (the legacy json field is inert). Re-source
	// them onto today's + tomorrow's cards (oldest-first → creation order).
	const codeDocs = await locals.pb.collection('documents').getFullList<Document>({
		filter: `trip = "${trip.id}" && kind = "code"`,
		sort: 'created'
	});
	attachCodesToItems(todayItems, codeDocs);
	attachCodesToItems(tomorrowItems, codeDocs);

	// Trip Mode checklists (#52): read + check-off in place (Slice B). Trip/phase-
	// scoped manual lists only; item-scoped lists stay on their Item.
	const { checklists: lists, tasks: listTasks } = await fetchManualChecklists(locals.pb, trip.id);
	const checklists = lists.map((c) => ({
		id: c.id,
		title: c.title,
		tasks: listTasks.filter((t) => t.checklist === c.id)
	}));

	// #245 Door 1 — "ideas for now". Derive the live phase (the boundary-day core),
	// then surface THAT phase's parked ideas, vote-score ordered. The strip renders
	// only at a free-time / nothing-else Focus (the view decides); an empty current
	// phase yields no ideas → no strip (no widening — every idea already has a phase).
	let ideas: { item: Item; score: number; votes: Vote[] }[] = [];
	let derivedPhaseId = '';
	if (today) {
		// Forward (later-day) discrete items power the cross-day transition rule
		// (a late-night arrival's destination may be tomorrow). Earliest-first.
		const forwardItems = await locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}" && day != "${today.id}" && day != "" && start_time > "${todayStr}" && end_date = ""`,
			sort: 'start_time'
		});

		const fallbackPhaseId = primaryPhaseForDay(today, phases)?.id ?? '';
		derivedPhaseId = currentPhaseId({ todayItems, now, forwardItems, fallbackPhaseId });

		if (derivedPhaseId) {
			// The current phase's parked (unplanned) ideas — the existing per-phase
			// parking zone (#87), scoped to this phase ONLY (not pooled across the day).
			const phaseIdeas = await locals.pb.collection('items').getFullList<Item>({
				filter: `trip = "${trip.id}" && status = "unplanned" && phase = "${derivedPhaseId}"`,
				sort: 'sort_order'
			});

			const ideaIds = phaseIdeas.map((i) => i.id);
			const ideaVotes =
				ideaIds.length > 0
					? await locals.pb.collection('votes').getFullList<Vote>({
							filter: ideaIds.map((id) => `item = "${id}"`).join(' || ')
						})
					: [];
			const votesByIdea: Record<string, Vote[]> = {};
			for (const v of ideaVotes) (votesByIdea[v.item] ??= []).push(v);

			const scoreById: Record<string, number> = {};
			for (const i of phaseIdeas) scoreById[i.id] = scoreVotes(votesByIdea[i.id] ?? []);

			// Vote-score order (desc), ties by sort_order asc — the parking lot's order.
			ideas = sortByVoteScore(phaseIdeas, scoreById).map((item) => ({
				item,
				score: scoreById[item.id] ?? 0,
				votes: votesByIdea[item.id] ?? []
			}));
		}
	}

	// #245/SPEC §4 — promote is an item edit: owner/co_owner only. The strip renders
	// for everyone (travelers/viewers see vote stacks read-only); this gates the tap.
	const canPromote = membership.role === 'owner' || membership.role === 'co_owner';

	// #269 Trip Memory — today's memories from ALL travelers (review cards) +
	// the caller's own (the composer's upsert target). Viewers see, never author.
	const memories = today
		? await locals.pb.collection('memories').getFullList<Memory>({
				filter: `trip = "${trip.id}" && day = "${today.id}"`,
				sort: 'created'
			})
		: [];
	const myMemory = memories.find((m) => m.author === membership.id) ?? null;
	const canCapture = membership.role !== 'viewer';

	return {
		todayItems,
		tomorrowItems,
		tomorrowDate: tomorrowDay?.date ?? null,
		multiDayItems,
		checklists,
		votesByItem,
		members: withAvatarUrls(locals.pb, members),
		hasToday: today !== null,
		todayDayId: today?.id ?? null,
		now: now.toISOString(),
		// #269 — today's memory cards + the caller's own memory (composer target).
		memories,
		myMemory,
		canCapture,
		// #245 Door 1 — current-phase ideas strip (vote-score ordered) + the promote gate.
		ideas,
		currentPhaseId: derivedPhaseId,
		canPromote
	};
};

export const actions: Actions = {
	// #269 Trip Memory — the composer's save (upsert-or-delete the caller's
	// (day, author) record). Shared handler; PB rules + memories.pb.js enforce.
	saveMemory: handleSaveMemory,

	// Check-only toggle for Trip Mode (#154 Slice B), mirroring Today's action.
	// Membership-gated, viewer read-only.
	toggleTask: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
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
	},

	// #245 Door 1 — promote a parked idea onto TODAY (Light Replanning, today only).
	// REUSES computeMovePatch + promote placement (sort-order) — no parallel module
	// (PRD §7): assign `day` + `planned`, slot into sort_order after the current
	// moment, NO phase reassignment (the idea keeps its phase, which already
	// contains today). Owner/co_owner only (SPEC §4); travelers/viewers 403.
	promoteIdea: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
		if (membership.role !== 'owner' && membership.role !== 'co_owner') {
			return fail(403, { error: 'Only the trip owner or a co-owner can promote an idea.' });
		}

		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			// Today's day (Light Replanning boundary — promote targets today only).
			// Match on the calendar-date prefix, mirroring the loader (PB may store
			// `date` as a datetime; a string-prefix compare is the robust check).
			const now = tripNow(tripTz(trip));
			const todayStr = now.toISOString().split('T')[0];
			const tripDays = await locals.pb.collection('days').getFullList<Day>({
				filter: `trip = "${trip.id}"`
			});
			const today = tripDays.find((d) => d.date.split(/[T ]/)[0] === todayStr) ?? null;
			if (!today) return fail(400, { error: 'No day for today.' });

			const item = await locals.pb.collection('items').getOne<Item>(itemId);
			if (item.trip !== trip.id) return fail(403, { error: 'Not authorized.' });

			// Status/day invariant (no phase change — keep the idea's own phase).
			const patch = computeMovePatch({
				currentStatus: item.status,
				newDay: today.id,
				newPhase: item.phase
			});
			// Attach to the day FIRST so it's part of the day set the whole-day
			// rebalance renumbers (mirrors pullToPlan).
			await locals.pb.collection('items').update(itemId, {
				day: patch.day,
				phase: patch.phase,
				status: patch.status
			});

			// Today's discrete items (timed + the just-attached idea) → placement.
			const dayItems = await locals.pb.collection('items').getFullList<Item>({
				filter: `day = "${today.id}" && end_date = ""`,
				sort: 'start_time,sort_order'
			});
			const promoted = dayItems.find((i) => i.id === itemId) ?? { ...item, ...patch };
			const updates = promotePlacement(dayItems, promoted as Item, now);
			await Promise.all(
				updates.map((u) => locals.pb.collection('items').update(u.id, { sort_order: u.sort_order }))
			);

			return { success: true };
		} catch (err: unknown) {
			const e = err as { status?: number };
			if (e?.status === 403) {
				return fail(403, { error: 'Only the trip owner or a co-owner can promote an idea.' });
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to promote idea.' });
		}
	},

	// #246 Door 2 — skip a planned TODAY item. REUSES computeMovePatch (clear day →
	// unplanned, strip time, reset sort_order; PRD §7) so the item returns to its
	// phase's PARKING LOT — reversible ("maybe later in the trip"), re-promotable
	// from the strip. NEVER `considered` (that verdict is Closeout's, not here):
	// computeMovePatch only sets `unplanned` on a non-terminal item, exactly the
	// contract. Owner/co_owner only (SPEC §4); travelers/viewers 403.
	skipItem: async ({ request, params, locals }) => {
		const trip = await locals.pb
			.collection('trips')
			.getFirstListItem<Trip>(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
		if (membership.role !== 'owner' && membership.role !== 'co_owner') {
			return fail(403, { error: 'Only the trip owner or a co-owner can skip an item.' });
		}

		const data = await request.formData();
		const itemId = data.get('item_id')?.toString();
		if (!itemId) return fail(400, { error: 'Missing item ID.' });

		try {
			const item = await locals.pb.collection('items').getOne<Item>(itemId);
			if (item.trip !== trip.id) return fail(403, { error: 'Not authorized.' });

			// Clear the day → unplanned + stripped time anchors. Keep the item's own
			// phase so it lands back in that phase's parking lot (the #196 invariant:
			// an unplanned item must keep a phase or it falls into no-surface limbo).
			const patch = computeMovePatch({
				currentStatus: item.status,
				newDay: '',
				newPhase: item.phase
			});
			if (patch.status === 'unplanned' && !patch.phase) {
				const firstPhase = await locals.pb
					.collection('phases')
					.getFirstListItem(`trip = "${trip.id}"`, { sort: 'order' })
					.catch(() => null);
				if (firstPhase) patch.phase = firstPhase.id;
			}

			await locals.pb.collection('items').update(itemId, patch);
			return { success: true };
		} catch (err: unknown) {
			const e = err as { status?: number };
			if (e?.status === 403) {
				return fail(403, { error: 'Only the trip owner or a co-owner can skip an item.' });
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to skip item.' });
		}
	}
};
