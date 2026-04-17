/// <reference path="../pb_data/types.d.ts" />
// Tighten API rules now that all collections exist and back-relations resolve.
migrate(
	(app) => {
		const memberCheck = '@request.auth.id != "" && trip_members_via_trip.user ?= @request.auth.id';
		const memberCheckViaTrip = '@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const memberCheckViaItemTrip = '@request.auth.id != "" && item.trip.trip_members_via_trip.user ?= @request.auth.id';

		// trips: must be a member to list/view/update/delete
		const trips = app.findCollectionByNameOrId('trips');
		trips.listRule = memberCheck;
		trips.viewRule = memberCheck;
		trips.updateRule = memberCheck;
		trips.deleteRule = memberCheck;
		app.save(trips);

		// trip_members: must be a member of the trip
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		tripMembers.listRule = memberCheckViaTrip;
		tripMembers.viewRule = memberCheckViaTrip;
		tripMembers.updateRule = memberCheckViaTrip;
		app.save(tripMembers);

		// phases
		const phases = app.findCollectionByNameOrId('phases');
		phases.listRule = memberCheckViaTrip;
		phases.viewRule = memberCheckViaTrip;
		phases.createRule = memberCheckViaTrip;
		phases.updateRule = memberCheckViaTrip;
		phases.deleteRule = memberCheckViaTrip;
		app.save(phases);

		// days
		const days = app.findCollectionByNameOrId('days');
		days.listRule = memberCheckViaTrip;
		days.viewRule = memberCheckViaTrip;
		days.updateRule = memberCheckViaTrip;
		app.save(days);

		// items
		const items = app.findCollectionByNameOrId('items');
		items.listRule = memberCheckViaTrip;
		items.viewRule = memberCheckViaTrip;
		items.createRule = memberCheckViaTrip;
		items.updateRule = memberCheckViaTrip;
		items.deleteRule = memberCheckViaTrip;
		app.save(items);

		// checklist_items
		const checklistItems = app.findCollectionByNameOrId('checklist_items');
		checklistItems.listRule = memberCheckViaItemTrip;
		checklistItems.viewRule = memberCheckViaItemTrip;
		checklistItems.createRule = memberCheckViaItemTrip;
		checklistItems.updateRule = memberCheckViaItemTrip;
		checklistItems.deleteRule = memberCheckViaItemTrip;
		app.save(checklistItems);
	},
	(app) => {
		// Revert to permissive rules
		const authed = '@request.auth.id != ""';
		const collections = ['trips', 'trip_members', 'phases', 'days', 'items', 'checklist_items'];
		for (const name of collections) {
			const col = app.findCollectionByNameOrId(name);
			col.listRule = authed;
			col.viewRule = authed;
			if (col.createRule !== null) col.createRule = authed;
			col.updateRule = authed;
			if (col.deleteRule !== null) col.deleteRule = authed;
			app.save(col);
		}
	}
);
