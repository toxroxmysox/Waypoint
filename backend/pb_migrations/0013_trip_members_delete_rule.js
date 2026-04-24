/// <reference path="../pb_data/types.d.ts" />
// 0008 set list/view/update rules on trip_members but omitted deleteRule.
// Without it, any authenticated user could delete any membership record.
migrate(
	(app) => {
		const memberCheckViaTrip =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.deleteRule = memberCheckViaTrip;
		app.save(tripMembers);
	},
	(app) => {
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.deleteRule = null;
		app.save(tripMembers);
	}
);
