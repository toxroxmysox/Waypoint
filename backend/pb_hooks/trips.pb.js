/// <reference path="../pb_data/types.d.ts" />

// #280 (AUTHZ-2) — trips lifecycle/publishing role gate.
//
// THE GAP: trips.updateRule = MEMBER_VIA_TRIP (any member), and the only trips
// update hook (the day-reconcile below) just calls e.next() with no role check.
// So any member could PATCH the publishing/lifecycle flags via direct PB REST —
// flip archive_enabled + archive_publish_at to push the private itinerary public,
// set archived to lock the trip, or auto_approve_suggestions to auto-promote their
// own suggestions. requireOwner() is UI-only.
//
// This gate rejects changes to the protected fields unless the caller is
// owner/co_owner, comparing new vs original PER FIELD so ORDINARY member edits
// (title, dates, location_summary, timezone, ...) keep their MEMBER_VIA_TRIP
// allowance. It is registered FIRST (above the day-reconcile handler) so a denied
// write throws before any e.next() in the chain runs (PB runs onRecordUpdateRequest
// handlers in registration order; cerebrum [2026-06-14]).
//
// goja: all inlined, handler-first signature, string-coerced compares (empty /
// date fields read back as truthy objects — use getString for the date field).
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const original = e.record.original();

	// Protected lifecycle/publishing fields. archive_publish_at is a DATE — compare
	// via getString (goja returns a truthy DateTime object for an empty date, so a
	// get()-based compare would misfire). The rest are bool/text — string-coerce.
	const boolTextFields = [
		'archived',
		'archive_enabled',
		'archive_show_budget',
		'public_share_token',
		'auto_approve_suggestions'
	];

	let protectedChanged = false;
	for (let i = 0; i < boolTextFields.length; i++) {
		const f = boolTextFields[i];
		if ('' + e.record.get(f) !== '' + original.get(f)) {
			protectedChanged = true;
			break;
		}
	}
	if (!protectedChanged) {
		if (e.record.getString('archive_publish_at') !== original.getString('archive_publish_at')) {
			protectedChanged = true;
		}
	}

	// No protected field touched → an ordinary member edit; let it proceed to the
	// reconcile handler at the MEMBER rule allowance.
	if (!protectedChanged) {
		e.next();
		return;
	}

	// A protected field changed → owner/co_owner only.
	let callerMember;
	try {
		callerMember = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:tripId} && user = {:uid} && removed_at = ""',
			{ tripId: e.record.id, uid: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}

	const callerRole = callerMember.get('role');
	if (callerRole !== 'owner' && callerRole !== 'co_owner') {
		throw new ForbiddenError(
			'Only an owner or co-owner can change a trip’s publishing or lifecycle settings'
		);
	}

	e.next();
}, 'trips');

// #270 / ADR-0022 — both-or-neither dates on create. A trip is either dateless
// (forming) or fully dated; a start-only / end-only trip must never exist. The
// schema can't express a cross-field requirement (0062 relaxed both to
// optional), so the invariant lives here + in the form actions. getString, not
// get(): goja returns a TRUTHY DateTime for an empty date field (cerebrum).
onRecordCreateRequest((e) => {
	const start = e.record.getString('start_date');
	const end = e.record.getString('end_date');
	if ((start && !end) || (!start && end)) {
		throw new BadRequestError('A trip needs both dates or neither.');
	}

	// #395 — slug dedupe. idx_trips_slug is GLOBAL, but a caller-side probe runs
	// under the trips view rule and can't see other people's trips, so it picked
	// a taken slug and the create 400'd (every retry recomputed the same slug).
	// e.app bypasses rules, so this sees every trip. A concurrent winner can
	// still race between the probe and the insert; the index rejects that and
	// the form action reports it.
	const base = e.record.getString('slug');
	if (base) {
		const taken = (s) => {
			try {
				e.app.findFirstRecordByFilter('trips', 'slug = {:s}', { s: s });
				return true;
			} catch (_) {
				return false;
			}
		};
		// Suffixed slugs trim the base so they stay inside the field's max: 100.
		const stem = base.slice(0, 90);
		let slug = base;
		for (let i = 1; taken(slug); i++) {
			slug = stem + '-' + (i <= 50 ? i : $security.randomStringWithAlphabet(6, 'abcdefghijklmnopqrstuvwxyz0123456789'));
		}
		e.record.set('slug', slug);
	}
	e.next();
}, 'trips');

// #395 — same-name heads-up on create.
// GET /api/trips/same-name?title=T
// Returns { mine: [{ slug, title }], co_travelers: [{ trip_id, title, name }] }:
// current trips whose title normalises to the same slug as T that are either
// the caller's own, or OWNED/CO-OWNED by a co-traveler (an active real-user
// member of a trip the caller is actively on; #352). Most same-name creates are
// two people starting the SAME trip, so the form warns instead of silently
// making a second one.
// - Only owner/co-owner links count: they are who a request notifies, and the
//   #352 picker on their Members page lists the caller (a shared trip), so a
//   request is actionable. A trip reached only via a plain traveler is skipped.
// - Never: a stranger's trip, a trip the caller was REMOVED from (no nagging the
//   owners who removed them), an archived trip, or one that has ended.
// - "Ended" is lenient by a day: the cutoff is yesterday in UTC, so a trip's
//   last day still counts while it is that day anywhere west of UTC.
// Hook context reads with app privileges — the matched trip is invisible to
// the caller under the trips view rule.
routerAdd('GET', '/api/trips/same-name', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const query = e.requestInfo().query || {};
	const raw = Array.isArray(query['title']) ? query['title'][0] : query['title'] || '';
	// Inlined twin of trips/new toSlug(): punctuation and case don't distinguish
	// trips ("Thailand!" === "thailand").
	const norm = (t) =>
		String(t || '')
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	const target = norm(raw);
	if (!target) return e.json(200, { mine: [], co_travelers: [] });

	const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
	const isCurrentMatch = (trip) => {
		if (trip.getBool('archived')) return false;
		const end = trip.getString('end_date').slice(0, 10);
		if (end && end < cutoff) return false;
		return norm(trip.getString('title')) === target;
	};
	const memberships = (filter, params) => {
		try {
			return e.app.findRecordsByFilter('trip_members', filter, '', 0, 0, params);
		} catch (_) {
			return [];
		}
	};
	const tripCache = {};
	const loadTrip = (id) => {
		if (!(id in tripCache)) {
			try {
				tripCache[id] = e.app.findRecordById('trips', id);
			} catch (_) {
				tripCache[id] = null;
			}
		}
		return tripCache[id];
	};

	const mine = [];
	const myTrips = {};
	for (const m of memberships('user = {:u} && removed_at = ""', { u: auth.id })) {
		const tripId = m.getString('trip');
		if (!tripId || myTrips[tripId]) continue;
		myTrips[tripId] = true;
		const trip = loadTrip(tripId);
		if (trip && isCurrentMatch(trip)) mine.push({ slug: trip.getString('slug'), title: trip.getString('title') });
	}
	const removedFrom = {};
	for (const m of memberships('user = {:u} && removed_at != ""', { u: auth.id })) {
		removedFrom[m.getString('trip')] = true;
	}

	// Co-travelers: active, real-user members of my trips, minus me.
	const coTravelers = {};
	for (const tripId of Object.keys(myTrips)) {
		const others = memberships('trip = {:t} && user != "" && user != {:u} && removed_at = ""', {
			t: tripId,
			u: auth.id
		});
		for (const o of others) coTravelers[o.getString('user')] = true;
	}

	const found = {};
	const out = [];
	for (const userId of Object.keys(coTravelers)) {
		const led = memberships(
			'user = {:u} && removed_at = "" && (role = "owner" || role = "co_owner")',
			{ u: userId }
		);
		for (const m of led) {
			const tripId = m.getString('trip');
			if (!tripId || myTrips[tripId] || removedFrom[tripId] || found[tripId]) continue;
			const trip = loadTrip(tripId);
			if (!trip || !isCurrentMatch(trip)) continue;
			found[tripId] = true;
			// Name only, never the address — same rule as the #352 picker.
			let name = m.getString('display_name') || 'A co-traveler';
			try {
				name = e.app.findRecordById('users', userId).getString('name') || name;
			} catch (_) {}
			// trip_id is opaque to the caller (the view rule still hides the trip);
			// it only addresses POST /api/trips/request-invite below.
			out.push({ trip_id: tripId, title: trip.getString('title'), name: name });
		}
	}

	return e.json(200, { mine: mine, co_travelers: out });
});

// #395 — "Request an invite" from the same-name heads-up. Joining is never
// self-serve: this only notifies the trip's owner + co-owners, who invite from
// Members (the #352 co-traveler picker lists the caller, no email needed).
// POST /api/trips/request-invite  { trip_id }
// Re-validates everything /api/trips/same-name implied — the id comes from the
// client: the trip is current, the caller is neither on it nor removed from it,
// and the caller shares an active trip with one of its active owners/co-owners.
// An unread request from the same person isn't repeated.
// Returns { sent, title, name } — name = the owner/co-owner the caller knows.
routerAdd('POST', '/api/trips/request-invite', (e) => {
	const auth = e.auth;
	if (!auth) throw new UnauthorizedError('Authentication required');

	const body = e.requestInfo().body || {};
	const tripId = String(body['trip_id'] || '');
	if (!tripId) throw new BadRequestError('trip_id is required');

	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	// Same lenient cutoff as same-name: yesterday in UTC.
	const cutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
	const end = trip.getString('end_date').slice(0, 10);
	if (trip.getBool('archived') || (end && end < cutoff)) {
		throw new BadRequestError('That trip is no longer open to requests.');
	}

	const memberships = (filter, params) => {
		try {
			return e.app.findRecordsByFilter('trip_members', filter, '', 0, 0, params);
		} catch (_) {
			return [];
		}
	};

	const mineHere = memberships('trip = {:t} && user = {:u}', { t: tripId, u: auth.id });
	for (const m of mineHere) {
		if (m.getString('removed_at')) throw new ForbiddenError('You were removed from this trip.');
		throw new BadRequestError('You are already on this trip.');
	}

	const leads = memberships(
		'trip = {:t} && user != "" && removed_at = "" && (role = "owner" || role = "co_owner")',
		{ t: tripId }
	);
	const leadUsers = {};
	for (const m of leads) leadUsers[m.getString('user')] = true;

	// Linked: some trip the caller is actively on has, as an active member, one
	// of this trip's owners/co-owners.
	let linkedUser = '';
	for (const mine of memberships('user = {:u} && removed_at = ""', { u: auth.id })) {
		for (const o of memberships('trip = {:t} && user != "" && removed_at = ""', { t: mine.getString('trip') })) {
			if (leadUsers[o.getString('user')]) {
				linkedUser = o.getString('user');
				break;
			}
		}
		if (linkedUser) break;
	}
	if (!linkedUser) throw new ForbiddenError('You can only ask to join a co-traveler’s trip.');

	const nameOf = (userId, fallback) => {
		try {
			return e.app.findRecordById('users', userId).getString('name') || fallback;
		} catch (_) {
			return fallback;
		}
	};
	const requester = nameOf(auth.id, 'A co-traveler');

	const slug = trip.getString('slug');
	// The requester id rides in the link so a repeat request can be recognised.
	const link = '/trips/' + slug + '/members?invite_request=' + auth.id;
	// Short: the bell row is one line, and the link already lands on Members.
	const text = (requester + ' asked to join “' + trip.getString('title') + '”').slice(0, 500);
	const notifCol = e.app.findCollectionByNameOrId('notifications');
	let sent = 0;
	for (const m of leads) {
		let pending = false;
		try {
			e.app.findFirstRecordByFilter(
				'notifications',
				'recipient = {:r} && type = "invite_requested" && link = {:l} && read_at = ""',
				{ r: m.id, l: link }
			);
			pending = true;
		} catch (_) {}
		if (pending) continue;
		const notif = new Record(notifCol);
		notif.set('trip', tripId);
		notif.set('recipient', m.id);
		notif.set('type', 'invite_requested');
		notif.set('body', text);
		notif.set('link', link);
		e.app.save(notif);
		sent++;
	}

	return e.json(200, { sent: sent, title: trip.getString('title'), name: nameOf(linkedUser, 'The organiser') });
});

// After trip creation: add creator as owner + generate day records.
// Callback in PocketBase's JS hook runtime doesn't see outer-file helpers
// (isolated sandbox). Logic is inlined here for that reason.
// #270: a DATELESS create (forming trip) gets the owner membership only — the
// early return below skips phase seeding + day generation. Those run at
// promotion (first date-set) via the update hook's promotion branch.
onRecordAfterCreateSuccess((e) => {
	// --- Auto-add creator as owner ---
	const createdBy = e.record.get('created_by');
	if (createdBy) {
		const members = e.app.findCollectionByNameOrId('trip_members');
		const membership = new Record(members);
		membership.set('trip', e.record.id);
		membership.set('user', createdBy);
		membership.set('role', 'owner');
		membership.set(
			'joined_at',
			new Date().toISOString().replace('T', ' ').replace('Z', '') + 'Z'
		);
		e.app.save(membership);
	}

	// --- Generate day records for every date in the trip's range ---
	const rawStart = e.record.getString('start_date');
	const rawEnd = e.record.getString('end_date');
	if (!rawStart || !rawEnd) {
		e.next();
		return;
	}

	// --- Auto-seed a default "Trip" phase spanning the whole trip (#217) ---
	// A trip must always have at least one phase (the delete hook in
	// phases.pb.js blocks removing the last one). Seeded BEFORE the day-seed
	// loop below so the phases query that loop runs (next block) picks it up
	// and buckets every generated day into it — no separate rebucket needed.
	// phases has NO `created_by` field (schema 0004): set trip + name +
	// start/end (the required/used fields) + order, mirroring trips/new.
	try {
		const phasesCollection = e.app.findCollectionByNameOrId('phases');
		const seedPhase = new Record(phasesCollection);
		seedPhase.set('trip', e.record.id);
		seedPhase.set('name', 'Phase 1');
		seedPhase.set('start_date', rawStart.substring(0, 10) + ' 00:00:00.000Z');
		seedPhase.set('end_date', rawEnd.substring(0, 10) + ' 00:00:00.000Z');
		seedPhase.set('order', 0);
		e.app.save(seedPhase);
	} catch (_) {
		// If phase seeding fails, still generate days (best-effort).
	}

	const daysCollection = e.app.findCollectionByNameOrId('days');

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	const startDate = new Date(rawStart.substring(0, 10) + 'T00:00:00.000Z');
	const endDate = new Date(rawEnd.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(startDate);
	while (current <= endDate) {
		const isoDay = current.toISOString().substring(0, 10);
		const dateStr = isoDay + ' 00:00:00.000Z';

		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr);

		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (isoDay >= pStart.substring(0, 10) && isoDay <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) {
			day.set('phases', matched);
		}

		e.app.save(day);
		current.setUTCDate(current.getUTCDate() + 1);
	}

	e.next();
}, 'trips');

// After trip update: reconcile days if dates changed.
// #270 / ADR-0022 additions (all BEFORE e.next(), so a denied write rejects):
//   * both-or-neither — a trip has either no dates (forming) or both.
//   * one-way promotion — clearing dates on a dated trip is rejected (days /
//     phases / items exist by then; un-dating is destructive).
// And AFTER e.next(): the empty→set PROMOTION branch seeds the "Phase 1"
// phase (mirroring the create hook) before the day-generation below buckets
// the new days into it, then re-homes any phase-less forming ideas.
onRecordUpdateRequest((e) => {
	const oldStartDate = e.record.original().getString('start_date');
	const oldEndDate = e.record.original().getString('end_date');

	// getString, never get(): goja returns a truthy DateTime for an EMPTY date
	// field, so a get()-based truthiness check would always read "set".
	const newStartDate = e.record.getString('start_date');
	const newEndDate = e.record.getString('end_date');

	if ((newStartDate && !newEndDate) || (!newStartDate && newEndDate)) {
		throw new BadRequestError('A trip needs both dates or neither.');
	}
	if (oldStartDate && !newStartDate) {
		throw new BadRequestError(
			'This trip already has dates — they can be changed, but not removed.'
		);
	}

	e.next();

	if (oldStartDate === newStartDate && oldEndDate === newEndDate) return;

	// --- Reconcile days (inlined for same sandbox reasons) ---
	if (!newStartDate || !newEndDate) return;

	// --- Promotion (#270): first-dating a forming trip. Seed the "Phase 1"
	// phase spanning the whole trip BEFORE the phases query below, so the day
	// generation buckets every new day into it — the exact create-path shape
	// (#217/ADR-0021: a dated trip always has at least one phase). Inlined:
	// hooks run in isolated sandboxes, no shared helpers.
	const isPromotion = !oldStartDate && !!newStartDate;
	if (isPromotion) {
		try {
			const phasesCollection = e.app.findCollectionByNameOrId('phases');
			const seedPhase = new Record(phasesCollection);
			seedPhase.set('trip', e.record.id);
			seedPhase.set('name', 'Phase 1');
			seedPhase.set('start_date', newStartDate.substring(0, 10) + ' 00:00:00.000Z');
			seedPhase.set('end_date', newEndDate.substring(0, 10) + ' 00:00:00.000Z');
			seedPhase.set('order', 0);
			e.app.save(seedPhase);
		} catch (_) {
			// Best-effort, matching the create hook: still generate days below.
		}
	}

	const daysCollection = e.app.findCollectionByNameOrId('days');

	const existingDays = e.app.findRecordsByFilter(
		'days',
		'trip = {:tripId}',
		'-date',
		0,
		0,
		{ tripId: e.record.id }
	);
	const existingByDate = {};
	for (const day of existingDays) {
		existingByDate[day.getString('date').substring(0, 10)] = day;
	}

	const neededDates = {};
	const start = new Date(newStartDate.substring(0, 10) + 'T00:00:00.000Z');
	const end = new Date(newEndDate.substring(0, 10) + 'T00:00:00.000Z');
	const current = new Date(start);
	while (current <= end) {
		neededDates[current.toISOString().substring(0, 10)] = true;
		current.setUTCDate(current.getUTCDate() + 1);
	}

	let phases = [];
	try {
		phases = e.app.findRecordsByFilter(
			'phases',
			'trip = {:tripId}',
			'+order',
			0,
			0,
			{ tripId: e.record.id }
		);
	} catch (_) {
		phases = [];
	}

	// Create missing days
	for (const dateStr of Object.keys(neededDates)) {
		if (existingByDate[dateStr]) continue;
		const day = new Record(daysCollection);
		day.set('trip', e.record.id);
		day.set('date', dateStr + ' 00:00:00.000Z');
		const matched = [];
		for (const phase of phases) {
			const pStart = phase.getString('start_date');
			const pEnd = phase.getString('end_date');
			if (!pStart || !pEnd) continue;
			if (dateStr >= pStart.substring(0, 10) && dateStr <= pEnd.substring(0, 10)) {
				matched.push(phase.id);
			}
		}
		if (matched.length > 0) day.set('phases', matched);
		e.app.save(day);
	}

	// Remove days outside the new range; unlink their items first so items
	// become unscheduled rather than deleted.
	for (const [dateStr, day] of Object.entries(existingByDate)) {
		if (neededDates[dateStr]) continue;
		try {
			const items = e.app.findRecordsByFilter(
				'items',
				'day = {:dayId}',
				'',
				0,
				0,
				{ dayId: day.id }
			);
			for (const item of items) {
				item.set('day', '');
				item.set('phase', '');
				e.app.save(item);
			}
		} catch (_) {
			// No items to unlink
		}
		e.app.delete(day);
	}

	// --- Promotion follow-through (#270): re-home phase-less forming ideas.
	// Ideas collected while forming carry phase='' (no phase existed). Every
	// parking/idea surface on a dated trip is phase-scoped (#196), so leave
	// them phase-less and they'd render nowhere. Attach them to the trip's
	// first phase (the just-seeded "Phase 1") — ideas intact across promotion.
	if (isPromotion) {
		try {
			const firstPhase = e.app.findRecordsByFilter(
				'phases',
				'trip = {:tripId}',
				'+order',
				1,
				0,
				{ tripId: e.record.id }
			);
			if (firstPhase && firstPhase.length > 0) {
				const orphans = e.app.findRecordsByFilter(
					'items',
					'trip = {:tripId} && phase = ""',
					'',
					0,
					0,
					{ tripId: e.record.id }
				);
				for (const orphan of orphans) {
					orphan.set('phase', firstPhase[0].id);
					e.app.save(orphan);
				}
			}
		} catch (_) {
			// No orphaned ideas to re-home.
		}
	}
}, 'trips');
