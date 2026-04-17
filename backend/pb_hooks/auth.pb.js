/// <reference path="../pb_data/types.d.ts" />

// Auto-create user on first OTP request so "enter email, get code" works
// regardless of whether the user already exists.
onRecordRequestOTPRequest((e) => {
	if (!e.record) {
		const users = e.app.findCollectionByNameOrId('users');
		const record = new Record(users);
		record.setEmail(e.email);
		e.app.save(record);
		e.record = record;
	}
	e.next();
});
