/// <reference path="../pb_data/types.d.ts" />
// #515 — mcp_tokens (0077) shipped without an `updated` autodate; the
// timestamps schema guard (backend/test-timestamps.mjs) requires one on
// every collection.
migrate(
	(app) => {
		const tokens = app.findCollectionByNameOrId('mcp_tokens');
		tokens.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
		app.save(tokens);
	},
	(app) => {
		const tokens = app.findCollectionByNameOrId('mcp_tokens');
		tokens.fields.removeByName('updated');
		app.save(tokens);
	}
);
