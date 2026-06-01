/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');

		// Remove slot field
		items.fields.removeByName('slot');

		// Remove parking_lot_scope field
		items.fields.removeByName('parking_lot_scope');

		// Rename rank → sort_order: add new field, copy data, remove old
		items.fields.add(
			new NumberField({
				name: 'sort_order',
				min: 0,
			})
		);

		// Add 'unplanned' to status enum
		const statusField = items.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered', 'unplanned'];

		// Add 'flight' to type enum
		const typeField = items.fields.getByName('type');
		typeField.values = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist', 'flight'];

		// Update indexes: remove slot-based index, add sort_order index
		items.indexes = items.indexes.filter((idx) => !idx.includes('idx_items_trip_day_slot'));
		items.indexes.push('CREATE INDEX idx_items_trip_day_sort ON items (trip, day, sort_order)');

		app.save(items);

		// Copy rank values to sort_order
		app.db().newQuery('UPDATE items SET sort_order = rank').execute();

		// Now remove old rank field
		const itemsRefresh = app.findCollectionByNameOrId('items');
		itemsRefresh.fields.removeByName('rank');
		app.save(itemsRefresh);

		// Remove color from phases
		const phases = app.findCollectionByNameOrId('phases');
		phases.fields.removeByName('color');
		app.save(phases);
	},
	(app) => {
		// Down migration: restore removed fields
		const items = app.findCollectionByNameOrId('items');

		items.fields.add(
			new SelectField({
				name: 'slot',
				values: ['morning', 'afternoon', 'evening', 'anytime'],
				maxSelect: 1,
			})
		);
		items.fields.add(
			new NumberField({
				name: 'rank',
				min: 0,
			})
		);
		items.fields.add(
			new SelectField({
				name: 'parking_lot_scope',
				values: ['none', 'trip', 'phase', 'day'],
				maxSelect: 1,
			})
		);

		// Restore status without 'unplanned'
		const statusField = items.fields.getByName('status');
		statusField.values = ['planned', 'done', 'considered'];

		// Restore type without 'flight'
		const typeField = items.fields.getByName('type');
		typeField.values = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist'];

		// Restore index
		items.indexes = items.indexes.filter((idx) => !idx.includes('idx_items_trip_day_sort'));
		items.indexes.push('CREATE INDEX idx_items_trip_day_slot ON items (trip, day, slot)');

		items.fields.removeByName('sort_order');
		app.save(items);

		const phases = app.findCollectionByNameOrId('phases');
		phases.fields.add(
			new TextField({
				name: 'color',
				max: 7,
			})
		);
		app.save(phases);
	}
);
