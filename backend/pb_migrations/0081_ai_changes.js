/// <reference path="../pb_data/types.d.ts" />
// #503 / ADR-0025 §5 — an AI Change: one committed proposal from a member's
// connected AI (the user's words + before → after per field), private to its
// author, revertible from chat or Account → Connected apps.
//
// `connection` is the mcp_connections id as TEXT, not a relation, so
// disconnecting keeps the history. Only the server (superuser) writes rows.
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const trips = app.findCollectionByNameOrId('trips');
		const changes = new Collection({
			type: 'base',
			name: 'ai_changes',
			listRule: 'user = @request.auth.id',
			viewRule: 'user = @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'connection', required: false, max: 50 },
				{ type: 'relation', name: 'trip', required: true, collectionId: trips.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'quote', required: true, max: 2000 },
				{ type: 'json', name: 'changes', required: false, maxSize: 2000000 },
				{ type: 'date', name: 'reverted_at', required: false },
				{ type: 'autodate', name: 'created', onCreate: true },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE INDEX idx_ai_changes_user_created ON ai_changes (user, created)']
		});
		app.save(changes);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('ai_changes'));
	}
);
