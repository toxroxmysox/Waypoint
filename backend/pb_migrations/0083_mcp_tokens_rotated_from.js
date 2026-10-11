/// <reference path="../pb_data/types.d.ts" />
// #512 — atomic refresh rotation. Each rotation mints its new refresh row with
// `rotated_from` = the old row's id, under a UNIQUE index, so of two concurrent
// refreshes with one token exactly one insert wins; the loser gets invalid_grant.
// (PB has no conditional update; a unique insert is the atomic step.)
migrate(
	(app) => {
		const tokens = app.findCollectionByNameOrId('mcp_tokens');
		tokens.fields.add(new TextField({ name: 'rotated_from', required: false, max: 50 }));
		tokens.addIndex('idx_mcp_tokens_rotated_from', true, 'rotated_from', "rotated_from != ''");
		app.save(tokens);
	},
	(app) => {
		const tokens = app.findCollectionByNameOrId('mcp_tokens');
		tokens.removeIndex('idx_mcp_tokens_rotated_from');
		tokens.fields.removeByName('rotated_from');
		app.save(tokens);
	}
);
