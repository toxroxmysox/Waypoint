import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase, Day, Item } from '$lib/types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, membership, phases } = await parent();

	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		redirect(303, `/trips/${trip.slug}`);
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'rank'
	});

	const itemTypeCounts = new Map<string, number>();
	for (const item of items) {
		itemTypeCounts.set(item.type, (itemTypeCounts.get(item.type) || 0) + 1);
	}

	return { sourceTrip: trip, phases, items, itemTypeCounts: Object.fromEntries(itemTypeCounts) };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		const sourceTripRecord = await locals.pb
			.collection('trips')
			.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

		const formData = await request.formData();
		const title = formData.get('title')?.toString().trim();
		const startDate = formData.get('start_date')?.toString();
		const endDate = formData.get('end_date')?.toString();
		const includePhases = formData.get('include_phases') === 'on';
		const includeItemTypes = formData.getAll('include_item_types').map((v) => v.toString());

		if (!title) return fail(400, { error: 'Title is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}

		const sourceStart = new Date(
			sourceTripRecord['start_date'].toString().split(/[T ]/)[0] + 'T00:00:00.000Z'
		);
		const targetStart = new Date(startDate + 'T00:00:00.000Z');
		const offsetMs = targetStart.getTime() - sourceStart.getTime();

		function shiftDate(dateStr: string): string {
			const raw = dateStr.split(/[T ]/)[0];
			const d = new Date(raw + 'T00:00:00.000Z');
			d.setTime(d.getTime() + offsetMs);
			return d.toISOString().split('T')[0] + ' 00:00:00.000Z';
		}

		function generateSlug(t: string): string {
			return (
				t
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '') || 'trip'
			);
		}

		try {
			const newTrip = await locals.pb.collection('trips').create({
				title,
				slug: generateSlug(title) + '-' + Date.now().toString(36),
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				timezone: sourceTripRecord['timezone'] || 'UTC',
				location_summary: '',
				countries: [],
				auto_approve_suggestions: sourceTripRecord['auto_approve_suggestions'] ?? true,
				archive_enabled: false,
				archive_publish_after_days: 7,
				archived: false
			});

			await locals.pb.collection('trip_members').create({
				trip: newTrip.id,
				user: locals.user!.id,
				role: 'owner',
				joined_at: new Date().toISOString()
			});

			const phaseIdMap = new Map<string, string>();
			if (includePhases) {
				const sourcePhases = await locals.pb.collection('phases').getFullList<Phase>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'order'
				});
				for (const phase of sourcePhases) {
					const newPhase = await locals.pb.collection('phases').create({
						trip: newTrip.id,
						name: phase.name,
						location: phase.location,
						country_code: phase.country_code,
						start_date: shiftDate(phase.start_date),
						end_date: shiftDate(phase.end_date),
						order: phase.order
					});
					phaseIdMap.set(phase.id, newPhase.id);
				}
			}

			const dayIdMap = new Map<string, string>();
			if (includePhases) {
				const sourceDays = await locals.pb.collection('days').getFullList<Day>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'date'
				});
				for (const day of sourceDays) {
					const newDay = await locals.pb.collection('days').create({
						trip: newTrip.id,
						date: shiftDate(day.date),
						phases: (day.phases ?? []).map((pid) => phaseIdMap.get(pid) || '').filter(Boolean),
						notes: ''
					});
					dayIdMap.set(day.id, newDay.id);
				}
			}

			if (includeItemTypes.length > 0) {
				const sourceItems = await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'rank'
				});
				const membership = await locals.pb
					.collection('trip_members')
					.getFirstListItem(`trip = "${newTrip.id}" && user = "${locals.user!.id}"`);

				for (const item of sourceItems) {
					if (!includeItemTypes.includes(item.type)) continue;
					await locals.pb.collection('items').create({
						trip: newTrip.id,
						phase: phaseIdMap.get(item.phase) || '',
						day: dayIdMap.get(item.day) || '',
						slot: item.slot,
						type: item.type,
						subtype: item.subtype,
						title: item.title,
						description: item.description,
						location_name: item.location_name,
						location_address: item.location_address,
						location_coords: item.location_coords,
						google_place_id: item.google_place_id,
						start_time: item.start_time,
						end_time: item.end_time,
						status: 'planned',
						booked: false,
						confirmation_codes: [],
						reservation_url: '',
						free_cancellation: false,
						cost_estimate_usd: item.cost_estimate_usd,
						cost_actual_usd: 0,
						assigned_to: [],
						rank: item.rank,
						parking_lot_scope: item.parking_lot_scope,
						parent_item: '',
						created_by: membership.id
					});
				}
			}

			redirect(303, `/trips/${newTrip['slug']}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to clone trip.';
			return fail(500, { error: message });
		}
	}
};
