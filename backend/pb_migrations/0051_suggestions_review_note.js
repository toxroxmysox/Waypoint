/// <reference path="../pb_data/types.d.ts" />
// #250 / PRD #202 — Contribution Slice 3: reject a ghost with a REQUIRED note.
//
// Adds a single nullable `review_note` (text) to `suggestions`. On reject the
// review endpoint demands a one-line note and stores it here; the
// suggestion_rejected notification carries it to the author. The field is
// nullable at the schema level (the required-note rule is enforced in the
// /api/suggestions/review hook, not as a collection constraint — only rejections
// carry a note; approvals and comments leave it empty).
//
// NUMBERING NOTE: a concurrent Replan-epic agent holds migration 0050 (pre-split
// by the PM). To avoid a colliding migration number, this slice's field lands at
// 0051. If 0050 is unmerged at integration this stays a clean append.
//
// Append-only + additive (fields.add, not a fields[] rebuild) so the system
// created/updated autodate fields on `suggestions` survive — cerebrum
// Do-Not-Repeat [2026-06-08]: an explicit-field rebuild drops autodate.
migrate(
	(app) => {
		const suggestions = app.findCollectionByNameOrId('suggestions');
		suggestions.fields.add(
			new TextField({
				name: 'review_note',
				required: false,
				max: 500
			})
		);
		app.save(suggestions);
	},
	(app) => {
		const suggestions = app.findCollectionByNameOrId('suggestions');
		suggestions.fields.removeByName('review_note');
		app.save(suggestions);
	}
);
