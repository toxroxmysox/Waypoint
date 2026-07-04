/// <reference path="../pb_data/types.d.ts" />
// #272 — Email Digest Phase 1: per-member-per-trip opt-out.
//
// digest_opt_out (bool, default false = digests ON). Surfaced as a toggle on
// the trip Settings page; the digest cron skips members with it set. Default
// ON per the grill resolutions (2026-07-03).
//
// Imperative fields.add API per cerebrum Do-Not-Repeat (0018/0053 scar).
migrate(
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const existing = tripMembers.fields.fieldNames();

		if (existing.indexOf('digest_opt_out') === -1) {
			tripMembers.fields.add(new BoolField({ name: 'digest_opt_out' }));
		}

		app.save(tripMembers);
	},
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		try {
			tripMembers.fields.removeByName('digest_opt_out');
		} catch (_) {}
		app.save(tripMembers);
	}
);
