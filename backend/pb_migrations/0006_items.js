/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const phases = app.findCollectionByNameOrId('phases');
		const days = app.findCollectionByNameOrId('days');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const collection = new Collection({
			type: 'base',
			name: 'items',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'phase', collectionId: phases.id, maxSelect: 1 },
				{ type: 'relation', name: 'day', collectionId: days.id, maxSelect: 1 },
				{ type: 'select', name: 'slot', values: ['morning', 'afternoon', 'evening', 'anytime'], maxSelect: 1 },
				{
					type: 'select',
					name: 'type',
					required: true,
					values: ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist'],
					maxSelect: 1,
				},
				{ type: 'text', name: 'subtype', max: 50 },
				{ type: 'text', name: 'title', required: true, min: 1, max: 300 },
				{ type: 'text', name: 'description', max: 5000 },
				{ type: 'text', name: 'location_name', max: 300 },
				{ type: 'text', name: 'location_address', max: 500 },
				{ type: 'json', name: 'location_coords', maxSize: 200 },
				{ type: 'text', name: 'google_place_id', max: 300 },
				{ type: 'date', name: 'start_time' },
				{ type: 'date', name: 'end_time' },
				{ type: 'text', name: 'start_tz', max: 50 },
				{ type: 'text', name: 'end_tz', max: 50 },
				{ type: 'select', name: 'status', values: ['planned', 'done'], maxSelect: 1 },
				{ type: 'bool', name: 'booked' },
				{ type: 'relation', name: 'booked_by', collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'relation', name: 'paid_by', collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'json', name: 'confirmation_codes', maxSize: 5000 },
				{ type: 'url', name: 'reservation_url' },
				{ type: 'bool', name: 'free_cancellation' },
				{ type: 'number', name: 'cost_estimate_usd', min: 0 },
				{ type: 'number', name: 'cost_actual_usd', min: 0 },
				{ type: 'relation', name: 'assigned_to', collectionId: tripMembers.id, maxSelect: 50 },
				{ type: 'number', name: 'rank', min: 0 },
				{
					type: 'select',
					name: 'parking_lot_scope',
					values: ['none', 'trip', 'phase', 'day'],
					maxSelect: 1,
				},
				{ type: 'relation', name: 'created_by', collectionId: tripMembers.id, maxSelect: 1 },
			],
			indexes: [
				'CREATE INDEX idx_items_trip_day_slot ON items (trip, day, slot)',
				'CREATE INDEX idx_items_trip_phase ON items (trip, phase)',
				'CREATE INDEX idx_items_trip_type ON items (trip, type)',
			],
			// Permissive rules initially; tightened in 0008
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != ""',
			updateRule: '@request.auth.id != ""',
			deleteRule: '@request.auth.id != ""',
		});

		app.save(collection);

		// Add self-referential parent_item field after collection is created
		const items = app.findCollectionByNameOrId('items');
		items.fields.add(
			new RelationField({
				name: 'parent_item',
				collectionId: items.id,
				maxSelect: 1,
			})
		);
		app.save(items);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('items');
		app.delete(collection);
	}
);
