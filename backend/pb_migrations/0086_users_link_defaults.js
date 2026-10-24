/// <reference path="../pb_data/types.d.ts" />
// #510 — per-user defaults for where links open: the web search engine ("What is
// this?") and the maps app (an item's place link). Empty = Google for both
// (behavior before this). Self-edited on /account under users.updateRule.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		if (!users.fields.getByName('search_engine')) {
			users.fields.add(
				new SelectField({ name: 'search_engine', maxSelect: 1, values: ['google', 'duckduckgo'] })
			);
		}
		if (!users.fields.getByName('maps_app')) {
			users.fields.add(
				new SelectField({ name: 'maps_app', maxSelect: 1, values: ['google', 'apple'] })
			);
		}
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.fields.removeByName('search_engine');
		users.fields.removeByName('maps_app');
		app.save(users);
	}
);
