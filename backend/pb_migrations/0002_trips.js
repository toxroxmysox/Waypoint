/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		const collection = new Collection({
			type: 'base',
			name: 'trips',
			fields: [
				{ type: 'text', name: 'slug', required: true, min: 1, max: 100 },
				{ type: 'text', name: 'title', required: true, min: 1, max: 200 },
				{ type: 'date', name: 'start_date', required: true },
				{ type: 'date', name: 'end_date', required: true },
				{ type: 'text', name: 'timezone', max: 50 },
				{ type: 'text', name: 'location_summary', max: 200 },
				{ type: 'json', name: 'countries', maxSize: 2000 },
				{ type: 'file', name: 'cover_image', maxSelect: 1, maxSize: 10485760, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] },
				{ type: 'url', name: 'photo_album_url' },
				{ type: 'bool', name: 'archive_enabled' },
				{ type: 'number', name: 'archive_publish_after_days', min: 0 },
				{ type: 'text', name: 'public_share_token', max: 100 },
				{ type: 'text', name: 'vault_password_hash', max: 500, hidden: true },
				{ type: 'bool', name: 'auto_approve_suggestions' },
				{ type: 'relation', name: 'created_by', required: true, collectionId: users.id, maxSelect: 1 },
				{ type: 'bool', name: 'archived' },
			],
			indexes: [
				'CREATE UNIQUE INDEX idx_trips_slug ON trips (slug)',
				'CREATE UNIQUE INDEX idx_trips_share_token ON trips (public_share_token) WHERE public_share_token != ""',
			],
			// Permissive rules initially; tightened in 0008 after trip_members exists
			listRule: '@request.auth.id != ""',
			viewRule: '@request.auth.id != ""',
			createRule: '@request.auth.id != ""',
			updateRule: '@request.auth.id != ""',
			deleteRule: '@request.auth.id != ""',
		});

		app.save(collection);
	},
	(app) => {
		const collection = app.findCollectionByNameOrId('trips');
		app.delete(collection);
	}
);
