/// <reference path="../pb_data/types.d.ts" />
// M3b: expenses collection.
// Any trip member can create and read. Update restricted to the paid_by member.
// Delete restricted to paid_by or trip owner/co_owner (enforced in hook).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const tripMembers = app.findCollectionByNameOrId('trip_members');
		const items = app.findCollectionByNameOrId('items');

		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';

		const collection = new Collection({
			type: 'base',
			name: 'expenses',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'paid_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'number', name: 'amount_usd', required: true, min: 0.01 },
				{ type: 'text', name: 'description', required: true, min: 1, max: 500 },
				{ type: 'date', name: 'date', required: true },
				{
					type: 'select',
					name: 'category',
					values: ['lodging', 'transportation', 'food', 'activity', 'other'],
					maxSelect: 1,
				},
				{ type: 'relation', name: 'linked_item', collectionId: items.id, maxSelect: 1 },
				{
					type: 'select',
					name: 'split_mode',
					required: true,
					values: ['equal', 'by_amount'],
					maxSelect: 1,
				},
				{ type: 'json', name: 'split_data', required: true, maxSize: 10000 },
				{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
			],
			indexes: [
				'CREATE INDEX idx_expenses_trip ON expenses (trip)',
				'CREATE INDEX idx_expenses_trip_date ON expenses (trip, date)',
				'CREATE INDEX idx_expenses_trip_category ON expenses (trip, category)',
				'CREATE INDEX idx_expenses_paid_by ON expenses (paid_by)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			// Only the creator (created_by) can update their own expense.
			updateRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
			// Delete: created_by or owner/co_owner — enforced in hook since PB rules
			// can't express OR between creator and role-based checks cleanly.
			// Allow any trip member here; hook narrows it down.
			deleteRule: MEMBER_VIA_TRIP,
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('expenses');
		app.delete(collection);
	}
);
