/// <reference path="../pb_data/types.d.ts" />
// M2c: add claimable_by to trip_members.
//
// When a new user signs up with an email matching a placeholder_email on
// trip_members, the members.pb.js users-create hook sets claimable_by = user.id
// on those rows. The /claim interstitial then finds and presents them.
//
// Why not reuse placeholder_email for the runtime lookup? Because the claim
// check happens under user auth, which can't list trip_members (MEMBER_VIA_TRIP
// rule). The hook runs in admin context and writes claimable_by so the
// /api/members/my-claims endpoint can do a single-field lookup.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		tripMembers.fields.add(
			new RelationField({
				name: 'claimable_by',
				collectionId: users.id,
				maxSelect: 1,
				required: false
			})
		);

		app.save(tripMembers);
	},
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const field = tripMembers.fields.getByName('claimable_by');
		if (field) {
			tripMembers.fields.remove(field.id);
			app.save(tripMembers);
		}
	}
);
