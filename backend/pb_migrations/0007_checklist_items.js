/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		const collection = new Collection({
			type: 'base',
			name: 'checklist_items',
			fields: [
				{ type: 'relation', name: 'item', required: true, collectionId: items.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'text', required: true, min: 1, max: 500 },
				{ type: 'relation', name: 'checked_by', collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'date', name: 'checked_at' },
				{ type: 'number', name: 'order', min: 0 },
			],
			indexes: ['CREATE INDEX idx_checklist_items_item_order ON checklist_items (item, `order`)'],
			// Permissive rules initially; tightened in 0008
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != ""',
			updateRule: '@request.auth.id != ""',
			deleteRule: '@request.auth.id != ""',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('checklist_items');
		app.delete(collection);
	}
);
