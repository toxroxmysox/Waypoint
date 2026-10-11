/// <reference path="../pb_data/types.d.ts" />
// #503 / ADR-0025 §3 — commit_changes applies a proposal all-or-nothing as one
// PB batch (a single transaction; each sub-request still runs the collection's
// rules and request hooks). At most 50 ops per proposal, so maxRequests = 50.
migrate(
	(app) => {
		const settings = app.settings();
		settings.batch.enabled = true;
		settings.batch.maxRequests = 50;
		app.save(settings);
	},
	(app) => {
		const settings = app.settings();
		settings.batch.enabled = false;
		app.save(settings);
	}
);
