#!/usr/bin/env node
// M2d suggestions harness.
// Tests: create (auto-approve paths), list, review (approve, reject).
// Requires: PocketBase on $PUBLIC_PB_URL, WAYPOINT_DEV_MODE=true, E2E_TEST_EMAILS set.

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const BASE = process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';

const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

let passed = 0;
let failed = 0;

function pass(label) { console.log('  PASS ', label); passed++; }
function fail(label, detail) { console.error('  FAIL ', label, detail ? `(${detail})` : ''); failed++; }

async function bypass(email) {
	const res = await fetch(`${BASE}/api/dev/auth-bypass`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email })
	});
	if (!res.ok) throw new Error(`bypass failed for ${email}: ${res.status}`);
	const { token } = await res.json();
	return token;
}

async function api(method, path, body, token) {
	const res = await fetch(`${BASE}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: 'Bearer ' + token } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	let json = null;
	try { json = await res.json(); } catch (_) {}
	return { status: res.status, json };
}

// ─── setup ──────────────────────────────────────────────────────────────────

const tokens = {};
for (const [role, email] of Object.entries(EMAILS)) {
	tokens[role] = await bypass(email);
}

const fixtureRes = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS }, tokens.owner);
if (fixtureRes.status !== 200) {
	console.error('FATAL: fixture creation failed', fixtureRes.status, fixtureRes.json);
	process.exit(1);
}
const { tripId, memberIds } = fixtureRes.json;

// ─── helpers ────────────────────────────────────────────────────────────────

const samplePayload = {
	title: 'Test suggestion item',
	type: 'activity',
	slot: 'morning',
	description: 'A test suggestion'
};

// Role → trip_members.id straight from the fixture's authoritative memberIds map
// (same as test-members.mjs). Querying trip_members by `user.email` as a non-superuser
// returns empty (listRule + emailVisibility=false), which silently sent empty member
// ids → the 400s and the empty attribution expectation. Used to assert #249
// attribution: an approved item's created_by must be the AUTHOR's member id.
const travelerMemberId = memberIds.traveler;

// ─── 1. Viewer cannot suggest ────────────────────────────────────────────────

console.log('\n1. Viewer blocked from suggesting');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.viewer);
	r.status === 403
		? pass('viewer create → 403')
		: fail('viewer create → 403', `got ${r.status}`);
}

// ─── 2. Non-member cannot suggest ────────────────────────────────────────────

console.log('\n2. Non-member blocked');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: samplePayload }, tokens.non_member);
	r.status === 403
		? pass('non-member create → 403')
		: fail('non-member create → 403', `got ${r.status}`);
}

// ─── 3. Missing title → 400 ───────────────────────────────────────────────────

console.log('\n3. Validation: missing title');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { type: 'activity' } }, tokens.traveler);
	r.status === 400
		? pass('missing title → 400')
		: fail('missing title → 400', `got ${r.status}`);
}

// ─── 4. Owner suggestion → auto-approved ─────────────────────────────────────

console.log('\n4. Owner suggestion auto-approved');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Owner suggestion' } }, tokens.owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('owner create → auto-approved')
		: fail('owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.item_id
		? pass('owner create → item created')
		: fail('owner create → item created', 'no item_id returned');
}

// ─── 5. Co-owner suggestion → auto-approved ──────────────────────────────────

console.log('\n5. Co-owner suggestion auto-approved');
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Co-owner suggestion' } }, tokens.co_owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('co_owner create → auto-approved')
		: fail('co_owner create → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
}

// ─── 6. Traveler with auto_approve=true → auto-approved ──────────────────────

console.log('\n6. Traveler + auto_approve=true → auto-approved');
{
	const adminToken = (await api('POST', '/api/admins/auth-with-password',
		{ identity: process.env.PB_ADMIN_EMAIL || 'admin@waypoint.local', password: process.env.PB_ADMIN_PASSWORD || 'adminpassword123' },
		null)).json?.token;

	if (adminToken) {
		const updateRes = await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
			body: JSON.stringify({ auto_approve_suggestions: true })
		});
		if (updateRes.ok) {
			const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler auto-approve' } }, tokens.traveler);
			r.status === 200 && r.json.status === 'approved'
				? pass('traveler + auto_approve=true → auto-approved')
				: fail('traveler + auto_approve=true → auto-approved', `${r.status} ${JSON.stringify(r.json)}`);
			r.json.item_id
				? pass('traveler auto-approve → item created')
				: fail('traveler auto-approve → item created', 'no item_id');

			await fetch(`${BASE}/api/collections/trips/records/${tripId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
				body: JSON.stringify({ auto_approve_suggestions: false })
			});
		} else {
			fail('traveler + auto_approve=true → auto-approved', 'could not enable auto_approve on trip');
		}
	} else {
		console.log('  SKIP traveler auto-approve (no admin credentials — set PB_ADMIN_EMAIL + PB_ADMIN_PASSWORD in .env.local)');
	}
}

// ─── 7. Traveler with auto_approve=false → pending ───────────────────────────

console.log('\n7. Traveler + auto_approve=false → pending');
let pendingSuggestionId = '';
{
	const r = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Traveler pending suggestion' } }, tokens.traveler);
	r.status === 200 && r.json.status === 'pending'
		? pass('traveler + auto_approve=false → pending')
		: fail('traveler + auto_approve=false → pending', `${r.status} ${JSON.stringify(r.json)}`);
	!r.json.item_id
		? pass('traveler pending → no item created yet')
		: fail('traveler pending → no item created yet', 'item_id was returned unexpectedly');
	pendingSuggestionId = r.json.suggestion_id || '';
}

// ─── 8. List endpoint: owner sees pending ────────────────────────────────────

console.log('\n8. Owner can list pending suggestions');
{
	const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.owner);
	r.status === 200 && Array.isArray(r.json.items)
		? pass('owner list pending → 200 + items array')
		: fail('owner list pending → 200', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.items?.some((s) => s.id === pendingSuggestionId)
		? pass('owner list → contains traveler pending suggestion')
		: fail('owner list → contains traveler pending suggestion', `items: ${JSON.stringify(r.json.items?.map(s => s.id))}`);
}

// ─── 9. Co-owner can list ────────────────────────────────────────────────────

console.log('\n9. Co-owner list');
{
	const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}&status=pending`, null, tokens.co_owner);
	r.status === 200
		? pass('co_owner list → 200')
		: fail('co_owner list → 200', `got ${r.status}`);
}

// ─── 10. Review gating ───────────────────────────────────────────────────────

console.log('\n10. Review gating');
if (pendingSuggestionId) {
	const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.viewer);
	r.status === 403
		? pass('viewer review → 403')
		: fail('viewer review → 403', `got ${r.status}`);

	const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.traveler);
	r2.status === 403
		? pass('traveler review → 403')
		: fail('traveler review → 403', `got ${r2.status}`);
}

// ─── 11. Owner rejects a suggestion (#250 — note REQUIRED) ───────────────────

console.log('\n11. Owner reject (note required)');
let rejectTargetId = '';
{
	const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'To be rejected' } }, tokens.traveler);
	rejectTargetId = createRes.json.suggestion_id || '';

	if (rejectTargetId) {
		// #250 — no one-tap reject: a reject with no note is a 400.
		const rNoNote = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject' }, tokens.owner);
		rNoNote.status === 400
			? pass('reject without note → 400')
			: fail('reject without note → 400', `got ${rNoNote.status} ${JSON.stringify(rNoNote.json)}`);

		// With a note → rejected.
		const note = 'Not a fit for this trip';
		const r = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject', review_note: note }, tokens.owner);
		r.status === 200 && r.json.status === 'rejected'
			? pass('owner reject with note → 200 + status=rejected')
			: fail('owner reject with note → 200', `${r.status} ${JSON.stringify(r.json)}`);
		!r.json.item_id
			? pass('reject → no item created')
			: fail('reject → no item created', 'item_id returned');

		// #250 — the note is persisted on the suggestion (migration 0051 review_note).
		const detail = await api('GET', `/api/collections/suggestions/records/${rejectTargetId}`, null, tokens.owner);
		detail.json?.review_note === note
			? pass('reject → review_note stored on suggestion')
			: fail('reject → review_note stored', `got "${detail.json?.review_note}"`);

		const r2 = await api('POST', '/api/suggestions/review', { suggestion_id: rejectTargetId, action: 'reject', review_note: note }, tokens.owner);
		r2.status === 400
			? pass('double-reject → 400')
			: fail('double-reject → 400', `got ${r2.status}`);
	} else {
		fail('owner reject → could not create target suggestion');
	}
}

// ─── 12. Owner approves a suggestion → item created + AUTHOR-attributed (#249) ─

console.log('\n12. Owner approve → item created + author-attributed');
if (pendingSuggestionId) {
	const r = await api('POST', '/api/suggestions/review', { suggestion_id: pendingSuggestionId, action: 'approve' }, tokens.owner);
	r.status === 200 && r.json.status === 'approved'
		? pass('owner approve → 200 + status=approved')
		: fail('owner approve → 200', `${r.status} ${JSON.stringify(r.json)}`);
	r.json.item_id
		? pass('owner approve → item created')
		: fail('owner approve → item created', 'no item_id returned');

	// #249 LETHAL ATTRIBUTION SCAR — the approved item's created_by is a
	// trip_members.id and must be the AUTHOR (traveler) member id, NEVER the
	// reviewing owner's. pendingSuggestionId was authored by the traveler.
	if (r.json.item_id) {
		const itemRes = await api('GET', `/api/collections/items/records/${r.json.item_id}`, null, tokens.owner);
		itemRes.json?.created_by === travelerMemberId
			? pass('approve → item created_by = author (traveler) member id, not reviewer')
			: fail('approve → item created_by = author', `got "${itemRes.json?.created_by}", expected traveler "${travelerMemberId}"`);
	}
}

// ─── 12b. Approve migrates the ghost's votes → item votes (#249) ──────────────

console.log('\n12b. Approve migrates suggestion_votes → item votes');
{
	// Fresh pending suggestion authored by the traveler.
	const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Voted then approved' } }, tokens.traveler);
	const sid = createRes.json.suggestion_id || '';
	if (sid) {
		// Co-owner casts a vote on the ghost (not the author → allowed by rule 0049).
		const coMemberId = memberIds.co_owner;
		const voteRes = await api('POST', '/api/collections/suggestion_votes/records', { suggestion: sid, member: coMemberId, value: 'love' }, tokens.co_owner);
		voteRes.status === 200 || voteRes.status === 201
			? pass('co_owner votes the ghost (suggestion_votes create)')
			: fail('co_owner votes the ghost', `${voteRes.status} ${JSON.stringify(voteRes.json)}`);

		// Owner approves → the love vote should appear as a votes row on the item.
		const appr = await api('POST', '/api/suggestions/review', { suggestion_id: sid, action: 'approve' }, tokens.owner);
		const itemId = appr.json?.item_id || '';
		if (itemId) {
			const votesRes = await api('GET', `/api/collections/votes/records?filter=${encodeURIComponent(`item = "${itemId}"`)}`, null, tokens.owner);
			const migrated = (votesRes.json?.items || []).filter((v) => v.value === 'love' && v.member === coMemberId);
			migrated.length >= 1
				? pass('approve → ghost love vote migrated to item votes (same member + value)')
				: fail('approve → vote migrated', `votes: ${JSON.stringify(votesRes.json?.items)}`);
		} else {
			fail('approve → vote migrated', 'no item_id from approve');
		}
	} else {
		fail('vote-migration → could not create target suggestion');
	}
}

// ─── 13. Edit-and-approve: approve with modified payload ─────────────────────

console.log('\n13. Edit-and-approve (modified payload)');
{
	const createRes = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Edit me' } }, tokens.traveler);
	const eid = createRes.json.suggestion_id || '';
	if (eid) {
		const modifiedPayload = { ...samplePayload, title: 'Edited by owner', description: 'Modified' };
		const r = await api('POST', '/api/suggestions/review', { suggestion_id: eid, action: 'approve', payload: modifiedPayload }, tokens.owner);
		r.status === 200 && r.json.item_id
			? pass('edit-and-approve → item created with modified payload')
			: fail('edit-and-approve → item created', `${r.status} ${JSON.stringify(r.json)}`);
	} else {
		fail('edit-and-approve → could not create target');
	}
}

// ─── 14. #402 — approval carries the AUTHOR's own not going, nobody else's ──────
// Suggestion approval treats not_going the way it treats assigned_to (copied onto
// the new item), but not going is self-only: only the author's own id survives.
// Going and not going stay exclusive on the new item (going wins a tie).

console.log('\n14. #402 not going on approval (author-only, exclusive)');
{
	const sameIds = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x) => b.includes(x));
	const readItem = async (id) => (await api('GET', `/api/collections/items/records/${id}`, null, tokens.owner)).json || {};

	// (a) Owner create → auto-approved: owner's own not going kept, traveler's dropped.
	const a = await api('POST', '/api/suggestions/create', {
		trip_id: tripId,
		payload: { ...samplePayload, title: 'Owner not going (#402)', assigned_to: [memberIds.co_owner], not_going: [memberIds.owner, memberIds.traveler] }
	}, tokens.owner);
	if (a.json?.item_id) {
		const it = await readItem(a.json.item_id);
		sameIds(it.not_going, [memberIds.owner]) && sameIds(it.assigned_to, [memberIds.co_owner])
			? pass('auto-approve → only the author\'s not going is kept; assigned_to copied')
			: fail('auto-approve → author-only not going', `assigned_to=${JSON.stringify(it.assigned_to)} not_going=${JSON.stringify(it.not_going)}`);
	} else {
		fail('auto-approve → author-only not going', `create: ${a.status} ${JSON.stringify(a.json)}`);
	}

	// (b) Traveler's pending suggestion → owner approves: the AUTHOR's not going is kept.
	const b = await api('POST', '/api/suggestions/create', {
		trip_id: tripId,
		payload: { ...samplePayload, title: 'Traveler not going (#402)', not_going: [memberIds.traveler, memberIds.co_owner] }
	}, tokens.traveler);
	const bApproved = b.json?.suggestion_id
		? await api('POST', '/api/suggestions/review', { suggestion_id: b.json.suggestion_id, action: 'approve' }, tokens.owner)
		: null;
	if (bApproved?.json?.item_id) {
		const it = await readItem(bApproved.json.item_id);
		sameIds(it.not_going, [memberIds.traveler])
			? pass('approve → the author\'s (traveler) not going is kept, the co_owner\'s dropped')
			: fail('approve → author-only not going', `not_going=${JSON.stringify(it.not_going)}`);
	} else {
		fail('approve → author-only not going', `create ${b.status} / approve ${bApproved?.status} ${JSON.stringify(bApproved?.json)}`);
	}

	// (c) Contradictory payload (author in both lists) → going wins on the item.
	const c = await api('POST', '/api/suggestions/create', {
		trip_id: tripId,
		payload: { ...samplePayload, title: 'Both lists (#402)', assigned_to: [memberIds.traveler], not_going: [memberIds.traveler] }
	}, tokens.traveler);
	const cApproved = c.json?.suggestion_id
		? await api('POST', '/api/suggestions/review', { suggestion_id: c.json.suggestion_id, action: 'approve' }, tokens.owner)
		: null;
	if (cApproved?.json?.item_id) {
		const it = await readItem(cApproved.json.item_id);
		sameIds(it.assigned_to, [memberIds.traveler]) && sameIds(it.not_going, [])
			? pass('approve → author in both lists ends up going only (exclusive)')
			: fail('approve → exclusive lists', `assigned_to=${JSON.stringify(it.assigned_to)} not_going=${JSON.stringify(it.not_going)}`);
	} else {
		fail('approve → exclusive lists', `create ${c.status} / approve ${cApproved?.status} ${JSON.stringify(cApproved?.json)}`);
	}
}

// ─── 15. #444 — Save: update a pending suggestion's payload, status unchanged ───
// POST /api/suggestions/update: owner/co_owner only; pending only; replaces the
// payload; the author's not going survives an edit that omits it.

console.log('\n15. #444 update (Save keeps it pending)');
{
	const sameIds = (a, b) => Array.isArray(a) && a.length === b.length && a.every((x) => b.includes(x));
	const mk = async (title, extra = {}) => {
		const c = await api('POST', '/api/suggestions/create', {
			trip_id: tripId,
			payload: { ...samplePayload, title, ...extra }
		}, tokens.traveler);
		return c.json?.suggestion_id || '';
	};
	const read = async (id) => {
		const r = await api('GET', `/api/suggestions/list?trip_id=${tripId}`, null, tokens.owner);
		return (r.json?.items || []).find((s) => s.id === id);
	};

	const sid = await mk('Save me (#444)', { not_going: [memberIds.traveler] });
	const edited = { ...samplePayload, title: 'Saved by owner (#444)', description: 'Edited' };

	for (const role of ['traveler', 'viewer', 'non_member']) {
		const r = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: edited }, tokens[role]);
		r.status === 403 ? pass(`${role} cannot update a suggestion (403)`) : fail(`${role} cannot update`, `${r.status} ${JSON.stringify(r.json)}`);
	}
	const anon = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: edited });
	anon.status === 401 ? pass('unauthenticated update -> 401') : fail('unauthenticated update', `${anon.status}`);
	const untouched = await read(sid);
	untouched?.payload?.title === 'Save me (#444)' ? pass('refused updates left the payload untouched') : fail('payload untouched after refused updates', JSON.stringify(untouched?.payload));

	const bad = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: { ...edited, title: '  ' } }, tokens.owner);
	bad.status === 400 ? pass('update with blank title -> 400') : fail('blank title', `${bad.status}`);
	const noId = await api('POST', '/api/suggestions/update', { payload: edited }, tokens.owner);
	noId.status === 400 ? pass('update without suggestion_id -> 400') : fail('missing id', `${noId.status}`);

	const ok = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: edited }, tokens.owner);
	const after = await read(sid);
	ok.status === 200 && after?.status === 'pending' && after?.payload?.title === 'Saved by owner (#444)'
		? pass('owner Save -> 200, payload replaced, still pending')
		: fail('owner Save', `${ok.status} ${JSON.stringify(ok.json)} ${JSON.stringify(after)}`);
	sameIds(after?.payload?.not_going, [memberIds.traveler])
		? pass('Save keeps the author\'s not going when the edit omits it')
		: fail('Save keeps not_going', JSON.stringify(after?.payload?.not_going));
	!after?.reviewed_at
		? pass('Save does not stamp reviewed_at') : fail('Save stamped reviewed_at', after?.reviewed_at);

	const co = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: { ...edited, title: 'Saved by co-owner (#444)' } }, tokens.co_owner);
	co.status === 200 ? pass('co_owner Save -> 200') : fail('co_owner Save', `${co.status} ${JSON.stringify(co.json)}`);

	// Approve after Save: the saved edit is what lands, with the author's not going.
	const ap = await api('POST', '/api/suggestions/review', { suggestion_id: sid, action: 'approve' }, tokens.owner);
	if (ap.json?.item_id) {
		const it = (await api('GET', `/api/collections/items/records/${ap.json.item_id}`, null, tokens.owner)).json || {};
		it.title === 'Saved by co-owner (#444)' && sameIds(it.not_going, [memberIds.traveler])
			? pass('approve after Save -> the saved edit lands, author not going kept')
			: fail('approve after Save', `title=${it.title} not_going=${JSON.stringify(it.not_going)}`);
	} else {
		fail('approve after Save', `${ap.status} ${JSON.stringify(ap.json)}`);
	}

	const late = await api('POST', '/api/suggestions/update', { suggestion_id: sid, payload: edited }, tokens.owner);
	late.status === 400 ? pass('update of a non-pending suggestion -> 400') : fail('update non-pending', `${late.status}`);

	// Carried from #402: Edit & Approve (edited payload without not_going) must not
	// drop the author's three-state Going answer.
	const eid = await mk('Edit approve keeps not going (#444)', { not_going: [memberIds.traveler] });
	const noNg = { ...samplePayload, title: 'Edited, no not_going (#444)' };
	const ea = await api('POST', '/api/suggestions/review', { suggestion_id: eid, action: 'approve', payload: noNg }, tokens.owner);
	if (ea.json?.item_id) {
		const it = (await api('GET', `/api/collections/items/records/${ea.json.item_id}`, null, tokens.owner)).json || {};
		sameIds(it.not_going, [memberIds.traveler])
			? pass('Edit & Approve keeps the author\'s not going (payload omitted it)')
			: fail('Edit & Approve keeps not_going', JSON.stringify(it.not_going));
	} else {
		fail('Edit & Approve keeps not_going', `${ea.status} ${JSON.stringify(ea.json)}`);
	}
}

// ─── #496: foreign day/phase/assignee ids are dropped ────────────────────────
{
	console.log('\n#496 — payload ids from another trip');
	const own = fixtureRes.json;
	const other = await api('POST', '/api/dev/rules-fixture', { emails: EMAILS, slug: 'e2e-rules-test-sugg-foreign' }, tokens.owner);
	const foreign = other.json || {};
	if (!foreign.dayId || !foreign.phaseId || !foreign.memberIds) {
		fail('foreign fixture', `${other.status} ${JSON.stringify(other.json)}`);
	} else {
		const getItem = async (id) => (await api('GET', `/api/collections/items/records/${id}`, null, tokens.owner)).json || {};
		const foreignIds = {
			day: foreign.dayId,
			phase: foreign.phaseId,
			assigned_to: [foreign.memberIds.traveler, memberIds.traveler]
		};

		// create (owner → auto-approve): foreign ids never reach the item.
		const c = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Foreign ids create (#496)', ...foreignIds } }, tokens.owner);
		const ci = c.json?.item_id ? await getItem(c.json.item_id) : null;
		ci && ci.day === '' && ci.phase !== foreign.phaseId && JSON.stringify(ci.assigned_to) === JSON.stringify([memberIds.traveler])
			? pass('auto-approved create drops foreign day/phase/assignee')
			: fail('create drops foreign ids', `${c.status} day=${ci?.day} phase=${ci?.phase} assigned=${JSON.stringify(ci?.assigned_to)}`);

		// review: Edit & Approve with foreign ids.
		const t = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Foreign ids review (#496)' } }, tokens.traveler);
		const sid = t.json?.suggestion_id;
		const ap = await api('POST', '/api/suggestions/review', { suggestion_id: sid, action: 'approve', payload: { ...samplePayload, title: 'Foreign ids review (#496)', ...foreignIds } }, tokens.owner);
		const ai = ap.json?.item_id ? await getItem(ap.json.item_id) : null;
		ai && ai.day === '' && ai.phase !== foreign.phaseId && JSON.stringify(ai.assigned_to) === JSON.stringify([memberIds.traveler])
			? pass('approve drops foreign day/phase/assignee')
			: fail('approve drops foreign ids', `${ap.status} day=${ai?.day} phase=${ai?.phase} assigned=${JSON.stringify(ai?.assigned_to)}`);

		// own-trip ids survive.
		const ok = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Own ids (#496)', day: own.dayId, phase: own.phaseId } }, tokens.owner);
		const oi = ok.json?.item_id ? await getItem(ok.json.item_id) : null;
		oi && oi.day === own.dayId && oi.phase === own.phaseId
			? pass('own-trip day/phase kept')
			: fail('own-trip ids kept', `day=${oi?.day} phase=${oi?.phase}`);

		// update: the stored payload is scrubbed.
		const u = await api('POST', '/api/suggestions/create', { trip_id: tripId, payload: { ...samplePayload, title: 'Foreign ids update (#496)' } }, tokens.traveler);
		const uid = u.json?.suggestion_id;
		await api('POST', '/api/suggestions/update', { suggestion_id: uid, payload: { ...samplePayload, title: 'Foreign ids update (#496)', ...foreignIds } }, tokens.owner);
		const lst = await api('GET', `/api/suggestions/list?trip_id=${tripId}`, null, tokens.owner);
		const stored = (lst.json?.items || []).find((x) => x.id === uid);
		let sp = stored?.payload;
		if (typeof sp === 'string') sp = JSON.parse(sp);
		sp && !sp.day && !sp.phase && JSON.stringify(sp.assigned_to) === JSON.stringify([memberIds.traveler])
			? pass('update scrubs foreign ids from the stored payload')
			: fail('update scrubs foreign ids', JSON.stringify(sp));
	}
}

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Suggestions harness: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
