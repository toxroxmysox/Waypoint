/// <reference path="../pb_data/types.d.ts" />
// Idempotent backfill for any trip still missing day records. The trip create
// hook was silently failing on a duplicate trip_members save and never reaching
// generateDays — fixed in trips.pb.js. This migration patches any trips already
// created while the bug was live (e.g. Spain 2025). Same pattern as 0011.
migrate(
	(app) => {
		const daysCol = app.findCollectionByNameOrId('days');

		const phasesByTrip = {};
		function getPhasesForTrip(tripId) {
			if (!phasesByTrip[tripId]) {
				try {
					phasesByTrip[tripId] = app.findRecordsByFilter(
						'phases',
						'trip = {:tripId}',
						'+order',
						0,
						0,
						{ tripId: tripId }
					);
				} catch (_) {
					phasesByTrip[tripId] = [];
				}
			}
			return phasesByTrip[tripId];
		}

		function matchPhases(tripId, dayDate) {
			const matched = [];
			for (const phase of getPhasesForTrip(tripId)) {
				const pStart = phase.getString('start_date').substring(0, 10);
				const pEnd = phase.getString('end_date').substring(0, 10);
				if (!pStart || !pEnd) continue;
				if (dayDate >= pStart && dayDate <= pEnd) {
					matched.push(phase.id);
				}
			}
			return matched;
		}

		const trips = app.findRecordsByFilter('trips', '', '', 0, 0);
		for (const trip of trips) {
			const startStr = trip.getString('start_date').substring(0, 10);
			const endStr = trip.getString('end_date').substring(0, 10);
			if (!startStr || !endStr) continue;

			const existing = app.findRecordsByFilter(
				'days',
				'trip = {:tripId}',
				'+date',
				0,
				0,
				{ tripId: trip.id }
			);
			const haveDate = new Set();
			for (const d of existing) haveDate.add(d.getString('date').substring(0, 10));

			const current = new Date(startStr + 'T00:00:00.000Z');
			const end = new Date(endStr + 'T00:00:00.000Z');
			while (current <= end) {
				const iso = current.toISOString().substring(0, 10);
				if (!haveDate.has(iso)) {
					const day = new Record(daysCol);
					day.set('trip', trip.id);
					day.set('date', iso + ' 00:00:00.000Z');
					day.set('phases', matchPhases(trip.id, iso));
					app.save(day);
				}
				current.setUTCDate(current.getUTCDate() + 1);
			}
		}
	},
	(app) => {
		// No-op down.
	}
);
