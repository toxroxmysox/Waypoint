/// <reference path="../pb_data/types.d.ts" />
// #502 / ADR-0024 — a Connection: one user's link between their own AI assistant
// (the Claude connector) and Waypoint, made by logging in with their email code.
//
// mcp_connections: one row per (user, OAuth client). The owner can list, view and
//   delete their own (account settings → Connected apps → Disconnect). Only the
//   server (superuser) creates/updates.
// mcp_tokens: opaque access/refresh tokens, SHA-256 hashed — never the token.
//   cascadeDelete on `connection`, so Disconnect kills every token at once.
//   Superuser only (all rules null).
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const connections = new Collection({
			type: 'base',
			name: 'mcp_connections',
			listRule: 'user = @request.auth.id',
			viewRule: 'user = @request.auth.id',
			createRule: null,
			updateRule: null,
			deleteRule: 'user = @request.auth.id',
			fields: [
				{ type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'text', name: 'client_id', required: true, max: 500 },
				{ type: 'text', name: 'client_name', required: false, max: 200 },
				{ type: 'date', name: 'last_used_at', required: false },
				{ type: 'autodate', name: 'created', onCreate: true },
				{ type: 'autodate', name: 'updated', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_mcp_connections_user ON mcp_connections (user, client_id)']
		});
		app.save(connections);

		const tokens = new Collection({
			type: 'base',
			name: 'mcp_tokens',
			listRule: null,
			viewRule: null,
			createRule: null,
			updateRule: null,
			deleteRule: null,
			fields: [
				{ type: 'relation', name: 'connection', required: true, collectionId: connections.id, maxSelect: 1, cascadeDelete: true },
				{ type: 'select', name: 'kind', required: true, maxSelect: 1, values: ['access', 'refresh'] },
				{ type: 'text', name: 'hash', required: true, max: 64 },
				{ type: 'date', name: 'expires_at', required: true },
				{ type: 'autodate', name: 'created', onCreate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_mcp_tokens_hash ON mcp_tokens (hash)']
		});
		app.save(tokens);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('mcp_tokens'));
		app.delete(app.findCollectionByNameOrId('mcp_connections'));
	}
);
