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

// ---------------------------------------------------------------------------
// #175 — role gate. Phases are trip-structure: SPEC §4 puts them at the same
// tier as "Create/edit trip metadata" — owner/co_owner only. Travelers and
// viewers are read-only. PB rules stay at MEMBER_VIA_TRIP (membership) because
// phases have no `created_by` field and the acting caller's role can't be
// correlated in a rule for update/delete (multi-relation `?=` aliasing) — so the
// owner/co_owner gate is enforced here, resolving the caller's actual membership.
//
// These role hooks are registered BEFORE the day-rebucket hooks below, so they
// run first in the request chain: a viewer/traveler write throws here (before
// any e.next()), aborting the request, and the rebucket hooks never fire. An
// owner/co_owner write calls e.next(), which cascades into the rebucket hook.
//
// PB 0.27 isolated-sandbox + handler-first signature: membership lookup inlined
// per callback (cerebrum Do-Not-Repeat [2026-06-05]).
onRecordCreateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');
	if (!tripId) throw new BadRequestError('trip is required');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.getString('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can create phases.');
	}

	e.next();
}, 'phases');

onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.getString('role');
	// #401 — Phase Notes are edited like day notes: any non-viewer member. A
	// traveler may change `notes` and nothing else; structure stays owner/co_owner.
	if (role === 'viewer') throw new ForbiddenError("Viewers can't edit the plan.");
	if (role !== 'owner' && role !== 'co_owner') {
		const original = e.record.original();
		const val = (r, f) => {
			const v = r.get(f);
			if (v && typeof v === 'object' && typeof v.length === 'number') {
				const out = [];
				for (let j = 0; j < v.length; j++) out.push('' + v[j]);
				return out.join(',');
			}
			return r.getString(f);
		};
		const fieldNames = e.record.collection().fields.fieldNames();
		for (let i = 0; i < fieldNames.length; i++) {
			const f = '' + fieldNames[i];
			if (f === 'updated' || f === 'notes') continue;
			if (val(e.record, f) !== val(original, f)) {
				throw new ForbiddenError('Only an owner or co-owner can edit phases.');
			}
		}
	}

	e.next();
}, 'phases');

onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const tripId = e.record.get('trip');

	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid}',
			{ tripId: tripId, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.getString('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can delete phases.');
	}

	e.next();
}, 'phases');

// ---------------------------------------------------------------------------
// #411 — phase tiling validation (ADR-0021), for every client, not only the
// SvelteKit phases actions. A new phase's start must split a segment strictly
// inside the trip and not sit on an existing boundary; a moved start must stay
// strictly between its neighbours, and the first phase is pinned to the trip
// start. Messages match validateNewPhaseStart / validateMovePhaseStart
// (src/lib/itinerary/phase-tiling.ts). The record's own end_date / order are
// set here from the tiled layout (client values are ignored) so the response
// is already tiled; siblings are retiled after the save, in the hooks below.
// Registered after the role gate, before the rebucket hooks.
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
	const tripId = e.record.getString('trip');
	let tripRec = null;
	try {
		tripRec = e.app.findRecordById('trips', tripId);
	} catch (_) {}
	const tStart = tripRec ? tripRec.getString('start_date').substring(0, 10) : '';
	const tEnd = tripRec ? tripRec.getString('end_date').substring(0, 10) : '';
	if (!tStart || !tEnd) {
		e.next();
		return;
	}
	const s = e.record.getString('start_date').substring(0, 10);
	let found = [];
	try {
		found = e.app.findRecordsByFilter('phases', 'trip = {:t}', '', 0, 0, { t: tripId });
	} catch (_) {}
	const starts = [];
	for (const p of found) starts.push(p.getString('start_date').substring(0, 10));
	if (found.length > 0) {
		if (s <= tStart) throw new BadRequestError('A new phase must start after the trip begins.');
		if (s >= tEnd) throw new BadRequestError('A new phase must start before the trip ends.');
		if (starts.indexOf(s) !== -1) throw new BadRequestError('A phase already starts on that day.');
	}
	starts.push(s);
	starts.sort();
	const i = starts.indexOf(s);
	e.record.set('end_date', (i < starts.length - 1 ? starts[i + 1] : tEnd) + ' 00:00:00.000Z');
	e.record.set('order', i);
	e.next();
}, 'phases');

onRecordUpdateRequest((e) => {
	const tripId = e.record.getString('trip');
	let tripRec = null;
	try {
		tripRec = e.app.findRecordById('trips', tripId);
	} catch (_) {}
	const tStart = tripRec ? tripRec.getString('start_date').substring(0, 10) : '';
	const tEnd = tripRec ? tripRec.getString('end_date').substring(0, 10) : '';
	if (!tStart || !tEnd) {
		e.next();
		return;
	}
	let found = [];
	try {
		found = e.app.findRecordsByFilter('phases', 'trip = {:t}', '', 0, 0, { t: tripId });
	} catch (_) {}
	const others = [];
	let oldStart = e.record.original().getString('start_date').substring(0, 10);
	for (const p of found) {
		if (p.id === e.record.id) continue;
		others.push(p.getString('start_date').substring(0, 10));
	}
	others.sort();
	const s = e.record.getString('start_date').substring(0, 10);
	if (s !== oldStart) {
		// Position among the CURRENT layout decides the bounds.
		const current = others.concat([oldStart]).sort();
		const idx = current.indexOf(oldStart);
		if (idx === 0) {
			if (s !== tStart)
				throw new BadRequestError('The first phase must start when the trip begins.');
		} else {
			const lower = current[idx - 1];
			const upper = idx < current.length - 1 ? current[idx + 1] : tEnd;
			if (s <= lower || s >= upper) {
				throw new BadRequestError('This phase must start between ' + lower + ' and ' + upper + '.');
			}
		}
	}
	const all = others.concat([s]).sort();
	const i = all.indexOf(s);
	e.record.set('end_date', (i < all.length - 1 ? all[i + 1] : tEnd) + ' 00:00:00.000Z');
	e.record.set('order', i);
	e.next();
}, 'phases');

onRecordCreateRequest((e) => {
	e.next();

	const tripId = e.record.getString('trip');
	// #411 — retile the trip's phases (ADR-0021 boundary model) before
	// bucketing: sort by start, the first starts at the trip start, each end is
	// the next start (the shared travel day), the last ends at the trip end,
	// order = position. Sibling writes use e.app.save, which fires no request
	// hooks (no recursion), and only when something differs.
	{
		let tripRec = null;
		try {
			tripRec = e.app.findRecordById('trips', tripId);
		} catch (_) {}
		const tStart = tripRec ? tripRec.getString('start_date').substring(0, 10) : '';
		const tEnd = tripRec ? tripRec.getString('end_date').substring(0, 10) : '';
		if (tStart && tEnd) {
			let found = [];
			try {
				found = e.app.findRecordsByFilter('phases', 'trip = {:t}', '', 0, 0, { t: tripId });
			} catch (_) {}
			const ps = [];
			for (const p of found) ps.push(p);
			const startOf = (p) => p.getString('start_date').substring(0, 10);
			ps.sort((a, b) => (startOf(a) < startOf(b) ? -1 : startOf(a) > startOf(b) ? 1 : 0));
			const starts = ps.map((p, i) => (i === 0 ? tStart : startOf(p)));
			for (let i = 0; i < ps.length; i++) {
				const end = i < ps.length - 1 ? starts[i + 1] : tEnd;
				const p = ps[i];
				if (
					startOf(p) === starts[i] &&
					p.getString('end_date').substring(0, 10) === end &&
					p.getInt('order') === i
				)
					continue;
				p.set('start_date', starts[i] + ' 00:00:00.000Z');
				p.set('end_date', end + ' 00:00:00.000Z');
				p.set('order', i);
				e.app.save(p);
			}
		}
	}

	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, {
			tripId: tripId
		});
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10))
				matched.push(phase.id);
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
	// #411 — retile the trip's phases (ADR-0021 boundary model) before
	// bucketing: sort by start, the first starts at the trip start, each end is
	// the next start (the shared travel day), the last ends at the trip end,
	// order = position. Sibling writes use e.app.save, which fires no request
	// hooks (no recursion), and only when something differs.
	{
		let tripRec = null;
		try {
			tripRec = e.app.findRecordById('trips', tripId);
		} catch (_) {}
		const tStart = tripRec ? tripRec.getString('start_date').substring(0, 10) : '';
		const tEnd = tripRec ? tripRec.getString('end_date').substring(0, 10) : '';
		if (tStart && tEnd) {
			let found = [];
			try {
				found = e.app.findRecordsByFilter('phases', 'trip = {:t}', '', 0, 0, { t: tripId });
			} catch (_) {}
			const ps = [];
			for (const p of found) ps.push(p);
			const startOf = (p) => p.getString('start_date').substring(0, 10);
			ps.sort((a, b) => (startOf(a) < startOf(b) ? -1 : startOf(a) > startOf(b) ? 1 : 0));
			const starts = ps.map((p, i) => (i === 0 ? tStart : startOf(p)));
			for (let i = 0; i < ps.length; i++) {
				const end = i < ps.length - 1 ? starts[i + 1] : tEnd;
				const p = ps[i];
				if (
					startOf(p) === starts[i] &&
					p.getString('end_date').substring(0, 10) === end &&
					p.getInt('order') === i
				)
					continue;
				p.set('start_date', starts[i] + ' 00:00:00.000Z');
				p.set('end_date', end + ' 00:00:00.000Z');
				p.set('order', i);
				e.app.save(p);
			}
		}
	}

	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, {
			tripId: tripId
		});
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10))
				matched.push(phase.id);
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

	// #217 — a trip must always have at least one phase. Block deleting the
	// LAST remaining phase of its trip. Counted BEFORE e.next() so the throw
	// aborts the delete (a throw after e.next() is too late — bug-114). Inlined
	// per the goja isolated-sandbox constraint documented above.
	let phaseCount = 0;
	try {
		const tripPhases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '', 0, 0, {
			tripId: tripId
		});
		phaseCount = tripPhases.length;
	} catch (_) {
		phaseCount = 0;
	}
	if (phaseCount <= 1) {
		throw new BadRequestError(
			'A trip must have at least one phase. Add another phase before deleting this one.'
		);
	}

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

	// #411 — retile the trip's phases (ADR-0021 boundary model) before
	// bucketing: sort by start, the first starts at the trip start, each end is
	// the next start (the shared travel day), the last ends at the trip end,
	// order = position. Sibling writes use e.app.save, which fires no request
	// hooks (no recursion), and only when something differs.
	{
		let tripRec = null;
		try {
			tripRec = e.app.findRecordById('trips', tripId);
		} catch (_) {}
		const tStart = tripRec ? tripRec.getString('start_date').substring(0, 10) : '';
		const tEnd = tripRec ? tripRec.getString('end_date').substring(0, 10) : '';
		if (tStart && tEnd) {
			let found = [];
			try {
				found = e.app.findRecordsByFilter('phases', 'trip = {:t}', '', 0, 0, { t: tripId });
			} catch (_) {}
			const ps = [];
			for (const p of found) ps.push(p);
			const startOf = (p) => p.getString('start_date').substring(0, 10);
			ps.sort((a, b) => (startOf(a) < startOf(b) ? -1 : startOf(a) > startOf(b) ? 1 : 0));
			const starts = ps.map((p, i) => (i === 0 ? tStart : startOf(p)));
			for (let i = 0; i < ps.length; i++) {
				const end = i < ps.length - 1 ? starts[i + 1] : tEnd;
				const p = ps[i];
				if (
					startOf(p) === starts[i] &&
					p.getString('end_date').substring(0, 10) === end &&
					p.getInt('order') === i
				)
					continue;
				p.set('start_date', starts[i] + ' 00:00:00.000Z');
				p.set('end_date', end + ' 00:00:00.000Z');
				p.set('order', i);
				e.app.save(p);
			}
		}
	}

	let days;
	try {
		days = e.app.findRecordsByFilter('days', 'trip = {:tripId}', '+date', 0, 0, { tripId: tripId });
	} catch (_) {
		return;
	}
	let phases;
	try {
		phases = e.app.findRecordsByFilter('phases', 'trip = {:tripId}', '+order', 0, 0, {
			tripId: tripId
		});
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
			if (dayDate >= pStart.substring(0, 10) && dayDate <= pEnd.substring(0, 10))
				matched.push(phase.id);
		}
		const current = day.get('phases') || [];
		if ([...current].sort().join(',') !== [...matched].sort().join(',')) {
			day.set('phases', matched);
			e.app.save(day);
		}
	}
}, 'phases');
