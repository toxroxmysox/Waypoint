import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { validateTripImport, generateImportSlug } from '$lib/portability/import';

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

		try {
			const trip = await locals.pb.collection('trips').create({
				slug,
				title: importData.trip.title,
				start_date: importData.trip.start_date + ' 00:00:00.000Z',
				end_date: importData.trip.end_date + ' 00:00:00.000Z',
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

			await locals.pb.collection('trip_members').create({
				trip: trip.id,
				user: locals.user!.id,
				display_name: locals.user!.name || locals.user!.email?.split('@')[0] || 'Owner',
				role: 'owner',
				joined_at: new Date().toISOString()
			});

			const phaseMap = new Map<string, string>();
			for (const phase of importData.phases) {
				const created = await locals.pb.collection('phases').create({
					trip: trip.id,
					name: phase.name,
					location: phase.location || '',
					country_code: phase.country_code || '',
					start_date: phase.start_date ? phase.start_date + ' 00:00:00.000Z' : '',
					end_date: phase.end_date ? phase.end_date + ' 00:00:00.000Z' : '',
					order: phase.order
				});
				phaseMap.set(phase.name, created.id);
			}

			const dayMap = new Map<string, string>();
			for (const day of importData.days) {
				const phaseIds = (day.phase_names || [])
					.map((name) => phaseMap.get(name))
					.filter(Boolean) as string[];
				const created = await locals.pb.collection('days').create({
					trip: trip.id,
					phases: phaseIds,
					date: day.date + ' 00:00:00.000Z',
					notes: day.notes || ''
				});
				dayMap.set(day.date, created.id);
			}

			for (const item of importData.items) {
				const phaseId = item.phase_name ? phaseMap.get(item.phase_name) || '' : '';
				const dayId = item.day_date ? dayMap.get(item.day_date) || '' : '';
				const createdItem = await locals.pb.collection('items').create<{ id: string }>({
					trip: trip.id,
					phase: phaseId,
					day: dayId,
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
					end_date: item.end_date || '',
					status: item.status || 'planned',
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
			const message = err instanceof Error ? err.message : 'Failed to import trip.';
			return fail(500, { error: message });
		}
	}
};
