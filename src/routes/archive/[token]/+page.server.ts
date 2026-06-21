import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Trip, Phase, Day, Item, Expense, TripMember } from '$lib/types';
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { buildArchiveView } from '$lib/portability/archive-view';
import { isArchiveVisible, publishStatus } from '$lib/portability/archive-visibility';

export const load: PageServerLoad = async ({ params }) => {
	const pb = new PocketBase(PUBLIC_PB_URL);
	await pb.collection('_superusers').authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASSWORD!);

	let trip: Trip;
	try {
		trip = await pb
			.collection('trips')
			.getFirstListItem<Trip>(
				pb.filter('public_share_token = {:token}', { token: params.token })
			);
	} catch {
		error(404, 'Archive not found');
	}

	if (!trip.archive_enabled) {
		error(404, 'Archive not found');
	}

	// #241: the publish gate is now the EXPLICIT `archive_publish_at` date (via the pure
	// archive-visibility module), NOT the legacy `end_date + archive_publish_after_days`
	// math (that derivation published trips the owner never consented to — WP-B-019).
	// Pre-publish (scheduled-future) OR unpublished/reopen-paused → a friendly branded
	// screen, never error(404) (grandma may open this link the moment the trip ends).
	if (!isArchiveVisible(trip)) {
		const status = publishStatus(trip);
		return {
			pending: true as const,
			tripTitle: trip.title,
			// Scheduled → the date to show ("publishes on [date]"). Unpublished /
			// reopen-paused → no date; the screen drops the date sentence.
			publishDate: status.status === 'scheduled' ? status.date : ''
		};
	}

	const [phases, days, items] = await Promise.all([
		pb.collection('phases').getFullList<Phase>({
			filter: `trip = "${trip.id}"`,
			sort: 'order'
		}),
		pb.collection('days').getFullList<Day>({
			filter: `trip = "${trip.id}"`,
			sort: 'date'
		}),
		pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,sort_order'
		})
	]);

	// Opt-in budget summary (#243): ONLY when the owner enabled archive_show_budget do
	// we load expenses + the active member count — and even then only the AGGREGATE
	// total + rough per-person are surfaced (buildArchiveView never emits itemized
	// expenses or who-owes-whom). Default off → these queries are skipped entirely.
	let expenses: Expense[] = [];
	let memberCount = 0;
	if (trip.archive_show_budget) {
		[expenses, memberCount] = await Promise.all([
			pb.collection('expenses').getFullList<Expense>({ filter: `trip = "${trip.id}"` }),
			pb
				.collection('trip_members')
				.getFullList<TripMember>({ filter: `trip = "${trip.id}" && removed_at = ""` })
				.then((m) => m.length)
		]);
	}

	// Checklists are intentionally NOT loaded — the archive excludes them.
	return buildArchiveView(trip, phases, days, items, { expenses, memberCount });
};
