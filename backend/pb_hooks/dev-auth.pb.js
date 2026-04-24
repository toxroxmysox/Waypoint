/// <reference path="../pb_data/types.d.ts" />
// Dev-only auth bypass for E2E tests. Gated on WAYPOINT_DEV_MODE=true. In any
// other environment the route 400s, so production deploys can't use it even if
// the file ships. Whitelists a single email (E2E_TEST_EMAIL) and issues a real
// PB auth token for that user — creating the user on first call.
routerAdd('POST', '/api/dev/auth-bypass', (e) => {
	if ($os.getenv('WAYPOINT_DEV_MODE') !== 'true') {
		throw new BadRequestError('Dev bypass is not enabled');
	}

	const testEmail = $os.getenv('E2E_TEST_EMAIL');
	if (!testEmail) {
		throw new BadRequestError('E2E_TEST_EMAIL is not configured');
	}

	const data = new DynamicModel({ email: '' });
	e.bindBody(data);

	if (data.email !== testEmail) {
		throw new ForbiddenError('Email not whitelisted for bypass');
	}

	let user;
	try {
		user = e.app.findAuthRecordByEmail('users', testEmail);
	} catch (_) {
		const users = e.app.findCollectionByNameOrId('users');
		user = new Record(users);
		user.setEmail(testEmail);
		user.setPassword($security.randomString(40));
		user.set('name', 'E2E Test User');
		user.set('verified', true);
		e.app.save(user);
	}

	const token = user.newAuthToken();

	return e.json(200, {
		token: token,
		record: user
	});
});
