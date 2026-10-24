/// <reference path="../pb_data/types.d.ts" />
// ---------------------------------------------------------------------------
// #519 — checked_by must be a member of the checklist item's trip (via its
// item). Checked when checked_by or item changed; onRecordValidate, so admin
// saves too. goja: helpers inlined.
// ---------------------------------------------------------------------------
onRecordValidate((e) => {
	const r = e.record;
	const by = r.getString('checked_by');
	const isNew = r.isNew();
	const changed =
		isNew ||
		by !== r.original().getString('checked_by') ||
		r.getString('item') !== r.original().getString('item');
	if (by && changed) {
		let ok = false;
		try {
			const tripId = e.app.findRecordById('items', r.getString('item')).getString('trip');
			ok = e.app.findRecordById('trip_members', by).getString('trip') === tripId;
		} catch (_) {}
		if (!ok) throw new BadRequestError("That member isn't on this trip.");
	}
	e.next();
}, 'checklist_items');
