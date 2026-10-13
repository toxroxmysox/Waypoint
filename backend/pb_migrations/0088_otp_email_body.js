/// <reference path="../pb_data/types.d.ts" />
// Replace PB's stock OTP body ("Hello, Your one-time password is: … {APP_NAME}
// team") — identical across every PocketBase app, so spam filters can
// fingerprint it. Friends' OTP mail was landing in spam with SPF/DKIM/DMARC all
// passing, so this is a content fix, not an auth one. PB wraps this in its
// layout and derives the text/plain part from it. Expiry copy tracks
// otp.duration = 300 (0001).
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.otp.emailTemplate.body =
			'<p>Here&rsquo;s your code to sign in to Waypoint:</p>\n' +
			'<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">{OTP}</p>\n' +
			'<p>Enter it on the sign-in screen. It expires in 5 minutes and works once.</p>\n' +
			'<p style="color: #666; font-size: 13px;">Someone entered this email address at app.vandenwarsen.com. ' +
			'If that wasn&rsquo;t you, ignore this email &mdash; nobody can sign in without the code.</p>\n' +
			'<p style="color: #666; font-size: 13px;">&mdash; Waypoint</p>';
		app.save(users);
	},
	(app) => {
		// Down: PB's default OTP body.
		const users = app.findCollectionByNameOrId('users');
		users.otp.emailTemplate.body =
			'<p>Hello,</p>\n' +
			'<p>Your one-time password is: <strong>{OTP}</strong></p>\n' +
			"<p><i>If you didn't ask for the one-time password, you can ignore this email.</i></p>\n" +
			'<p>\n  Thanks,<br/>\n  {APP_NAME} team\n</p>';
		app.save(users);
	}
);
