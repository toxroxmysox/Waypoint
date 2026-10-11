/// <reference path="../pb_data/types.d.ts" />
// #411 — secret fields hidden from callers who don't need them. The collection
// rules let every trip member read these rows; the hidden fields are tokens:
//   - trip_members.soft_token  → poll re-entry key; only the poll hooks read it,
//                                in admin context. Hidden from every non-superuser.
//   - join_tokens.token        → a working join link. Viewers can't manage links
//                                (#152), so a viewer could otherwise mint
//                                traveler joins. Hidden from viewers.
//   - trips.public_share_token → the public archive URL. Hidden from viewers.
// onRecordEnrich runs for every record PB serialises in a response, expanded
// relations included, so `items?expand=trip` is covered too. It only shapes
// output: filters on these fields (archive lookup) are unaffected.
//
// PB 0.27 isolated goja runtime: role lookup inlined per callback.
onRecordEnrich((e) => {
	const auth = e.requestInfo ? e.requestInfo.auth : null;
	if (!(auth && auth.isSuperuser())) e.record.hide('soft_token');
	e.next();
}, 'trip_members');

onRecordEnrich((e) => {
	const auth = e.requestInfo ? e.requestInfo.auth : null;
	if (!(auth && auth.isSuperuser())) {
		let role = '';
		if (auth) {
			try {
				role = e.app
					.findFirstRecordByFilter('trip_members', 'trip = {:t} && user = {:u} && removed_at = ""', {
						t: e.record.getString('trip'),
						u: auth.id
					})
					.getString('role');
			} catch (_) {}
		}
		if (!role || role === 'viewer') e.record.hide('token');
	}
	e.next();
}, 'join_tokens');

onRecordEnrich((e) => {
	const auth = e.requestInfo ? e.requestInfo.auth : null;
	if (!(auth && auth.isSuperuser())) {
		let role = '';
		if (auth) {
			try {
				role = e.app
					.findFirstRecordByFilter('trip_members', 'trip = {:t} && user = {:u} && removed_at = ""', {
						t: e.record.id,
						u: auth.id
					})
					.getString('role');
			} catch (_) {}
		}
		if (!role || role === 'viewer') e.record.hide('public_share_token');
	}
	e.next();
}, 'trips');
