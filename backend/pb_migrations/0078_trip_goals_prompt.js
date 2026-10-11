/// <reference path="../pb_data/types.d.ts" />
// #403 — the capture prompt a goal answered. "Sushi" alone loses its question
// ("A food you have to try?"), so a goal made from a prompt card stores the
// prompt's id (`food`) and the goal surfaces show a short kicker ("Food to try")
// above the title. Plain text, not required: empty on goals typed elsewhere and on
// every goal created before this. Numbered 0078, not 0076: release/3.1 already
// holds 0076/0077. Additive (fields.add) so trip_goals keeps its fields and autodates.
migrate(
	(app) => {
		const goals = app.findCollectionByNameOrId('trip_goals');
		goals.fields.add(new TextField({ name: 'prompt', required: false, max: 40 }));
		app.save(goals);
	},
	(app) => {
		const goals = app.findCollectionByNameOrId('trip_goals');
		goals.fields.removeByName('prompt');
		app.save(goals);
	}
);
