/// <reference path="../pb_data/types.d.ts" />
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');

		// Add custom fields
		users.fields.add(
			new TextField({
				name: 'name',
				required: false,
				max: 100,
			})
		);
		users.fields.add(
			new FileField({
				name: 'avatar',
				maxSelect: 1,
				maxSize: 5242880, // 5MB
				mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
			})
		);

		// Enable OTP auth (email + 6-digit code)
		users.otp.enabled = true;
		users.otp.duration = 300; // 5 minutes
		users.otp.length = 6;

		// Disable password auth
		users.passwordAuth.enabled = false;

		// Disable OAuth2
		users.oauth2.enabled = false;

		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.fields.removeByName('name');
		users.fields.removeByName('avatar');
		users.otp.enabled = false;
		users.passwordAuth.enabled = true;
		app.save(users);
	}
);
