import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { buildArchiveView } from '$lib/portability/archive-view';

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

	const now = new Date();
	const endDate = new Date(trip.end_date);
	const publishDate = new Date(endDate);
	publishDate.setDate(publishDate.getDate() + (trip.archive_publish_after_days || 7));

	if (!trip.archived && now < publishDate) {
		error(404, 'Archive not yet published');
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

	// Checklists are intentionally NOT loaded — the archive excludes them.
	return buildArchiveView(trip, phases, days, items);
};
