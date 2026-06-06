/// <reference path="../pb_data/types.d.ts" />

// After trip creation: add creator as owner + generate day records.
// Callback in PocketBase's JS hook runtime doesn't see outer-file helpers
// (isolated sandbox). Logic is inlined here for that reason.
onRecordAfterCreateSuccess((e) => {
	// --- Auto-add creator as owner ---
	const createdBy = e.record.get('created_by');
	if (createdBy) {
		const members = e.app.findCollectionByNameOrId('trip_members');
		const membership = new Record(members);
		membership.set('trip', e.record.id);
		membership.set('user', createdBy);
		membership.set('role', 'owner');
		membership.set(
			'joined_at',
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z'
		);
		e.app.save(membership);
	}

	// --- Generate day records for every date in the trip's range ---
	const rawStart = e.record.getString('start_date');
	const rawEnd = e.record.getString('end_date');
	if (!rawStart || !rawEnd) {
		e.next();
		return;
	}

	const daysCollection = e.app.findCollectionByNameOrId('days');

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	const startDate = new Date(rawStart.substring(0, 10) + 'T00:00:00.000Z');
	const endDate = new Date(rawEnd.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(startDate);
	while (current <= endDate) {
		const isoDay = current.toISOString().substring(0, 10);
		const dateStr = isoDay + ' 00:00:00.000Z';

		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr);

		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (isoDay >= pStart.substring(0, 10) && isoDay <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) {
			day.set('phases', matched);
		}

		e.app.save(day);
		current.setUTCDate(current.getUTCDate() + 1);
	}

	e.next();
}, 'trips');

// After trip update: reconcile days if dates changed.
onRecordUpdateRequest((e) => {
	const oldStartDate = e.record.original().getString('start_date');
	const oldEndDate = e.record.original().getString('end_date');

	e.next();

	const newStartDate = e.record.getString('start_date');
	const newEndDate = e.record.getString('end_date');

	if (oldStartDate === newStartDate && oldEndDate === newEndDate) return;

	// --- Reconcile days (inlined for same sandbox reasons) ---
	if (!newStartDate || !newEndDate) return;

	const daysCollection = e.app.findCollectionByNameOrId('days');

	const existingDays = e.app.findRecordsByFilter(
		'days',
		'trip = {:tripId}',
		'-date',
		0,
		0,
		{ tripId: e.record.id }
	);
	const existingByDate = {};
	for (const day of existingDays) {
		existingByDate[day.getString('date').substring(0, 10)] = day;
	}

	const neededDates = {};
	const start = new Date(newStartDate.substring(0, 10) + 'T00:00:00.000Z');
	const end = new Date(newEndDate.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(start);
	while (current <= end) {
		neededDates[current.toISOString().substring(0, 10)] = true;
		current.setUTCDate(current.getUTCDate() + 1);
	}

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	// Create missing days
	for (const dateStr of Object.keys(neededDates)) {
		if (existingByDate[dateStr]) continue;
		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr + ' 00:00:00.000Z');
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dateStr >= pStart.substring(0, 10) && dateStr <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) day.set('phases', matched);
		e.app.save(day);
	}

	// Remove days outside the new range; unlink their items first so items
	// become unscheduled rather than deleted.
	for (const [dateStr, day] of Object.entries(existingByDate)) {
		if (neededDates[dateStr]) continue;
		try {
			const items = e.app.findRecordsByFilter(
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
				e.app.save(item);
			}
		} catch (_) {
			// No items to unlink
		}
		e.app.delete(day);
	}
}, 'trips');
