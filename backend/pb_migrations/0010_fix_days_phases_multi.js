/// <reference path="../pb_data/types.d.ts" />
// Migration 0009 declared days.phases with maxSelect:null, which PB normalized
// to 0 and created as a TEXT column (single-relation). Multi-relation writes
// silently failed. Fix: drop and recreate with maxSelect:999 (→ JSON column),
// then rebucket every day against its trip's phase date ranges.
migrate(
	(app) => {
		const days = app.findCollectionByNameOrId('days');
		const phasesCol = app.findCollectionByNameOrId('phases');

		// Drop the broken phases field if present
		const broken = days.fields.getByName('phases');
		if (broken) {
			days.fields.removeById(broken.id);
			app.save(days);
		}

		// Re-add as proper multi-relation (maxSelect > 1 → JSON column)
		days.fields.add(
			new Field({
				type: 'relation',
				name: 'phases',
				collectionId: phasesCol.id,
				minSelect: 0,
				maxSelect: 999,
				cascadeDelete: false
			})
		);
		app.save(days);

		// Cache phases per trip to avoid N+1
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
			const tripPhases = getPhasesForTrip(tripId);
			const matched = [];
			for (const phase of tripPhases) {
				const pStart = phase.getString('start_date').substring(0, 10);
				const pEnd = phase.getString('end_date').substring(0, 10);
				if (!pStart || !pEnd) continue;
				if (dayDate >= pStart && dayDate <= pEnd) {
					matched.push(phase.id);
				}
			}
			return matched;
		}

		// For every trip: (a) generate any missing days in its date range,
		// (b) rebucket every day against its trip's phases.
		const daysCol = app.findCollectionByNameOrId('days');
		const allTrips = app.findRecordsByFilter('trips', '', '', 0, 0);

		for (const trip of allTrips) {
			const startStr = trip.getString('start_date').substring(0, 10);
			const endStr = trip.getString('end_date').substring(0, 10);
			if (!startStr || !endStr) continue;

			// Existing days keyed by YYYY-MM-DD
			const existingDays = app.findRecordsByFilter(
				'days',
				'trip = {:tripId}',
				'+date',
				0,
				0,
				{ tripId: trip.id }
			);
			const byDate = {};
			for (const d of existingDays) {
				byDate[d.getString('date').substring(0, 10)] = d;
			}

			// Walk trip date range
			const current = new Date(startStr + 'T00:00:00.000Z');
			const end = new Date(endStr + 'T00:00:00.000Z');
			while (current <= end) {
				const iso = current.toISOString().substring(0, 10);
				const matched = matchPhases(trip.id, iso);

				if (byDate[iso]) {
					byDate[iso].set('phases', matched);
					app.save(byDate[iso]);
				} else {
					const day = new Record(daysCol);
					day.set('trip', trip.id);
					day.set('date', iso + ' 00:00:00.000Z');
					day.set('phases', matched);
					app.save(day);
				}
				current.setUTCDate(current.getUTCDate() + 1);
			}
		}
	},
	(app) => {
		// Down: drop the field. (No restore of previous broken state.)
		const days = app.findCollectionByNameOrId('days');
		const f = days.fields.getByName('phases');
		if (f) {
			days.fields.removeById(f.id);
			app.save(days);
		}
	}
);
