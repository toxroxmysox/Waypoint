/// <reference path="../pb_data/types.d.ts" />
// #241 — Wrap-up Slice 3: honest, consensual, owner-controlled publishing.
// (TRIP_WRAPUP_PRD Grill Resolutions 7–10, 17.)
//
// Two new fields on `trips`, the explicit publish gate replacing the leaky
// `end_date + archive_publish_after_days` derivation:
//
//   archive_publish_at  (date, nullable) — the single source of truth for WHEN the
//     public /archive/[token] route opens. Unset ("") = unpublished (the default,
//     and the reopen-pause case: reopen clears it). A past/today date = live; a
//     future date = scheduled. The owner sets this at closeout (binary Keep-private /
//     Publish, with an inline date defaulting to today) or via the standalone
//     "Publish record" control. Legacy `archive_publish_after_days` (0002) is LEFT in
//     place but is NO LONGER the gate — import/export/clone-compat only; it may seed
//     this field when an owner picks "wait N days".
//
//   archive_show_budget (bool, default off) — opt-in public budget summary (Slice 5).
//     When on, the public record shows a trip-total / rough-per-person SUMMARY only,
//     never itemized expenses or who-owes-whom. Default off, consistent with
//     private-by-default. A PB bool field is `false` when unset, so the default is
//     off without an explicit default.
//
// Append-only + additive (fields.add, NOT a fields[] rebuild) so the trips system
// created/updated autodate fields are preserved (cerebrum Do-Not-Repeat [2026-06-08]:
// explicit-field migrations that rebuild `fields` drop the autodate columns).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.add(
			new DateField({
				name: 'archive_publish_at',
				required: false
			})
		);
		trips.fields.add(
			new BoolField({
				name: 'archive_show_budget',
				required: false
			})
		);
		app.save(trips);
	},
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		trips.fields.removeByName('archive_publish_at');
		trips.fields.removeByName('archive_show_budget');
		app.save(trips);
	}
);
