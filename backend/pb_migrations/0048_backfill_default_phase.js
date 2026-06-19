/// <reference path="../pb_data/types.d.ts" />
// #217 — a trip must always have at least one phase. The trips.pb.js after-create
// hook now auto-seeds a default "Trip" phase, and phases.pb.js blocks deleting the
// last remaining phase. This migration backfills the invariant for trips that
// already exist with ZERO phases: each gets a single "Trip" phase spanning its
// full date range, and that trip's days are re-bucketed into the new phase (days
// for a phase-less trip currently carry an empty `phases` multi-relation — the
// same day↔phase overlap logic the hooks use, inlined here).
//
// IDEMPOTENT: a trip is touched ONLY when it currently has zero phases, so a
// re-run (or a trip created post-hook, which already has its "Trip" phase) is a
// no-op. Down is a no-op — this migration only adds rows; it does not delete the
// backfilled phases (consistent with 0011/0012's append-only down).
//
// NOTE: phases has NO `created_by` field (schema 0004) — set trip + name +
// start/end + order, matching the hook and trips/new. Dates are stored in PB's
// `YYYY-MM-DD 00:00:00.000Z` form.
migrate(
	(app) => {
		const phasesCol = app.findCollectionByNameOrId('phases');

		const trips = app.findRecordsByFilter('trips', '', '', 0, 0);
		for (const trip of trips) {
			const startStr = trip.getString('start_date').substring(0, 10);
			const endStr = trip.getString('end_date').substring(0, 10);
			if (!startStr || !endStr) continue;

			// Only backfill trips that currently have NO phases (idempotent).
			let existingPhases = [];
			try {
				existingPhases = app.findRecordsByFilter(
					'phases',
					'trip = {:tripId}',
					'',
					0,
					0,
					{ tripId: trip.id }
				);
			} catch (_) {
				existingPhases = [];
			}
			if (existingPhases.length > 0) continue;

			// Seed the default "Trip" phase spanning the whole trip.
			const phase = new Record(phasesCol);
			phase.set('trip', trip.id);
			phase.set('name', 'Trip');
			phase.set('start_date', startStr + ' 00:00:00.000Z');
			phase.set('end_date', endStr + ' 00:00:00.000Z');
			phase.set('order', 0);
			app.save(phase);

			// Re-bucket this trip's days into the new phase by date-range overlap
			// (mirrors the rebucket in phases.pb.js / the seed in trips.pb.js).
			let days = [];
			try {
				days = app.findRecordsByFilter(
					'days',
					'trip = {:tripId}',
					'+date',
					0,
					0,
					{ tripId: trip.id }
				);
			} catch (_) {
				days = [];
			}
			const pStart = phase.getString('start_date').substring(0, 10);
			const pEnd = phase.getString('end_date').substring(0, 10);
			for (const day of days) {
				const dayDate = day.getString('date').substring(0, 10);
				if (dayDate >= pStart && dayDate <= pEnd) {
					const current = day.get('phases') || [];
					const matched = [phase.id];
					if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
						day.set('phases', matched);
						app.save(day);
					}
				}
			}
		}
	},
	(app) => {
		// No-op down: this migration only adds rows (append-only, cf. 0011/0012).
	}
);
