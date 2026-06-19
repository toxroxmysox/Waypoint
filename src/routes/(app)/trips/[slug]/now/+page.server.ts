import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Day, Item, Checklist, Task, TripMember, Vote } from '$lib/types';
import { tripNow, tripTz } from '$lib/shell/trip-time';
import { isTripActive } from '$lib/trip-mode/activation';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { withAvatarUrls } from '$lib/collaboration/member-avatar';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { trip, days } = await parent();

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

	// Trip Mode checklists (#52): read + check-off in place (Slice B). Trip/phase-
	// scoped manual lists only; item-scoped lists stay on their Item.
	const { checklists: lists, tasks: listTasks } = await fetchManualChecklists(locals.pb, trip.id);
	const checklists = lists.map((c) => ({
		id: c.id,
		title: c.title,
		tasks: listTasks.filter((t) => t.checklist === c.id)
	}));

	return {
		todayItems,
		tomorrowItems,
		tomorrowDate: tomorrowDay?.date ?? null,
		multiDayItems,
		checklists,
		votesByItem,
		members: withAvatarUrls(locals.pb, members),
		hasToday: today !== null,
		now: now.toISOString()
	};
};

export const actions: Actions = {
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
	}
};
