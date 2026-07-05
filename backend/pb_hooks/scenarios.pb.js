/// <reference path="../pb_data/types.d.ts" />
// #337 (Candidate Scenarios) — champion-only edit/delete gate that PB rules can't
// express in one expression.
//
// create role gating lives in the rule (0063: champion is a single relation, so
// `champion.user = auth && champion.role != "viewer"` is unambiguous). Edit and
// delete act on an EXISTING scenario whose champion may differ from the caller, so
// the caller's own identity is resolved here and compared to the champion — the
// spec's "edit/delete = champion only (fork instead of edit-war)".
//
// The promotion cascade (milestone 5) flips status → won/archived via admin-context
// e.app.save(), which bypasses these REQUEST hooks entirely — so promotion is not
// blocked by the champion gate.
//
// PB 0.27 runs each callback in an isolated sandbox — top-of-file helpers are
// invisible inside the body, so the membership lookup is inlined per handler
// (mirrors trip_goals.pb.js).

// edit: champion only. The active-member lookup appends `removed_at = ""` (the
// standing invariant — a departed member is not an active champion).
onRecordUpdateRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user} && removed_at = ""',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (e.record.get('champion') !== member.id) {
		throw new ForbiddenError('Only the champion can edit this scenario — fork it instead.');
	}

	e.next();
}, 'scenarios');

// delete: champion only.
onRecordDeleteRequest((e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) {
		throw new BadRequestError('Not authenticated.');
	}

	let member;
	try {
		member = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user} && removed_at = ""',
			{ trip: e.record.get('trip'), user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip.');
	}

	if (e.record.get('champion') !== member.id) {
		throw new ForbiddenError('Only the champion can delete this scenario.');
	}

	e.next();
}, 'scenarios');

// #337 — the promotion cascade (spec §Promotion). An owner/co_owner picks a
// scenario ("Go with this one"); the trip is dated, the sketch becomes real phases,
// the budget is seeded, and an IMMUTABLE decision record is minted (client writes to
// `decisions` are denied by rule — this admin-context route is the only writer).
//
// Runs in an ADMIN context: e.app.save bypasses collection rules + request hooks, so
// it can flip losing champions' statuses and mint the decision. All logic is inlined
// (goja isolated sandbox — no src/lib imports). The date math mirrors
// scenario-planning.ts (nights = day-transitions; phase starts at cumulative offsets).
//
// Body: { trip_id, scenario_id }. Auth: owner/co_owner of the trip only.
routerAdd('POST', '/api/scenarios/promote', (e) => {
	const authId = e.requestInfo().auth?.id;
	if (!authId) throw new UnauthorizedError('Authentication required');

	const info = e.requestInfo();
	const tripId = (info.body && info.body['trip_id']) || '';
	const scenarioId = (info.body && info.body['scenario_id']) || '';
	if (!tripId || !scenarioId) throw new BadRequestError('trip_id and scenario_id are required');

	// Caller must be an active owner/co_owner of the trip.
	let caller;
	try {
		caller = e.app.findFirstRecordByFilter(
			'trip_members',
			'trip = {:trip} && user = {:user} && removed_at = ""',
			{ trip: tripId, user: authId }
		);
	} catch (_) {
		throw new ForbiddenError('You are not a member of this trip');
	}
	const role = caller.get('role');
	if (role !== 'owner' && role !== 'co_owner') {
		throw new ForbiddenError('Only an owner or co-owner can choose a scenario');
	}

	// The trip must still be forming (dateless). getString: an empty date field reads
	// back as a truthy DateTime object in goja — use getString for truthiness.
	const trip = e.app.findRecordById('trips', tripId);
	if (trip.getString('start_date')) {
		throw new BadRequestError('This trip already has dates');
	}

	const winner = e.app.findRecordById('scenarios', scenarioId);
	if (winner.get('trip') !== tripId) throw new NotFoundError('Scenario not found');

	const dateStart = winner.getString('date_start').substring(0, 10);
	const dateEnd = winner.getString('date_end').substring(0, 10);
	if (!dateStart || !dateEnd) {
		throw new BadRequestError('This scenario needs both dates before it can be chosen');
	}
	if (dateEnd < dateStart) throw new BadRequestError('The scenario’s end date is before its start date');

	// Inlined date helpers (goja).
	const addDays = (day, n) => {
		const dt = new Date(day + 'T00:00:00.000Z');
		dt.setUTCDate(dt.getUTCDate() + n);
		return dt.toISOString().slice(0, 10);
	};

	// A JSON field read via record.get() in goja comes back as raw bytes (a number
	// array) OR a string, NOT a native array (the budgets.pb.js bug-class). Coerce to
	// a real array.
	const readJsonArray = (raw) => {
		if (Array.isArray(raw) && (raw.length === 0 || typeof raw[0] !== 'number')) return raw;
		if (Array.isArray(raw) && typeof raw[0] === 'number') {
			try { return JSON.parse(String.fromCharCode.apply(null, raw)); } catch (_) { return []; }
		}
		if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (_) { return []; } }
		return [];
	};

	// Active members (for the budget envelope + chooser name in the snapshot).
	const members = e.app.findRecordsByFilter('trip_members', 'trip = {:trip} && removed_at = ""', '', 0, 0, { trip: tripId });
	const memberName = (id) => {
		for (const m of members) {
			if (m.id === id) return m.get('display_name') || m.get('placeholder_name') || 'Someone';
		}
		return 'Someone';
	};

	// All scenarios on the trip + their votes/points — the decision snapshot (built
	// BEFORE any mutation, capturing the pre-promotion board).
	const allScenarios = e.app.findRecordsByFilter('scenarios', 'trip = {:trip}', '', 0, 0, { trip: tripId });
	const snapshots = [];
	for (const s of allScenarios) {
		const votes = { love: 0, like: 0, flexible: 0, dislike: 0 };
		const vrows = e.app.findRecordsByFilter('scenario_votes', 'scenario = {:s}', '', 0, 0, { s: s.id });
		for (const v of vrows) {
			const val = v.get('value');
			if (votes[val] !== undefined) votes[val] += 1;
		}
		const pros = [], cons = [];
		const prows = e.app.findRecordsByFilter('scenario_points', 'scenario = {:s}', '+created', 0, 0, { s: s.id });
		for (const p of prows) {
			(p.get('kind') === 'pro' ? pros : cons).push(p.get('text'));
		}
		// Champion name.
		let champName = 'Someone';
		try {
			const cm = e.app.findRecordById('trip_members', s.get('champion'));
			champName = cm.get('display_name') || cm.get('placeholder_name') || 'Someone';
			if (!champName || champName === 'Someone') {
				const cu = cm.get('user');
				if (cu) { try { const u = e.app.findRecordById('users', cu); champName = u.get('name') || champName; } catch (_) {} }
			}
		} catch (_) {}
		// Keystone labels.
		const keystoneLabels = [];
		const ks = s.get('keystones') || [];
		for (const kid of ks) {
			try { const it = e.app.findRecordById('items', kid); keystoneLabels.push(it.get('title')); } catch (_) {}
		}
		const sketch = readJsonArray(s.get('phase_sketch'));
		snapshots.push({
			id: s.id,
			title: s.get('title'),
			pitch: s.get('pitch') || '',
			champion_name: champName,
			date_start: s.getString('date_start').substring(0, 10),
			date_end: s.getString('date_end').substring(0, 10),
			budget_per_person: s.get('budget_per_person') > 0 ? s.get('budget_per_person') : 0,
			phase_sketch: sketch,
			keystone_labels: keystoneLabels,
			votes: votes,
			pros: pros,
			cons: cons,
			won: s.id === winner.id
		});
	}

	const winnerBudget = winner.get('budget_per_person') > 0 ? winner.get('budget_per_person') : 0;
	const payload = {
		chosen_scenario: winner.id,
		chosen_title: winner.get('title'),
		chooser: caller.id,
		chooser_name: memberName(caller.id),
		decided_at: new Date().toISOString(),
		date_start: dateStart,
		date_end: dateEnd,
		budget_per_person: winnerBudget,
		scenarios: snapshots
	};

	// --- 1. Set the trip dates. NOTE: a programmatic e.app.save() fires the MODEL
	// hooks, NOT the onRecordUpdateRequest hooks — so the trips.pb.js forming→dated
	// seeding (days + Phase 1) does NOT run from here. We seed days + phases + re-home
	// ideas DIRECTLY below, in full control (mirrors that hook + the tiling engine).
	trip.set('start_date', dateStart + ' 00:00:00.000Z');
	trip.set('end_date', dateEnd + ' 00:00:00.000Z');
	e.app.save(trip);

	// --- 2. Build the phase layout from the sketch (normalize nights to the window,
	// auto-stretch the last leg; mirrors normalizeSketchToWindow + sketchToPhaseLayout).
	// No sketch → a single whole-trip "Phase 1" (a valid one-phase trip, ADR-0021).
	const sketch = readJsonArray(winner.get('phase_sketch'));
	const legs = [];
	for (const seg of sketch) {
		const nm = String((seg && seg.name) || '').trim();
		const dy = Math.max(1, Math.round(Number(seg && seg.days) || 1));
		if (nm) legs.push({ name: nm, days: dy });
	}

	const window = (function () {
		const a = new Date(dateStart + 'T00:00:00.000Z').getTime();
		const b = new Date(dateEnd + 'T00:00:00.000Z').getTime();
		return Math.max(1, Math.round((b - a) / 86400000));
	})();

	let layout;
	if (legs.length === 0) {
		layout = [{ name: 'Phase 1', start: dateStart }];
	} else {
		let norm;
		if (legs.length === 1) {
			norm = [{ name: legs[0].name, days: window }];
		} else {
			norm = [];
			for (let i = 0; i < legs.length; i++) {
				norm.push({ name: legs[i].name, days: i < legs.length - 1 ? Math.max(1, legs[i].days) : 0 });
			}
			let headSum = 0;
			for (let i = 0; i < norm.length - 1; i++) headSum += norm[i].days;
			while (headSum > window - 1 && norm.length > 1) {
				const ti = norm.length - 2;
				if (norm[ti].days > 1) { norm[ti].days -= 1; headSum -= 1; }
				else { norm.splice(ti, 1); headSum -= 1; }
			}
			norm[norm.length - 1] = { name: norm[norm.length - 1].name, days: window - headSum };
		}
		layout = [];
		let offset = 0;
		for (const seg of norm) {
			layout.push({ name: seg.name, start: addDays(dateStart, offset) });
			offset += Math.max(1, seg.days);
		}
	}

	// Create the phases at their layout starts. Any pre-existing phases (there should
	// be none on a forming trip) are cleared first so the layout is authoritative.
	const preexisting = e.app.findRecordsByFilter('phases', 'trip = {:trip}', '', 0, 0, { trip: tripId });
	for (const p of preexisting) { try { e.app.delete(p); } catch (_) {} }
	const phasesCol = e.app.findCollectionByNameOrId('phases');
	for (let i = 0; i < layout.length; i++) {
		const end = i < layout.length - 1 ? layout[i + 1].start : dateEnd; // shared boundary
		const p = new Record(phasesCol);
		p.set('trip', tripId);
		p.set('name', layout[i].name);
		p.set('start_date', layout[i].start + ' 00:00:00.000Z');
		p.set('end_date', end + ' 00:00:00.000Z');
		p.set('order', i);
		e.app.save(p);
	}

	// Generate the day records for every date in the window, bucketed into the phases
	// whose range contains them (shared boundary → a travel day belongs to two).
	const phases = e.app.findRecordsByFilter('phases', 'trip = {:trip}', '+order', 0, 0, { trip: tripId });
	const daysCol = e.app.findCollectionByNameOrId('days');
	let cursor = dateStart;
	while (cursor <= dateEnd) {
		const day = new Record(daysCol);
		day.set('trip', tripId);
		day.set('date', cursor + ' 00:00:00.000Z');
		const matched = [];
		for (const p of phases) {
			const ps = p.getString('start_date').substring(0, 10);
			const pe = p.getString('end_date').substring(0, 10);
			if (cursor >= ps && cursor <= pe) matched.push(p.id);
		}
		if (matched.length > 0) day.set('phases', matched);
		e.app.save(day);
		cursor = addDays(cursor, 1);
	}

	// Re-home the phase-less forming ideas into the first phase (mirrors the
	// trips.pb.js promotion follow-through). Ideas collected while forming carry
	// phase='' — assign them to the first (chronological) phase so they aren't
	// orphaned once the trip is dated.
	if (phases.length > 0) {
		const firstPhaseId = phases[0].id;
		const orphanItems = e.app.findRecordsByFilter('items', 'trip = {:trip} && phase = ""', '', 0, 0, { trip: tripId });
		for (const it of orphanItems) {
			it.set('phase', firstPhaseId);
			try { e.app.save(it); } catch (_) {}
		}
	}

	// --- 3. budget_per_person → seed a trip budget envelope (best-effort).
	if (winnerBudget > 0) {
		let hasBudget = false;
		try { e.app.findFirstRecordByFilter('trip_budgets', 'trip = {:trip}', { trip: tripId }); hasBudget = true; } catch (_) {}
		if (!hasBudget) {
			try {
				const groupTotal = winnerBudget * Math.max(1, members.length);
				const b = new Record(e.app.findCollectionByNameOrId('trip_budgets'));
				b.set('trip', tripId);
				b.set('categories', [{ category: 'other', mode: 'total', daily_amount: null, total: groupTotal }]);
				e.app.save(b);
			} catch (_) {}
		}
	}

	// --- 4. Mint the immutable decision record; archive losers; mark the winner won.
	const decision = new Record(e.app.findCollectionByNameOrId('decisions'));
	decision.set('trip', tripId);
	decision.set('payload', payload);
	e.app.save(decision);

	for (const s of allScenarios) {
		const next = s.id === winner.id ? 'won' : 'archived';
		if (s.get('status') !== next) {
			s.set('status', next);
			try { e.app.save(s); } catch (_) {}
		}
	}

	return e.json(200, { ok: true, decision_id: decision.id, date_start: dateStart, date_end: dateEnd });
});
