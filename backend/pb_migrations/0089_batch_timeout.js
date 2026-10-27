/// <reference path="../pb_data/types.d.ts" />
// #520 — commit_changes sends a proposal (up to 50 ops, each running its rules
// and hooks) as one PB batch. PB's default 3 s batch timeout is too tight for a
// large phase re-tile on the NAS; 30 s matches a slow request, not a hung one.
migrate(
	(app) => {
		const settings = app.settings();
		settings.batch.timeout = 30;
		app.save(settings);
	},
	(app) => {
		const settings = app.settings();
		settings.batch.timeout = 3;
		app.save(settings);
	}
);
