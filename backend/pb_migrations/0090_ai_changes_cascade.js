/// <reference path="../pb_data/types.d.ts" />
// #520 — keep the cascade an AI Change previewed (phases re-tiled, days added or
// removed, items moved), so an undo can name the items it leaves as ideas.
migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('ai_changes');
		c.fields.add(new JSONField({ name: 'cascade', required: false, maxSize: 200000 }));
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('ai_changes');
		c.fields.removeByName('cascade');
		app.save(c);
	}
);
