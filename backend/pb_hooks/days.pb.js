/// <reference path="../pb_data/types.d.ts" />
// #411 — days update gate. The rule (0014) lets any member PATCH a day; the web UI
// only ever edits a day's `notes` (any non-viewer) and, on clone, its `phases`
// (owner/co_owner, through the user client). This hook narrows REST to exactly
// that: viewers are read-only, travelers may change only `notes`, owner/co_owner
// may change `notes` and `phases`, and nobody changes `date`/`trip` or any field
// added later. Days are created, pruned and rebucketed by the trips/phases hooks
// with admin-context saves (e.app.save), which don't fire request hooks.
//
// PB 0.27 isolated goja runtime: membership lookup inlined. Handler-first.
// getString on both sides (goja reads empty/relation/date fields as objects).
onRecordUpdateRequest((e) => {
	if (e.hasSuperuserAuth()) {
		e.next();
		return;
	}
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const original = e.record.original();
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: original.getString('trip'), uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const role = callerMember.getString('role');
	if (role === 'viewer') throw new ForbiddenError("Viewers can't edit the plan.");

	// Allowlist over the collection's CURRENT fields, so a future field is locked by default.
	const allowed = role === 'owner' || role === 'co_owner' ? ['notes', 'phases'] : ['notes'];
	// getString returns "" for multi-value fields (relation/select slices), so a
	// slice is compared element by element; everything else by its string form.
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
		if (f === 'updated' || allowed.indexOf(f) !== -1) continue;
		if (val(e.record, f) !== val(original, f)) {
			throw new BadRequestError("Only a day's notes can be edited.");
		}
	}

	e.next();
}, 'days');
