/// <reference path="../pb_data/types.d.ts" />
// #271 / ADR-0023 Decision 7 — the "poll is the invite" anonymous paint path.
//
// A SIBLING to /api/join/accept, but for Tier-1 poll respondents who paint WITHOUT
// an OTP. The one deliberately-scoped anonymous write path in Waypoint: it trades
// the unique-(trip,user) dedup guarantee for zero-friction poll entry, bounded to
// the availability surface and mitigated by a soft cookie + the name-only re-entry
// picker (ADR-0023 §Decision 7).
//
// POST /api/poll/paint  — anon-capable. Body:
//   { token, name?, soft_token?, member_id?, deltas:[{day,value|null}] }
//   • token       (required) — a valid, non-revoked, non-expired join_token on a
//                              FORMING trip. The gate.
//   • soft_token  (optional) — cookie re-entry key; re-paints the SAME placeholder.
//   • member_id   (optional) — an explicit "that's me" name-only placeholder pick
//                              (from the lookup picker); must be name-only + on this
//                              trip + soft_token-matched or unclaimed.
//   • name        (required on FIRST paint when no soft_token/member_id resolves) —
//                              creates a name-only Placeholder Member.
//   • deltas      — [{ day:'YYYY-MM-DD', value:'available'|'maybe'|null }]. null
//                              clears the day. Capped at 400 entries per call.
//
// SECURITY (session brief + ADR build invariants):
//   - token-gated: no token / bad / revoked / expired / closed / DATED trip → reject.
//   - role CAPPED to the link role, NEVER elevated (a join link is traveler|viewer;
//     the placeholder inherits the link role — never owner/co_owner).
//   - never let paint elevate an EXISTING member: a soft_token / member_id that
//     resolves to a real (user != "") member or a higher role is refused re-keying;
//     paint only writes availability cells, never role.
//   - cells reference trip_members.id (build invariant 1); cascadeDelete on member
//     (invariant 2). removed_at = "" everywhere (invariant 4).
//   - per-IP rate limit on the route (ratelimit.pb.js) blunts placeholder-spam.
//   - the SvelteKit poll route owns the httpOnly soft_token COOKIE (mirrors
//     hooks.server.ts); this hook only MINTS/echoes the token value.
//
// PB 0.27 isolated sandbox — every helper inlined per handler (no file-scope refs).
// Runs in ADMIN context (e.app.save bypasses collection rules) — the anon caller has
// no auth record, so the availability create rule (member.user = auth) can't apply;
// the token gate + explicit member ownership below is the authority instead.
routerAdd('POST', '/api/poll/paint', (e) => {
	const info = e.requestInfo();
	const token = (info.body && info.body['token']) || '';
	if (!token) throw new BadRequestError('Missing token');

	// --- 1. Token gate: a valid, non-revoked, non-expired link on a forming trip.
	let link;
	try {
		link = e.app.findFirstRecordByFilter('join_tokens', 'token = {:token}', { token: token });
	} catch (_) {
		throw new BadRequestError('Poll link not found');
	}
	if (link.get('revoked')) throw new BadRequestError('This poll link has been revoked');
	const expStr = link.getString('expires_at');
	if (expStr && new Date(expStr) < new Date()) {
		throw new BadRequestError('This poll link has expired');
	}

	const tripId = link.getString('trip');
	const linkRole = link.getString('role'); // traveler | viewer — the role CAP.

	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		throw new NotFoundError('Trip not found');
	}
	if (trip.get('archived')) throw new ForbiddenError('This trip is closed');
	// Forming-only: painting a poll on a DATED trip is meaningless (frozen, ADR D9).
	// getString: an empty date reads back a truthy DateTime in goja — use getString.
	if (trip.getString('start_date')) {
		throw new BadRequestError('This trip already has dates — the poll is closed');
	}

	// Role privilege rank (never let a resolved member sit above the link cap).
	const rank = { viewer: 1, traveler: 2, co_owner: 3, owner: 4 };
	const linkRank = rank[linkRole] || 1;

	const softToken = ((info.body && info.body['soft_token']) || '').toString();
	const explicitMemberId = ((info.body && info.body['member_id']) || '').toString();
	const rawName = ((info.body && info.body['name']) || '').toString().trim().slice(0, 60);

	// --- 2. Resolve the respondent's placeholder member (or create one).
	//   a) explicit member_id (the "that's me" picker) → validate + (if given) match
	//      the soft_token; must be a NAME-ONLY, active, non-elevated placeholder.
	//   b) else soft_token cookie → find the placeholder it keys.
	//   c) else create a fresh name-only placeholder at the link role (name required).
	let member = null;

	const validatePlaceholder = (m) => {
		if (!m) return false;
		if (m.getString('trip') !== tripId) return false;
		if (m.getString('removed_at')) return false; // #133 — never a tombstone
		if (m.getString('user')) return false; // a real member is never re-keyed by paint
		// Never let paint touch a placeholder that outranks the link cap.
		if ((rank[m.getString('role')] || 1) > linkRank) return false;
		return true;
	};

	if (explicitMemberId) {
		let m = null;
		try {
			m = e.app.findRecordById('trip_members', explicitMemberId);
		} catch (_) {
			throw new BadRequestError('That member was not found');
		}
		if (!validatePlaceholder(m)) throw new BadRequestError('That is not a claimable poll respondent');
		// If the placeholder carries a soft_token, require it to match (prevents a
		// stranger picking someone else's already-keyed name). An un-keyed placeholder
		// (created out-of-band, e.g. by an organiser) is claimable by first painter.
		const existingSoft = m.getString('soft_token');
		if (existingSoft && softToken && existingSoft !== softToken) {
			throw new ForbiddenError('That respondent belongs to someone else');
		}
		member = m;
	} else if (softToken) {
		try {
			member = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:trip} && soft_token = {:st} && user = "" && removed_at = ""',
				{ trip: tripId, st: softToken }
			);
		} catch (_) {
			member = null; // cookie didn't resolve — fall through to create.
		}
		if (member && !validatePlaceholder(member)) member = null;
	}

	// Mint or reuse the soft_token for the response (SvelteKit sets the cookie).
	let outSoftToken = softToken;

	if (!member) {
		// Fresh respondent — name required to create a name-only Placeholder Member.
		if (!rawName) {
			// No identity resolved and no name given → the page must collect a name.
			throw new BadRequestError('NAME_REQUIRED');
		}
		if (!outSoftToken) outSoftToken = $security.randomString(40);
		const col = e.app.findCollectionByNameOrId('trip_members');
		member = new Record(col);
		member.set('trip', tripId);
		member.set('role', linkRole); // CAPPED to the link role — never elevated.
		member.set('display_name', rawName);
		member.set('placeholder_name', rawName);
		member.set('soft_token', outSoftToken);
		try {
			e.app.save(member);
		} catch (err) {
			throw new BadRequestError('Failed to create respondent: ' + err);
		}
	} else {
		// Reusing an existing placeholder. Update the name if a new one was given, and
		// ensure it carries the soft_token going forward (so cookie re-entry keys it).
		let changed = false;
		if (rawName && member.getString('display_name') !== rawName) {
			member.set('display_name', rawName);
			member.set('placeholder_name', rawName);
			changed = true;
		}
		if (!member.getString('soft_token')) {
			if (!outSoftToken) outSoftToken = $security.randomString(40);
			member.set('soft_token', outSoftToken);
			changed = true;
		} else {
			outSoftToken = member.getString('soft_token');
		}
		if (changed) {
			try {
				e.app.save(member);
			} catch (_) {}
		}
	}

	const memberId = member.id;

	// --- 3. Apply the availability deltas (upsert / clear), keyed on member.id.
	let deltas = (info.body && info.body['deltas']) || [];
	if (!Array.isArray(deltas)) deltas = [];
	if (deltas.length > 400) deltas = deltas.slice(0, 400); // cap per call.

	const availCol = e.app.findCollectionByNameOrId('availability');
	let written = 0;
	for (const d of deltas) {
		const day = String((d && d.day) || '').slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
		const value = d && d.value;
		const dayStamp = day + ' 00:00:00.000Z';

		// Existing cell for (trip, member, day)?
		let existing = null;
		try {
			existing = e.app.findFirstRecordByFilter(
				'availability',
				'trip = {:trip} && member = {:member} && day >= {:lo} && day <= {:hi}',
				{ trip: tripId, member: memberId, lo: day + ' 00:00:00.000Z', hi: day + ' 23:59:59.999Z' }
			);
		} catch (_) {
			existing = null;
		}

		if (value === null || value === undefined || value === '') {
			if (existing) {
				try { e.app.delete(existing); written++; } catch (_) {}
			}
			continue;
		}
		if (value !== 'available' && value !== 'maybe') continue;

		try {
			if (existing) {
				existing.set('value', value);
				e.app.save(existing);
			} else {
				const cell = new Record(availCol);
				cell.set('trip', tripId);
				cell.set('member', memberId);
				cell.set('day', dayStamp);
				cell.set('value', value);
				e.app.save(cell);
			}
			written++;
		} catch (_) {
			// best-effort per cell.
		}
	}

	return e.json(200, {
		ok: true,
		member_id: memberId,
		soft_token: outSoftToken,
		written: written,
		role: member.getString('role')
	});
});

// GET /api/poll/lookup?token=…&soft_token=… — anon poll context for the public
// route: trip title + role + whether the soft_token already keys a respondent
// (so the page can greet "Welcome back, <name>") + the name-only respondent list
// for the "that's me" picker. Mirrors join/lookup but for the poll surface and does
// NOT require auth. Never leaks roster/itinerary/money (only respondent NAMES for
// the picker — the poll's whole point is name-only participation).
routerAdd('GET', '/api/poll/lookup', (e) => {
	const query = e.requestInfo().query || {};
	const token = Array.isArray(query['token']) ? query['token'][0] : query['token'] || '';
	const softToken = Array.isArray(query['soft_token'])
		? query['soft_token'][0]
		: query['soft_token'] || '';
	if (!token) throw new BadRequestError('Missing token');

	let link;
	try {
		link = e.app.findFirstRecordByFilter('join_tokens', 'token = {:token}', { token: token });
	} catch (_) {
		return e.json(404, { error: 'Poll link not found' });
	}
	if (link.get('revoked')) return e.json(404, { error: 'Poll link not found' });

	const tripId = link.getString('trip');
	let trip;
	try {
		trip = e.app.findRecordById('trips', tripId);
	} catch (_) {
		return e.json(404, { error: 'Poll link not found' });
	}

	const expStr = link.getString('expires_at');
	const expired = expStr ? new Date(expStr) < new Date() : false;
	const closed = !!trip.get('archived');
	// Painting is only meaningful while forming (getString for date truthiness).
	const dated = !!trip.getString('start_date');

	const resp = {
		role: link.getString('role'),
		trip_title: trip.getString('title'),
		expired: expired,
		closed: closed,
		dated: dated,
		me: null, // { member_id, name } when the soft_token keys an active placeholder
		respondents: [] // name-only placeholders for the "that's me" picker
	};

	if (expired || closed || dated) return e.json(200, resp);

	// The caller's own respondent (cookie match).
	if (softToken) {
		try {
			const mine = e.app.findFirstRecordByFilter(
				'trip_members',
				'trip = {:trip} && soft_token = {:st} && user = "" && removed_at = ""',
				{ trip: tripId, st: softToken }
			);
			resp.me = {
				member_id: mine.id,
				name: mine.getString('display_name') || mine.getString('placeholder_name') || ''
			};
		} catch (_) {}
	}

	// Name-only respondents (#133 guard) for the picker.
	let placeholders = [];
	try {
		placeholders = e.app.findRecordsByFilter(
			'trip_members',
			'trip = {:trip} && user = "" && placeholder_email = "" && removed_at = ""',
			'',
			0,
			0,
			{ trip: tripId }
		);
	} catch (_) {}
	for (const p of placeholders) {
		const name = p.getString('display_name') || p.getString('placeholder_name') || '';
		if (!name) continue;
		resp.respondents.push({ member_id: p.id, name: name });
	}

	return e.json(200, resp);
});
