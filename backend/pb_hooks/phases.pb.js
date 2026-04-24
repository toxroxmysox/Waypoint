/// <reference path="../pb_data/types.d.ts" />

// Re-bucket days when phases are created, updated, or deleted.
// Each day gets ALL phases whose date range contains it (multi-relation).
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
		const dayDate = day.getString('date').substring(0, 10);
		const matched = [];

		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}

		const current = day.get('phases') || [];
		const currentSorted = [...current].sort().join(',');
		const newSorted = [...matched].sort().join(',');

		if (currentSorted !== newSorted) {
			day.set('phases', matched);
			app.save(day);
		}
	}
}
