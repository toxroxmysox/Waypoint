import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase, Day, Item } from '$lib/types';
import { cloneChecklistPayloads } from '$lib/itinerary/clone-checklists';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { cloneItemPlacement } from '$lib/itinerary/clone-items';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trip, membership, phases } = await parent();

	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		redirect(303, `/trips/${trip.slug}`);
	}

	const items = await locals.pb.collection('items').getFullList<Item>({
		filter: `trip = "${trip.id}"`,
		sort: 'sort_order'
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
				// The trips.pb.js create hook already seeded a day record for every
				// date in newTrip's range (and bucketed phases by date overlap). The
				// unique index idx_days_trip_date(trip,date) means a blind create()
				// for those same dates 500s — the original bug. So FIND-OR-REUSE the
				// seeded day for each source date (idempotent), only creating one if
				// a date is somehow missing. Source `notes` are carried onto it.
				const sourceDays = await locals.pb.collection('days').getFullList<Day>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'date'
				});
				const targetDays = await locals.pb.collection('days').getFullList<Day>({
					filter: `trip = "${newTrip.id}"`,
					sort: 'date'
				});
				const targetByDate = new Map<string, Day>();
				for (const d of targetDays) {
					targetByDate.set(d.date.split(/[T ]/)[0], d);
				}

				for (const day of sourceDays) {
					const shiftedDate = shiftDate(day.date); // 'YYYY-MM-DD 00:00:00.000Z'
					const dateKey = shiftedDate.split(/[T ]/)[0];
					const phaseIds = (day.phases ?? [])
						.map((pid) => phaseIdMap.get(pid) || '')
						.filter(Boolean);

					const existing = targetByDate.get(dateKey);
					if (existing) {
						// Reuse the hook-seeded day; carry source notes (the hook seeds
						// notes empty). Phases are already bucketed by the hook, but set
						// them explicitly from the mapped source phases for fidelity.
						if (day.notes || phaseIds.length > 0) {
							await locals.pb.collection('days').update(existing.id, {
								notes: day.notes || '',
								phases: phaseIds.length > 0 ? phaseIds : existing.phases
							});
						}
						dayIdMap.set(day.id, existing.id);
					} else {
						const newDay = await locals.pb.collection('days').create<Day>({
							trip: newTrip.id,
							date: shiftedDate,
							phases: phaseIds,
							notes: day.notes || ''
						});
						targetByDate.set(dateKey, newDay);
						dayIdMap.set(day.id, newDay.id);
					}
				}
			}

			if (includeItemTypes.length > 0) {
				const sourceItems = await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'sort_order'
				});
				const membership = await locals.pb
					.collection('trip_members')
					.getFirstListItem(`trip = "${newTrip.id}" && user = "${locals.user!.id}" && removed_at = ""`);

				for (const item of sourceItems) {
					if (!includeItemTypes.includes(item.type)) continue;
					// Status/day/phase mapping (#173 + #196 invariant): unplanned ideas
					// stay unplanned (day-less parking); planned/done/considered reset
					// to planned on the future-dated clone — but a planned item whose
					// day didn't resolve falls back to parking, never day-less-but-planned.
					const placement = cloneItemPlacement({
						sourceStatus: item.status,
						mappedDay: dayIdMap.get(item.day) || '',
						mappedPhase: phaseIdMap.get(item.phase) || ''
					});
					// Parking-lot items carry no clock anchor (mirrors pushToParking /
					// move-item): an unscheduled clone is a clean idea, not a timed item
					// stuck in the parking lot.
					const isParked = placement.status === 'unplanned';
					await locals.pb.collection('items').create({
						trip: newTrip.id,
						phase: placement.phase,
						day: placement.day,
						type: item.type,
						subtype: item.subtype,
						title: item.title,
						description: item.description,
						location_name: item.location_name,
						location_address: item.location_address,
						location_coords: item.location_coords,
						google_place_id: item.google_place_id,
						start_time: isParked ? '' : item.start_time,
						end_time: isParked ? '' : item.end_time,
						end_date: !isParked && item.end_date ? shiftDate(item.end_date) : '',
						status: placement.status,
						booked: false,
						confirmation_codes: [],
						reservation_url: '',
						free_cancellation: false,
						cost_estimate_usd: item.cost_estimate_usd,
						cost_actual_usd: 0,
						assigned_to: [],
						sort_order: item.sort_order,
						parent_item: '',
						created_by: membership.id
					});
				}
			}

			// Checklists (templates): copy trip/phase-scoped manual lists with
			// checked reset + assignee dropped; booking Smart List + item-scoped
			// lists are skipped (ADR-0003 §7).
			const { checklists: sourceChecklists, tasks: sourceTasks } = await fetchManualChecklists(
				locals.pb,
				sourceTripRecord.id
			);
			if (sourceChecklists.length > 0) {
				const payloads = cloneChecklistPayloads(
					sourceChecklists,
					sourceTasks,
					phaseIdMap,
					newTrip.id
				);
				for (const { checklist, tasks } of payloads) {
					const newChecklist = await locals.pb.collection('checklists').create(checklist);
					for (const task of tasks) {
						await locals.pb.collection('tasks').create({ ...task, checklist: newChecklist.id });
					}
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
