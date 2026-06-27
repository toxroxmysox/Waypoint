import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Trip, Phase, Day, Item } from '$lib/types';
import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { buildPublicTripExport } from '$lib/portability/export';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { isArchiveVisible } from '$lib/portability/archive-visibility';

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

	// #282: gate export on the SAME explicit `archive_publish_at` source of truth as
	// the page route (`isArchiveVisible`), NOT the retired `end_date +
	// archive_publish_after_days` math (#241/WP-B-019). That derivation leaked the
	// plan when the owner kept-private, reopened/un-published, or scheduled a future
	// date — page went private, export kept serving the full PII-stripped itinerary.
	// `isArchiveVisible` already returns false when `archive_enabled` is off.
	if (!isArchiveVisible(trip)) {
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
