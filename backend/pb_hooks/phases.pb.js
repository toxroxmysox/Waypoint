/// <reference path="../pb_data/types.d.ts" />

// Re-bucket days when phases are created, updated, or deleted.
onRecordCreateRequest('phases', (e) => {
	e.next();
	rebucketDays(e.app, e.record.getString('trip'));
});

onRecordUpdateRequest('phases', (e) => {
	e.next();
	rebucketDays(e.app, e.record.getString('trip'));
});

onRecordDeleteRequest('phases', (e) => {
	const tripId = e.record.getString('trip');
	e.next();
	rebucketDays(e.app, tripId);
});

// For each day in the trip, find the phase whose date range contains it.
// Lower order wins ties. Days outside any phase get phase=null.
function rebucketDays(app, tripId) {
	let days;
	try {
		days = app.findRecordsByFilter(
			'days',
			'trip = {:tripId}',
			'+date',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		return;
	}

	let phases;
	try {
		phases = app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		phases = [];
	}

	for (const day of days) {
		const dayDate = day.getString('date').split('T')[0];
		let matched = null;

		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dayDate >= pStart.split('T')[0] && dayDate <= pEnd.split('T')[0]) {
				matched = phase;
				break; // first match by order wins
			}
		}

		const currentPhase = day.getString('phase');
		const newPhase = matched ? matched.id : '';

		if (currentPhase !== newPhase) {
			day.set('phase', newPhase);
			app.save(day);
		}
	}
}
