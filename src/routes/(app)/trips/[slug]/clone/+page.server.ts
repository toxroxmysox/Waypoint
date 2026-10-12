import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Phase, Day, Item } from '$lib/types';
import { cloneChecklistPayloads } from '$lib/itinerary/clone-checklists';
import { fetchManualChecklists } from '$lib/itinerary/checklist-loaders';
import { cloneItemPlacement } from '$lib/itinerary/clone-items';
import { shiftStoredDays } from '$lib/shell/trip-time';
import { planImportPhases, importPhaseFields } from '$lib/portability/import';
import { sanitizeItemSpan } from '$lib/itinerary/item-span';

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
		const offsetDays = Math.round(offsetMs / 86_400_000);

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
				// trips.created_by is required (migration 0002) AND the trips.pb.js hook
				// reads it to auto-create the owner trip_members — omitting it both 400s
				// the create ("Cannot be blank") and leaves the trip member-less.
				created_by: locals.user!.id,
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

			// NOTE: do NOT create the owner trip_members here. The trips.pb.js create
			// hook already creates the owner membership for the trip's creator — a manual
			// create duplicates it and violates idx_trip_members_unique(trip,user) →
			// "Failed to create record". Same hook-duplication class as the day-seeding
			// bug (#173): the hook owns it; we just fetch it below for item created_by.

			const phaseIdMap = new Map<string, string>();
			if (includePhases) {
				const sourcePhases = await locals.pb.collection('phases').getFullList<Phase>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'order'
				});
				// Phases tile the trip (ADR-0021) and PB enforces it (#411): the trips
				// create hook already seeded Phase 1 at the trip start, so the first
				// source phase retargets it, the rest are created by shifted start, and a
				// start that can't tile in the new range (a shorter clone) folds into the
				// phase covering that day. Same plan as import.
				const seeded = await locals.pb.collection('phases').getFullList<Phase>({
					filter: `trip = "${newTrip.id}"`,
					sort: 'order'
				});
				const firstPhaseId = seeded[0].id;
				const shifted = sourcePhases.map((p) => ({
					name: p.name,
					location: p.location || '',
					country_code: p.country_code || '',
					notes: p.notes || '',
					start_date: shiftDate(p.start_date),
					end_date: shiftDate(p.end_date),
					order: p.order
				}));
				const sourceIdOf = new Map<object, string>(shifted.map((p, i) => [p, sourcePhases[i].id]));
				const idByStart = new Map<string, string>([[startDate, firstPhaseId]]);
				for (const step of planImportPhases(shifted, startDate, endDate)) {
					const sourceId = sourceIdOf.get(step.phase)!;
					// #401: Phase Notes travel with the phase, as day notes do.
					const fields = importPhaseFields(step.phase);
					if (step.action === 'first') {
						await locals.pb.collection('phases').update(firstPhaseId, fields);
						phaseIdMap.set(sourceId, firstPhaseId);
					} else if (step.action === 'fold') {
						phaseIdMap.set(sourceId, idByStart.get(step.intoStart!) ?? firstPhaseId);
					} else {
						const created = await locals.pb.collection('phases').create({
							trip: newTrip.id,
							...fields,
							start_date: step.start + ' 00:00:00.000Z',
							end_date: endDate + ' 00:00:00.000Z',
							order: 0
						});
						idByStart.set(step.start, created.id);
						phaseIdMap.set(sourceId, created.id);
					}
				}
			}

			const dayIdMap = new Map<string, string>();
			const dayDateById = new Map<string, string>(); // clone day id → 'YYYY-MM-DD'
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
						dayDateById.set(existing.id, dateKey);
					} else {
						const newDay = await locals.pb.collection('days').create<Day>({
							trip: newTrip.id,
							date: shiftedDate,
							phases: phaseIds,
							notes: day.notes || ''
						});
						targetByDate.set(dateKey, newDay);
						dayIdMap.set(day.id, newDay.id);
						dayDateById.set(newDay.id, dateKey);
					}
				}
			}

			if (includeItemTypes.length > 0) {
				const sourceItems = await locals.pb.collection('items').getFullList<Item>({
					filter: `trip = "${sourceTripRecord.id}"`,
					sort: 'sort_order'
				});
				// #411 — a parked item needs a phase: its mapped one, else the clone's first.
				const [firstPhase] = await locals.pb.collection('phases').getFullList<Phase>({
					filter: `trip = "${newTrip.id}"`,
					sort: 'start_date',
					fields: 'id'
				});
				const membership = await locals.pb
					.collection('trip_members')
					.getFirstListItem(
						`trip = "${newTrip.id}" && user = "${locals.user!.id}" && removed_at = ""`
					);

				for (const item of sourceItems) {
					if (!includeItemTypes.includes(item.type)) continue;
					// Status/day/phase mapping (#173 + #196 invariant): unplanned ideas
					// stay unplanned (day-less parking); planned/done/considered reset
					// to planned on the future-dated clone — but a planned item whose
					// day didn't resolve falls back to parking, never day-less-but-planned.
					const placement = cloneItemPlacement({
						sourceStatus: item.status,
						mappedDay: dayIdMap.get(item.day) || '',
						mappedPhase: phaseIdMap.get(item.phase) || '',
						fallbackPhase: firstPhase?.id || ''
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
						// #497 — times shift with the days, or Now sees last year's dates.
						start_time: isParked ? '' : shiftStoredDays(item.start_time, offsetDays),
						end_time: isParked ? '' : shiftStoredDays(item.end_time, offsetDays),
						// #411 — keep the span only where it still holds (after the day, within
						// the clone's range); items.pb.js refuses one that doesn't.
						end_date:
							!isParked && item.end_date
								? sanitizeItemSpan(dayDateById.get(placement.day), shiftDate(item.end_date), endDate)
								: '',
						status: placement.status,
						booked: false,
						confirmation_codes: [],
						reservation_url: '',
						free_cancellation: false,
						cost_estimate_usd: item.cost_estimate_usd,
						cost_actual_usd: 0,
						assigned_to: [],
						not_going: [], // #402 — answers are per-trip, like assigned_to
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
