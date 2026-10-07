/// <reference path="../pb_data/types.d.ts" />
// #450 — trip_members.placeholder_email visible to owner/co_owner only.
//
// A placeholder's address was readable by every member (viewers included) via
// plain collection reads. PB rules can't hide one field per role, so the field is
// marked HIDDEN: no REST response (list, view, expand, realtime) ever carries it,
// for any non-superuser. Owner/co_owner read it through
// GET /api/members/placeholder-emails?trip_id= (members.pb.js, admin context).
// Hooks and scripts that FILTER on placeholder_email run as superuser/admin and
// are unaffected. Writes stay locked by the trip_members.pb.js allowlist.
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('trip_members');
		c.fields.getByName('placeholder_email').hidden = true;
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('trip_members');
		c.fields.getByName('placeholder_email').hidden = false;
		app.save(c);
	}
);
