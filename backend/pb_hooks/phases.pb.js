/// <reference path="../pb_data/types.d.ts" />

// Re-bucket days when phases are created, updated, or deleted.
// Each day gets ALL phases whose date range contains it (multi-relation).
//
// IMPORTANT: PocketBase's JS hook runtime executes each callback in a pooled
// goja runtime that does NOT have access to functions/variables defined at
// file scope. The rebucket logic must therefore be fully inlined into every
// callback body (same constraint trips.pb.js documents). A previous version
// called a file-scope `rebucketDays()` helper, which threw a silently-
// swallowed ReferenceError after e.next() — so days were never bucketed.

onRecordCreateRequest((e) => {
	e.next();

	const tripId = e.record.getString('trip');
	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');

onRecordUpdateRequest((e) => {
	e.next();

	const tripId = e.record.getString('trip');
	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');

onRecordDeleteRequest((e) => {
	const tripId = e.record.getString('trip');

	// #196 — block-until-moved: a phase still holding unplanned ("idea") items
	// cannot be deleted. items.phase has no cascadeDelete, so PB would clear
	// item.phase and strand those ideas in phase-less limbo (renderable on no
	// surface). Force the owner to re-home them first. Counted BEFORE e.next()
	// so the throw aborts the delete (a throw after e.next() is too late —
	// bug-114 / cerebrum). Planned items keep their day and survive a phase
	// delete fine, so only status=unplanned blocks.
	let orphanCount = 0;
	try {
		const stranded = e.app.findRecordsByFilter(
			'items',
			'phase = {:phaseId} && status = "unplanned"',
			'',
			0,
			0,
			{ phaseId: e.record.id }
		);
		orphanCount = stranded.length;
	} catch (_) {
		orphanCount = 0;
	}
	if (orphanCount > 0) {
		throw new BadRequestError(
			'Move ' +
				orphanCount +
				' idea' +
				(orphanCount === 1 ? '' : 's') +
				' out of this phase before deleting it.'
		);
	}

	e.next();

	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, { tripId: tripId });
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10)) matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');
