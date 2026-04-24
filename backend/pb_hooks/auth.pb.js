/// <reference path="../pb_data/types.d.ts" />

// Trip-creator auto-membership used to live here. Consolidated into
// trips.pb.js's onRecordAfterCreateSuccess along with generateDays so we have
// a single hook for the collection — registering the same hook in two files
// caused PB 0.27 to only fire one handler, which ate the day generation.

// Auto-create user on first OTP request so "enter email, get code" works
// regardless of whether the user already exists.
onRecordRequestOTPRequest((e) => {
	if (!e.record) {
		// e.email doesn't exist on this event — read identity from request body
		const info = e.requestInfo();
		const email = info.body['identity'] || info.body['email'];

		if (!email) {
			throw new BadRequestError('Email is required');
		}

		const users = e.app.findCollectionByNameOrId('users');
		const record = new Record(users);
		record.setEmail(email);
		// Auth records require a password even when password auth is disabled
		record.setPassword($security.randomString(40));
		e.app.save(record);
		e.record = record;
	}
	e.next();
});
