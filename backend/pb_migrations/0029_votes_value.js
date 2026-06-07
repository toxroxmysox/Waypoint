/// <reference path="../pb_data/types.d.ts" />
// Brings the `votes` collection up to CONTEXT.md (glossary: Vote): adds the
// 4-option weighted `value` and lets a member change their own vote.
// 0024 created votes as a binary upvote (no value, no updateRule).
migrate(
	(app) => {
		const votes = app.findCollectionByNameOrId('votes');

		// Store the option *name*; the name→weight map lives in TS (single source of truth).
		votes.fields.add(
			new SelectField({
				name: 'value',
				required: true,
				values: ['love', 'like', 'flexible', 'dislike'],
				maxSelect: 1
			})
		);

		// Allow a member to change their own vote. The unique (item, member) index
		// means a re-vote is an update, not an insert.
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		votes.updateRule = MEMBER_VIA_TRIP + ' && member.user = @request.auth.id';

		app.save(votes);

		// Backfill rows from the binary-upvote era (0024) so no pre-existing vote is
		// left with an empty required `value`. An old upvote was a positive signal →
		// map to `like`. No-op on a fresh table.
		const legacy = app.findRecordsByFilter('votes', "value = ''", '', 0, 0);
		for (const v of legacy) {
			v.set('value', 'like');
			app.save(v);
		}
	},
	(app) => {
		const votes = app.findCollectionByNameOrId('votes');
		votes.fields.removeByName('value');
		votes.updateRule = null;
		app.save(votes);
	}
);
