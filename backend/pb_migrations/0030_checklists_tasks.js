/// <reference path="../pb_data/types.d.ts" />
// ADR-0003 / TASKS_PRD §3, §8 — Checklists & Tasks as a standalone primitive.
// Two new collections sitting *outside* the Item model, plus a `requires_booking`
// flag on items. Append-only: legacy `checklist_items` is left inert, the
// `checklist` ItemType union value stays as a tombstone (picker drops it in UI).
migrate(
	(app) => {
		const trips = app.findCollectionByNameOrId('trips');
		const phases = app.findCollectionByNameOrId('phases');
		const items = app.findCollectionByNameOrId('items');
		const tripMembers = app.findCollectionByNameOrId('trip_members');

		// Membership-scoped, matching the established items/checklist_items rules
		// (0014). Viewer read-only is enforced at the app layer — PB's multi-relation
		// `?=` can't reliably match "same member is both me AND non-viewer" in one rule.
		const MEMBER_VIA_TRIP =
			'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
		const MEMBER_VIA_CHECKLIST =
			'@request.auth.id != "" && checklist.trip.trip_members_via_trip.user ?= @request.auth.id';

		// checklists — denormalized ancestor chain; attachment level is derived,
		// never stored. cascadeDelete at every level (trip / phase / item).
		const checklists = new Collection({
			type: 'base',
			name: 'checklists',
			fields: [
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'phase', collectionId: phases.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'relation', name: 'item', collectionId: items.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'title', required: true, min: 1, max: 200 },
				{ type: 'select', name: 'kind', required: true, values: ['manual', 'booking'], maxSelect: 1 },
				{ type: 'number', name: 'order', min: 0 },
			],
			indexes: [
				'CREATE INDEX idx_checklists_trip ON checklists (trip)',
				'CREATE INDEX idx_checklists_item ON checklists (item)',
				'CREATE INDEX idx_checklists_phase ON checklists (phase)',
			],
			listRule: MEMBER_VIA_TRIP,
			viewRule: MEMBER_VIA_TRIP,
			createRule: MEMBER_VIA_TRIP,
			updateRule: MEMBER_VIA_TRIP,
			deleteRule: MEMBER_VIA_TRIP,
		});
		app.save(checklists);

		// tasks — a checkable line belonging to one checklist (cascadeDelete).
		const checklistsCol = app.findCollectionByNameOrId('checklists');
		const tasks = new Collection({
			type: 'base',
			name: 'tasks',
			fields: [
				{ type: 'relation', name: 'checklist', required: true, collectionId: checklistsCol.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'title', required: true, min: 1, max: 500 },
				{ type: 'bool', name: 'checked' },
				{ type: 'relation', name: 'assignee', collectionId: tripMembers.id, maxSelect: 1 },
				{ type: 'number', name: 'order', min: 0 },
			],
			indexes: ['CREATE INDEX idx_tasks_checklist_order ON tasks (checklist, `order`)'],
			listRule: MEMBER_VIA_CHECKLIST,
			viewRule: MEMBER_VIA_CHECKLIST,
			createRule: MEMBER_VIA_CHECKLIST,
			updateRule: MEMBER_VIA_CHECKLIST,
			deleteRule: MEMBER_VIA_CHECKLIST,
		});
		app.save(tasks);

		// items.requires_booking — drives the booking Smart List projection (#50).
		// Backfill true for lodging/flight/transportation; false otherwise.
		items.fields.add(new BoolField({ name: 'requires_booking' }));
		app.save(items);

		app.db()
			.newQuery(
				"UPDATE items SET requires_booking = true WHERE type IN ('lodging', 'flight', 'transportation')"
			)
			.execute();
	},
	(app) => {
		const tasks = app.findCollectionByNameOrId('tasks');
		app.delete(tasks);
		const checklists = app.findCollectionByNameOrId('checklists');
		app.delete(checklists);
		const items = app.findCollectionByNameOrId('items');
		items.fields.removeByName('requires_booking');
		app.save(items);
	}
);
