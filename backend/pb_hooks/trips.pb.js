/// <reference path="../pb_data/types.d.ts" />

// After trip creation: create owner membership + generate day records.
onRecordCreateRequest('trips', (e) => {
	e.next();

	const trip = e.record;
	const userId = e.auth.id;

	// Create trip_members record for the owner
	const tripMembers = e.app.findCollectionByNameOrId('trip_members');
	const member = new Record(tripMembers);
	member.set('trip', trip.id);
	member.set('user', userId);
	member.set('display_name', e.auth.getString('name') || e.auth.email());
	member.set('role', 'owner');
	member.set('joined_at', new Date().toISOString());
	e.app.save(member);

	// Set created_by on the trip itself
	trip.set('created_by', userId);
	if (!trip.getString('auto_approve_suggestions')) {
		trip.set('auto_approve_suggestions', true);
	}
	if (!trip.getString('status')) {
		trip.set('status', 'planned');
	}
	e.app.save(trip);

	// Generate days
	generateDays(e.app, trip);
});

// After trip update: reconcile days if dates changed.
onRecordUpdateRequest('trips', (e) => {
	const oldStartDate = e.record.original().getString('start_date');
	const oldEndDate = e.record.original().getString('end_date');

	e.next();

	const newStartDate = e.record.getString('start_date');
	const newEndDate = e.record.getString('end_date');

	if (oldStartDate !== newStartDate || oldEndDate !== newEndDate) {
		reconcileDays(e.app, e.record);
	}
});

// Generate day records for every date in the trip's date range.
function generateDays(app, trip) {
	const daysCollection = app.findCollectionByNameOrId('days');
	const startDate = new Date(trip.getString('start_date'));
	const endDate = new Date(trip.getString('end_date'));

	// Get phases for bucketing
	const phases = fetchTripPhases(app, trip.id);

	const current = new Date(startDate);
	while (current <= endDate) {
		const dateStr = current.toISOString().split('T')[0] + ' 00:00:00.000Z';

		const day = new Record(daysCollection);
		day.set('trip', trip.id);
		day.set('date', dateStr);

		// Bucket into phase
		const phase = findPhaseForDate(phases, current);
		if (phase) {
			day.set('phase', phase.id);
		}

		app.save(day);
		current.setUTCDate(current.getUTCDate() + 1);
	}
}

// Reconcile days when trip dates change.
// Keeps existing days within new range, creates missing ones, orphans items on removed days.
function reconcileDays(app, trip) {
	const daysCollection = app.findCollectionByNameOrId('days');
	const startDate = new Date(trip.getString('start_date'));
	const endDate = new Date(trip.getString('end_date'));

	// Get existing days
	const existingDays = app.findRecordsByFilter(
		'days',
		'trip = {:tripId}',
		'-date',
		0,
		0,
		{ tripId: trip.id }
	);

	const existingByDate = {};
	for (const day of existingDays) {
		const d = day.getString('date').split('T')[0];
		existingByDate[d] = day;
	}

	// Build set of needed dates
	const neededDates = {};
	const current = new Date(startDate);
	while (current <= endDate) {
		neededDates[current.toISOString().split('T')[0]] = true;
		current.setUTCDate(current.getUTCDate() + 1);
	}

	// Get phases for bucketing
	const phases = fetchTripPhases(app, trip.id);

	// Create missing days
	for (const dateStr of Object.keys(neededDates)) {
		if (!existingByDate[dateStr]) {
			const day = new Record(daysCollection);
			day.set('trip', trip.id);
			day.set('date', dateStr + ' 00:00:00.000Z');
			const phase = findPhaseForDate(phases, new Date(dateStr));
			if (phase) {
				day.set('phase', phase.id);
			}
			app.save(day);
		}
	}

	// Remove days outside new range, unlink their items first
	for (const [dateStr, day] of Object.entries(existingByDate)) {
		if (!neededDates[dateStr]) {
			// Unlink items from this day
			try {
				const items = app.findRecordsByFilter(
					'items',
					'day = {:dayId}',
					'',
					0,
					0,
					{ dayId: day.id }
				);
				for (const item of items) {
					item.set('day', '');
					item.set('phase', '');
					app.save(item);
				}
			} catch (_) {
				// No items to unlink
			}
			app.delete(day);
		}
	}
}

function fetchTripPhases(app, tripId) {
	try {
		return app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: tripId }
		);
	} catch (_) {
		return [];
	}
}

function findPhaseForDate(phases, date) {
	const dateStr = date.toISOString().split('T')[0];
	for (const phase of phases) {
		const pStart = phase.getString('start_date');
		const pEnd = phase.getString('end_date');
		if (!pStart || !pEnd) continue;
		if (dateStr >= pStart.split('T')[0] && dateStr <= pEnd.split('T')[0]) {
			return phase;
		}
	}
	return null;
}
