/// <reference path="../pb_data/types.d.ts" />
// #133 — member removal is a soft-remove tombstone (ADR-0008, MEMBERSHIP_LIFECYCLE_PRD
// Resolutions 9–15). Add a single `removed_at` date to trip_members:
//
//   removed_at == "" → active member
//   removed_at != "" → tombstone (a "Departed Member")
//
// On removal the hook snapshots the resolved display name into the EXISTING
// `display_name` field, clears `user` (severing access — no membership rule
// matches a cleared user id, so zero collection rules change), and stamps
// `removed_at`. The row is RETAINED so authored money/records keep their identity.
//
// Snapshot field reconciliation: ADR-0008 designates `display_name` (already on
// trip_members since 0003, already read by every historical-record render path)
// as the snapshot target, and its Consequences list ONLY `removed_at` as new.
// The session brief's "name-snapshot field" intent is satisfied by `display_name`
// holding the at-removal snapshot — no redundant column added.
//
// Append-only + additive (fields.add, not a fields[] rebuild), so the system
// created/updated autodate fields on trip_members are preserved (cerebrum
// Do-Not-Repeat [2026-06-08]: explicit-field migrations drop autodate).
migrate(
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.fields.add(
			new DateField({
				name: 'removed_at',
				required: false
			})
		);
		app.save(tripMembers);
	},
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.fields.removeByName('removed_at');
		app.save(tripMembers);
	}
);
