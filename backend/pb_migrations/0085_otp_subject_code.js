/// <reference path="../pb_data/types.d.ts" />
// #516 — put the code in the OTP email subject ("482913 is your Waypoint code")
// so it reads at a glance and iOS Mail can offer it for autofill. PB resolves
// {OTP} in the subject as well as the body. Body unchanged (PB default).
migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.otp.emailTemplate.subject = '{OTP} is your Waypoint code';
		app.save(users);
	},
	(app) => {
		// Down: PB's default OTP subject.
		const users = app.findCollectionByNameOrId('users');
		users.otp.emailTemplate.subject = 'OTP for {APP_NAME}';
		app.save(users);
	}
);
