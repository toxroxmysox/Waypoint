import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	validateTripImport,
	generateImportSlug,
	planImportPhases,
	resolveImportItemStatus
} from '$lib/portability/import';
import { applyRetile } from '$lib/itinerary/phase-tiling.server';
import type { Day, Phase } from '$lib/types';

export const load: PageServerLoad = async () => {
	return {};
};

export const actions: Actions = {
	import: async ({ request, locals }) => {
		const data = await request.formData();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0) {
			return fail(400, { error: 'Please select a JSON file.' });
		}

		if (file.size > 10 * 1024 * 1024) {
			return fail(400, { error: 'File too large (max 10MB).' });
		}

		let parsed: unknown;
		try {
			const text = await file.text();
			parsed = JSON.parse(text);
		} catch {
			return fail(400, { error: 'Invalid JSON file.' });
		}

		const validation = validateTripImport(parsed);
		if (!validation.valid || !validation.data) {
			return fail(400, { error: validation.errors.join('; ') });
		}

		const importData = validation.data;
		const slug = generateImportSlug(importData.trip.title);
		const tripStart = importData.trip.start_date.slice(0, 10);
		const tripEnd = importData.trip.end_date.slice(0, 10);

		let tripId = '';
		try {
			// #410: the trips.pb.js create hook seeds the owner membership, a "Phase 1"
			// spanning the trip and a day for every date. Import must BUILD ON that
			// seed (like clone does) — creating its own owner row 403s (createRule
			// null) and its own days collide with idx_days_trip_date(trip,date).
			const trip = await locals.pb.collection('trips').create({
				slug,
				title: importData.trip.title,
				start_date: tripStart + ' 00:00:00.000Z',
				end_date: tripEnd + ' 00:00:00.000Z',
				timezone: importData.trip.timezone || '',
				location_summary: importData.trip.location_summary || '',
				countries: importData.trip.countries || [],
				photo_album_url: importData.trip.photo_album_url || '',
				archive_enabled: false,
				archive_publish_after_days: importData.trip.archive_publish_after_days || 7,
				auto_approve_suggestions: importData.trip.auto_approve_suggestions ?? true,
				created_by: locals.user!.id,
				archived: false
			});
			tripId = trip.id;

			// Phases tile the trip (ADR-0021): the first phase is pinned to the trip
			// start, every other phase is defined by a unique start strictly inside
			// the trip, and ends are derived. Retarget the seeded Phase 1 as the
			// first imported phase, create the rest by start, then retile. A phase
			// whose start can't tile (outside the trip / duplicate start) folds into
			// the phase covering that day, so its items still land somewhere sensible.
			const seeded = await locals.pb.collection('phases').getFullList<Phase>({
				filter: `trip = "${trip.id}"`,
				sort: 'order'
			});
			const firstPhaseId = seeded[0].id;
			const phaseMap = new Map<string, string>(); // imported name → phase id
			const idByStart = new Map<string, string>([[tripStart, firstPhaseId]]); // planned start → phase id
			for (const [i, step] of planImportPhases(importData.phases, tripStart, tripEnd).entries()) {
				const { phase } = step;
				const fields = {
					name: phase.name,
					location: phase.location || '',
					country_code: phase.country_code || ''
				};
				if (step.action === 'first') {
					await locals.pb.collection('phases').update(firstPhaseId, fields);
					phaseMap.set(phase.name, firstPhaseId);
				} else if (step.action === 'fold') {
					phaseMap.set(phase.name, idByStart.get(step.intoStart!) ?? firstPhaseId);
				} else {
					const created = await locals.pb.collection('phases').create({
						trip: trip.id,
						...fields,
						start_date: step.start + ' 00:00:00.000Z',
						end_date: tripEnd + ' 00:00:00.000Z',
						order: i
					});
					idByStart.set(step.start, created.id);
					phaseMap.set(phase.name, created.id);
				}
			}
			await applyRetile(locals.pb, trip.id, tripEnd);

			// Days: reuse the hook-seeded day for each date (phases were bucketed by
			// the phases hooks during retile); carry the imported notes onto it.
			const seededDays = await locals.pb.collection('days').getFullList<Day>({
				filter: `trip = "${trip.id}"`,
				sort: 'date'
			});
			const dayMap = new Map<string, Day>(); // 'YYYY-MM-DD' → seeded day
			for (const d of seededDays) dayMap.set(d.date.slice(0, 10), d);
			for (const day of importData.days) {
				const seededDay = dayMap.get(day.date.slice(0, 10));
				if (seededDay && day.notes) {
					await locals.pb.collection('days').update(seededDay.id, { notes: day.notes });
				}
			}

			for (const item of importData.items) {
				const day = item.day_date ? dayMap.get(item.day_date.slice(0, 10)) : undefined;
				// Every item belongs to a phase: the named one, else its day's first
				// phase, else the trip's first phase. A dated status needs a day —
				// an item whose day didn't resolve parks as an unplanned idea.
				const phaseId =
					(item.phase_name && phaseMap.get(item.phase_name)) || day?.phases?.[0] || firstPhaseId;
				const status = resolveImportItemStatus(item.status, !!day);
				const createdItem = await locals.pb.collection('items').create<{ id: string }>({
					trip: trip.id,
					phase: phaseId,
					day: day?.id ?? '',
					type: item.type,
					subtype: item.subtype || '',
					title: item.title,
					description: item.description || '',
					location_name: item.location_name || '',
					location_address: item.location_address || '',
					location_coords: item.location_coords || null,
					google_place_id: item.google_place_id || '',
					start_time: item.start_time || null,
					end_time: item.end_time || null,
					start_tz: item.start_tz || '',
					end_tz: item.end_tz || '',
					flight_number: item.flight_number || '',
					end_date: item.end_date || '',
					status,
					booked: item.booked || false,
					requires_booking: item.requires_booking || false,
					// #268 / ADR-0016 — codes import as `kind: 'code'` Documents (below),
					// not on the item. The legacy json field stays inert.
					cost_estimate_usd: item.cost_estimate_usd || 0,
					cost_actual_usd: item.cost_actual_usd || 0,
					reservation_url: item.reservation_url || '',
					notes: item.notes || '',
					order: 0
				});

				// #268 / ADR-0016 — re-create the item's confirmation codes as code
				// Documents. Through locals.pb so the documents create hook pins
				// uploaded_by to the importing owner + the XOR guard applies.
				for (const code of item.confirmation_codes || []) {
					const value = (code?.value ?? '').trim();
					if (!value) continue;
					await locals.pb.collection('documents').create({
						kind: 'code',
						trip: trip.id,
						item: createdItem.id,
						code_label: (code?.label ?? '').trim(),
						code_value: value
					});
				}
			}

			// Checklists + tasks (ADR-0003 §7). Re-link phase via phase_name;
			// trip-level when null. `assignee` is not imported (was stripped on export).
			for (const [ci, cl] of (importData.checklists || []).entries()) {
				const phaseId = cl.phase_name ? phaseMap.get(cl.phase_name) || '' : '';
				const newChecklist = await locals.pb.collection('checklists').create({
					trip: trip.id,
					phase: phaseId,
					item: '',
					title: cl.title,
					kind: 'manual',
					order: ci
				});
				for (const [ti, task] of (cl.tasks || []).entries()) {
					await locals.pb.collection('tasks').create({
						checklist: newChecklist.id,
						title: task.title,
						checked: task.checked ?? false,
						order: ti
					});
				}
			}

			redirect(303, `/trips/${slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			// Never leave a half-built trip behind (#410) — each failed attempt used
			// to strand an empty trip under a fresh slug.
			if (tripId) {
				try {
					await locals.pb.collection('trips').delete(tripId);
				} catch {
					// Best effort; the original error is what the user needs.
				}
			}
			const message = err instanceof Error ? err.message : 'Failed to import trip.';
			return fail(500, { error: message });
		}
	}
};
