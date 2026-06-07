import type { Trip, Phase, Day, Item, Checklist, Task, TripExport } from '$lib/types';

export function buildTripExport(
	trip: Trip,
	phases: Phase[],
	days: Day[],
	items: Item[],
	budget: TripExport['budget'],
	checklists: Checklist[] = [],
	checklistTasks: Task[] = []
): TripExport {
	const phaseMap = new Map(phases.map((p) => [p.id, p]));
	const dayMap = new Map(days.map((d) => [d.id, d]));

	return {
		_waypoint_version: 1,
		exported_at: new Date().toISOString(),
		trip: {
			title: trip.title,
			slug: trip.slug,
			start_date: trip.start_date,
			end_date: trip.end_date,
			timezone: trip.timezone,
			location_summary: trip.location_summary,
			countries: trip.countries || [],
			photo_album_url: trip.photo_album_url || '',
			archive_enabled: trip.archive_enabled,
			archive_publish_after_days: trip.archive_publish_after_days,
			auto_approve_suggestions: trip.auto_approve_suggestions
		},
		phases: phases.map((p) => ({
			name: p.name,
			location: p.location || '',
			country_code: p.country_code || '',
			start_date: p.start_date || '',
			end_date: p.end_date || '',
			order: p.order
		})),
		days: days.map((d) => {
			const phaseNames = (d.phases || [])
				.map((pid) => phaseMap.get(pid)?.name)
				.filter(Boolean) as string[];
			return {
				date: d.date,
				notes: d.notes || '',
				phase_names: phaseNames
			};
		}),
		items: items.map((item) => {
			const day = item.day ? dayMap.get(item.day) : null;
			const phase = item.phase ? phaseMap.get(item.phase) : null;
			return {
				day_date: day?.date || null,
				phase_name: phase?.name || null,
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
				end_date: item.end_date || null,
				status: item.status,
				booked: item.booked,
				requires_booking: item.requires_booking ?? false,
				confirmation_codes: item.confirmation_codes || [],
				cost_estimate_usd: item.cost_estimate_usd || 0,
				cost_actual_usd: item.cost_actual_usd || 0,
				reservation_url: item.reservation_url || '',
				notes: ''
			};
		}),
		// Only trip/phase-scoped manual lists; item-scoped lists can't re-link on
		// import (items carry no stable id). `assignee` is dropped here.
		checklists: checklists
			.filter((c) => c.kind === 'manual' && !c.item)
			.map((c) => ({
				title: c.title,
				phase_name: c.phase ? (phaseMap.get(c.phase)?.name ?? null) : null,
				tasks: checklistTasks
					.filter((t) => t.checklist === c.id)
					.map((t) => ({ title: t.title, checked: t.checked }))
			})),
		budget
	};
}
