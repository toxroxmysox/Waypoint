/// <reference path="../pb_data/types.d.ts" />
// Documents S0 (#69) — Retire the Vault.
//
// DELIBERATE EXCEPTION to the "migrations never delete, only append" rule
// (CLAUDE.md / backend/RULES.md). Sanctioned by ADR-0005: the Vault is a
// client-side-encrypted text store that is distrusted and unused; there is no
// production data (only dogfood entries, none worth keeping). This is the ONE
// sanctioned deletion — the append-only rule still holds everywhere else.
//
// Drops:
//   - the `vault_entries` collection
//   - the `vault_password_hash` field on `trips`
//
// The down-migration recreates both so the migration is reversible in dev.
migrate(
	(app) => {
		// 1. Drop the vault_entries collection.
		try {
			const vaultEntries = app.findCollectionByNameOrId('vault_entries');
			app.delete(vaultEntries);
		} catch (_) {
			// Already gone — no-op so re-running is safe.
		}

		// 2. Drop the vault_password_hash field on trips.
		const trips = app.findCollectionByNameOrId('trips');
		const field = trips.fields.getByName('vault_password_hash');
		if (field) {
			trips.fields.removeById(field.id);
			app.save(trips);
		}
	},
	(app) => {
		// Down: restore vault_password_hash on trips.
		const trips = app.findCollectionByNameOrId('trips');
		if (!trips.fields.getByName('vault_password_hash')) {
			trips.fields.add(
				new Field({ type: 'text', name: 'vault_password_hash', max: 500, hidden: true })
			);
			app.save(trips);
		}

		// Down: restore the vault_entries collection.
		try {
			app.findCollectionByNameOrId('vault_entries');
		} catch (_) {
			const tripsCol = app.findCollectionByNameOrId('trips');
			const tripMembers = app.findCollectionByNameOrId('trip_members');
			const MEMBER_VIA_TRIP =
				'@request.auth.id != "" && trip.trip_members_via_trip.user ?= @request.auth.id';
			const collection = new Collection({
				type: 'base',
				name: 'vault_entries',
				fields: [
					{ type: 'relation', name: 'trip', required: true, collectionId: tripsCol.id, maxSelect: 1, cascadeDelete: true },
					{ type: 'text', name: 'encrypted_title', required: true, max: 5000 },
					{ type: 'text', name: 'encrypted_body', required: true, max: 100000 },
					{ type: 'relation', name: 'created_by', required: true, collectionId: tripMembers.id, maxSelect: 1 },
				],
				indexes: ['CREATE INDEX idx_vault_entries_trip ON vault_entries (trip)'],
				listRule: MEMBER_VIA_TRIP,
				viewRule: MEMBER_VIA_TRIP,
				createRule: MEMBER_VIA_TRIP,
				updateRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
				deleteRule: MEMBER_VIA_TRIP + ' && created_by.user = @request.auth.id',
			});
			app.save(collection);
		}
	}
);
