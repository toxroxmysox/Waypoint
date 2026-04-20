/// <reference path="../pb_data/types.d.ts" />
// Replace days.phase (single-relation) with days.phases (multi-relation) so a
// day can belong to multiple overlapping phases (e.g. travel-transition days).
migrate(
	(app) => {
		const days = app.findCollectionByNameOrId('days');
		const phases = app.findCollectionByNameOrId('phases');

		// Add new multi-relation field "phases"
		days.fields.add(
			new Field({
				type: 'relation',
				name: 'phases',
				collectionId: phases.id,
				maxSelect: null, // unlimited
				cascadeDelete: false
			})
		);
		// Drop the old index that referenced the single-relation field
		days.indexes = days.indexes.filter((i) => !i.includes('idx_days_trip_phase'));
		app.save(days);

		// Copy existing `phase` values into the new `phases` array
		const existing = app.findRecordsByFilter('days', '', '', 0, 0);
		for (const day of existing) {
			const old = day.getString('phase');
			if (old) {
				day.set('phases', [old]);
				app.save(day);
			}
		}

		// Remove the old single-relation field
		const old = days.fields.getByName('phase');
		if (old) {
			days.fields.removeById(old.id);
			app.save(days);
		}
	},
	(app) => {
		const days = app.findCollectionByNameOrId('days');
		const phases = app.findCollectionByNameOrId('phases');

		// Re-add single-relation `phase`
		days.fields.add(
			new Field({
				type: 'relation',
				name: 'phase',
				collectionId: phases.id,
				maxSelect: 1,
				cascadeDelete: false
			})
		);
		app.save(days);

		// Copy first value from `phases` array back to `phase`
		const existing = app.findRecordsByFilter('days', '', '', 0, 0);
		for (const day of existing) {
			const arr = day.get('phases');
			if (Array.isArray(arr) && arr.length > 0) {
				day.set('phase', arr[0]);
				app.save(day);
			}
		}

		// Drop the multi-relation `phases`
		const multi = days.fields.getByName('phases');
		if (multi) {
			days.fields.removeById(multi.id);
			app.save(days);
		}

		// Restore old index
		days.indexes.push('CREATE INDEX idx_days_trip_phase ON days (trip, phase)');
		app.save(days);
	}
);
