/// <reference path="../pb_data/types.d.ts" />
// #409 — pending_invites list/view → superuser only.
//
// 0015 gave every trip member (viewers included) list/view on pending_invites,
// so any member token could read every invitee's `email` and the live invite
// `code` straight off PB REST. #352 kept the address off the members PAGE, but
// the page itself read the collection with the caller's token, and the rows still
// carried both fields over the wire.
//
// Reads now go through GET /api/invites/pending (invites.pb.js), which resolves a
// display label per invite (name / the inviter's own typed address / masked) and
// never returns `email` or `code`. Every other reader already runs in admin
// context. create/update stay null; delete keeps its member rule + the revoke
// hook (owner/co_owner any, traveler own, viewer never).
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('pending_invites');
		c.listRule = null;
		c.viewRule = null;
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('pending_invites');
		const member = '@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		c.listRule = member;
		c.viewRule = member;
		app.save(c);
	}
);
