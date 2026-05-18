import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';

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
			sort: 'day,slot,order'
		})
	]);

	const sanitizedItems = items.map((item) => ({
		id: item.id,
		day: item.day,
		phase: item.phase,
		slot: item.slot,
		type: item.type,
		subtype: item.subtype,
		title: item.title,
		description: item.description,
		location_name: item.location_name,
		location_address: item.location_address,
		start_time: item.start_time,
		end_time: item.end_time,
		status: item.status
	}));

	return {
		trip: {
			title: trip.title,
			start_date: trip.start_date,
			end_date: trip.end_date,
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries,
			photo_album_url: trip.photo_album_url
		},
		phases,
		days,
		doneItems: sanitizedItems.filter((i) => i.status === 'done'),
		consideredItems: sanitizedItems.filter(
			(i) => i.status === 'planned' || i.status === 'considered'
		)
	};
};
