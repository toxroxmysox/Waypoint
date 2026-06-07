import type { Trip, Phase, Day, Item } from '$lib/types';

// Pure builder for the Public Archive view model (ADR-0003 §7). Checklists and
// Tasks are deliberately NOT inputs here — the archive excludes operational
// scaffolding + assignee PII. Items are sanitized to display fields only
// (no booked/assignee/costs/confirmation codes).
export function buildArchiveView(trip: Trip, phases: Phase[], days: Day[], items: Item[]) {
	const sanitizedItems = items.map((item) => ({
		id: item.id,
		day: item.day,
		phase: item.phase,
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
}
