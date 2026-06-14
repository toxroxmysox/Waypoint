import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { buildPublicTripExport } from '$lib/portability/export';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';

// #208 — public "Use as template / Export plan" download. Same gating as the
// archive page (superuser-auth, published-only), but returns a PII-STRIPPED
// plan JSON a non-member can import as their own new trip. No member auth: the
// archive token is the capability. See buildPublicTripExport for the PII scope.
export const GET: RequestHandler = async ({ params }) => {
	const pb = new PocketBase(PUBLIC_PB_URL);
	await pb.collection('_superusers').authWithPassword(env.PB_ADMIN_EMAIL!, env.PB_ADMIN_PASSWORD!);

	let trip: Trip;
	try {
		trip = await pb
			.collection('trips')
			.getFirstListItem<Trip>(pb.filter('public_share_token = {:token}', { token: params.token }));
	} catch {
		error(404, 'Archive not found');
	}

	if (!trip.archive_enabled) {
		error(404, 'Archive not found');
	}

	// Don't let the plan leak before the archive is live (mirrors the page's
	// pre-publish gate — the token is valid but the story isn't public yet).
	const now = new Date();
	const publishDate = new Date(trip.end_date);
	publishDate.setDate(publishDate.getDate() + (trip.archive_publish_after_days || 7));
	if (!trip.archived && now < publishDate) {
		error(404, 'Archive not found');
	}

	const [phases, days, items] = await Promise.all([
		pb.collection('phases').getFullList<Phase>({ filter: `trip = "${trip.id}"`, sort: 'order' }),
		pb.collection('days').getFullList<Day>({ filter: `trip = "${trip.id}"`, sort: 'date' }),
		pb
			.collection('items')
			.getFullList<Item>({ filter: `trip = "${trip.id}"`, sort: 'day,sort_order' })
	]);

	// Trip/phase-scoped manual checklists ride along as reusable templates
	// (assignee already stripped on export); item-scoped + smart lists excluded.
	const { checklists, tasks: checklistTasks } = await fetchManualChecklists(pb, trip.id);

	const exportData = buildPublicTripExport(trip, phases, days, items, checklists, checklistTasks);
	const filename = `waypoint-template-${trip.slug}.json`;

	return new Response(JSON.stringify(exportData, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
