/// <reference path="../pb_data/types.d.ts" />
// #402 (card system spec #418, CARD_SYSTEM D6) — three-state Going.
//
// `assigned_to` lists who is GOING; it can't say "not going". Items gain a
// `not_going` relation list of trip members beside it. No answer = in neither.
// A member is in at most one of the two lists: items.pb.js keeps them exclusive
// on every save (setting one clears the other) and lets a member change only
// their own not going.
//
// Same shape as assigned_to (0006): multi relation → trip_members, maxSelect 50,
// not required, no cascade. A departed member is handled by the members/remove
// hook (MEMBER_RELATION_FIELDS 'block_multi'), exactly like assigned_to.
//
// Append-only + additive (fields.add, not a fields[] rebuild) so the items
// collection keeps its existing fields and autodates.
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		items.fields.add(
			new RelationField({
				name: 'not_going',
				required: false,
				collectionId: tripMembers.id,
				cascadeDelete: false,
				maxSelect: 50
			})
		);
		app.save(items);
	},
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		items.fields.removeByName('not_going');
		app.save(items);
	}
);
