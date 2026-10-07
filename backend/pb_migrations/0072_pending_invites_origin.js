/// <reference path="../pb_data/types.d.ts" />
// #449 — record how each pending invite was created.
//
// GET /api/invites/pending used to label an invite with its full address
// whenever the caller was the inviter. That is only safe when the inviter TYPED
// the address. A picker invite (POST /api/invites/create-for-user, #352) is
// addressed by user id: the server reads the email and the inviter never sees
// it. Once the picked person left every trip they shared with the inviter, the
// co-traveler-name branch stopped matching and the route handed the inviter the
// address they were never shown (the #352 leak, again).
//
//   origin       'typed'  — POST /api/invites/create (the inviter typed it)
//                'picked' — POST /api/invites/create-for-user (picked by name)
//                ''       — written before this migration; how it was made is
//                           unknown, so readers treat it as NOT typed.
//   picked_name  the name the inviter picked (account name, else the shared-trip
//                nickname), captured at creation so the label survives the
//                pair no longer sharing a trip. Empty for typed invites.
//
// Both optional: rows written before this migration stay valid, and no backfill
// guesses an origin it can't know. pending_invites stays superuser-read (0070),
// so neither field is readable over REST; the pending route never returns them.
//
// Append-only + additive (fields.add) so 0069's created/updated autodates stay.
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('pending_invites');
		if (!c.fields.getByName('origin')) {
			c.fields.add(
				new SelectField({
					name: 'origin',
					required: false,
					maxSelect: 1,
					values: ['typed', 'picked']
				})
			);
		}
		if (!c.fields.getByName('picked_name')) {
			c.fields.add(new TextField({ name: 'picked_name', required: false, max: 200 }));
		}
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('pending_invites');
		c.fields.removeByName('origin');
		c.fields.removeByName('picked_name');
		app.save(c);
	}
);
