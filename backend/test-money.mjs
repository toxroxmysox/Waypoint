#!/usr/bin/env node
// Waypoint — Money-domain server-hook verification harness.
//
// Guards against the silent "dead hook" class (bug-112 / bug-119): a PB JS hook
// registered collection-first, as a model hook instead of a request hook, or
// reading a nonexistent auth API fails to fire with NO boot error. Each probe
// below is a discriminator — the asserted status/message can ONLY come from the
// hook firing. Many exploit that the PB rule for expenses/settlements/
// trip_budgets is merely MEMBER_VIA_TRIP (any member), so a 403/400 from a
// *member* request proves the stricter hook ran (not the rule).
//
// Covers: expenses (split validation, viewer-block, created_by auto-set, delete
// gating), settlements (from!=to, caller-is-a-party, created_by, delete gating),
// trip_budgets (owner/co_owner-only create+update, category validation), and the
// trips update-reconcile hook (days added when dates extend).
//
// Prerequisites:
//   - PocketBase running on $PUBLIC_PB_URL (default http://127.0.0.1:8090)
//   - Started with WAYPOINT_DEV_MODE=true and E2E_TEST_EMAILS=<the 5 emails below>
//
// Run:  pnpm test:money
// Exit: 0 on all-green, 1 on any failure.

const PB = process.env.PB_URL || process.env.PUBLIC_PB_URL || 'http://127.0.0.1:8090';
const EMAILS = {
	owner: 'rules-owner@e2e.test',
	co_owner: 'rules-coowner@e2e.test',
	traveler: 'rules-traveler@e2e.test',
	viewer: 'rules-viewer@e2e.test',
	non_member: 'rules-nonmember@e2e.test'
};

let pass = 0,
	fail = 0;
const results = [];
function check(name, cond, detail) {
	if (cond) {
		pass++;
		results.push(`  PASS  ${name}`);
	} else {
		fail++;
		results.push(`  FAIL  ${name} -- ${detail}`);
	}
}

async function req(method, path, { token, body } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (token) headers.Authorization = token;
	const init = { method, headers };
	if (body !== undefined) init.body = JSON.stringify(body);
	const res = await fetch(PB + path, init);
	let data = null;
	try {
		data = await res.json();
	} catch (_) {}
	return { status: res.status, data };
}

async function main() {
	// --- tokens + fixture ---
	const tokens = {};
	for (const [role, email] of Object.entries(EMAILS)) {
		const r = await req('POST', '/api/dev/auth-bypass', { body: { email } });
		if (r.status !== 200) {
			console.error(`auth-bypass ${role} failed`, r.status, r.data);
			process.exit(2);
		}
		tokens[role] = r.data.token;
	}
	const fx = await req('POST', '/api/dev/rules-fixture', { body: { emails: EMAILS } });
	if (fx.status !== 200) {
		console.error('fixture failed', fx.status, fx.data);
		process.exit(2);
	}
	const { tripId, memberIds } = fx.data;
	const today = new Date().toISOString().slice(0, 10) + ' 00:00:00.000Z';

	// ===================== EXPENSES =====================
	// E1: create with by_amount split that does NOT sum -> hook 400
	{
		const r = await req('POST', '/api/collections/expenses/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				paid_by: memberIds.owner,
				amount_usd: 100,
				description: 'bad split',
				date: today,
				category: 'food',
				split_mode: 'by_amount',
				split_data: { amounts: { [memberIds.owner]: 40, [memberIds.traveler]: 30 } } // sums 70 != 100
			}
		});
		check(
			'E1 expenses.create split-sum mismatch -> 400',
			r.status === 400 && /sum/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// E2: viewer cannot create (rule allows member; hook blocks)
	{
		const r = await req('POST', '/api/collections/expenses/records', {
			token: tokens.viewer,
			body: {
				trip: tripId,
				paid_by: memberIds.viewer,
				amount_usd: 10,
				description: 'viewer try',
				date: today,
				category: 'food',
				split_mode: 'equal',
				split_data: { members: [memberIds.viewer] }
			}
		});
		check(
			'E2 expenses.create as viewer -> 403',
			r.status === 403 && /viewer/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// E3: created_by auto-set (omit created_by entirely; required field -> only succeeds if hook sets it)
	let ownerExpenseId = null;
	{
		const r = await req('POST', '/api/collections/expenses/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				amount_usd: 60,
				description: 'auto created_by',
				date: today,
				category: 'food',
				split_mode: 'equal',
				split_data: { members: [memberIds.owner, memberIds.traveler] }
				// no created_by, no paid_by -> hook must set both
			}
		});
		ownerExpenseId = r.data?.id;
		check(
			'E3 expenses.create auto-sets created_by+paid_by -> 200',
			(r.status === 200 || r.status === 201) &&
				r.data?.created_by === memberIds.owner &&
				r.data?.paid_by === memberIds.owner,
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// E4: delete by non-creator non-privileged member (traveler) -> hook 403 (rule would allow)
	{
		const r = await req('DELETE', `/api/collections/expenses/records/${ownerExpenseId}`, {
			token: tokens.traveler
		});
		check(
			'E4 expenses.delete by non-creator traveler -> 403',
			r.status === 403,
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// E5: update with bad split -> hook 400
	{
		const r = await req('PATCH', `/api/collections/expenses/records/${ownerExpenseId}`, {
			token: tokens.owner,
			body: {
				split_mode: 'by_amount',
				split_data: { amounts: { [memberIds.owner]: 5 } } // 5 != 60
			}
		});
		check(
			'E5 expenses.update split-sum mismatch -> 400',
			r.status === 400 && /sum/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}

	// ===================== SETTLEMENTS =====================
	// S1: from_member == to_member -> hook 400
	{
		const r = await req('POST', '/api/collections/settlements/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				from_member: memberIds.owner,
				to_member: memberIds.owner,
				amount_usd: 10,
				date: today
			}
		});
		check(
			'S1 settlements.create from==to -> 400',
			r.status === 400 && /same/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// S2: caller not a party (owner records traveler->viewer) -> hook 403 (rule would allow member)
	{
		const r = await req('POST', '/api/collections/settlements/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				from_member: memberIds.traveler,
				to_member: memberIds.viewer,
				amount_usd: 10,
				date: today
			}
		});
		check(
			'S2 settlements.create not-a-party -> 403',
			r.status === 403 && /part/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// S3: valid settlement, created_by auto-set
	let ownerSettlementId = null;
	{
		const r = await req('POST', '/api/collections/settlements/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				from_member: memberIds.owner,
				to_member: memberIds.traveler,
				amount_usd: 25,
				date: today
				// no created_by -> hook sets it
			}
		});
		ownerSettlementId = r.data?.id;
		check(
			'S3 settlements.create valid auto-sets created_by -> 200',
			(r.status === 200 || r.status === 201) && r.data?.created_by === memberIds.owner,
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// S4: delete by non-creator non-privileged (traveler) -> hook 403
	{
		const r = await req('DELETE', `/api/collections/settlements/records/${ownerSettlementId}`, {
			token: tokens.traveler
		});
		check(
			'S4 settlements.delete by non-creator traveler -> 403',
			r.status === 403,
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}

	// ===================== TRIP_BUDGETS =====================
	// B1: traveler create -> hook 403 (rule allows member)
	{
		const r = await req('POST', '/api/collections/trip_budgets/records', {
			token: tokens.traveler,
			body: {
				trip: tripId,
				categories: [{ category: 'food', mode: 'total', total: 500 }]
			}
		});
		check(
			'B1 trip_budgets.create as traveler -> 403',
			r.status === 403 && /owner/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// B2: owner create with invalid category -> hook 400
	{
		const r = await req('POST', '/api/collections/trip_budgets/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				categories: [{ category: 'rockets', mode: 'total', total: 500 }]
			}
		});
		check(
			'B2 trip_budgets.create invalid category -> 400',
			r.status === 400 && /category/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// B3: owner create valid -> 200
	let budgetId = null;
	{
		const r = await req('POST', '/api/collections/trip_budgets/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				categories: [{ category: 'food', mode: 'per_day', total: 50 }]
			}
		});
		budgetId = r.data?.id;
		check(
			'B3 trip_budgets.create valid as owner -> 200',
			r.status === 200 || r.status === 201,
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}
	// B4: traveler update -> hook 403
	{
		const r = await req('PATCH', `/api/collections/trip_budgets/records/${budgetId}`, {
			token: tokens.traveler,
			body: {
				categories: [{ category: 'food', mode: 'total', total: 999 }]
			}
		});
		check(
			'B4 trip_budgets.update as traveler -> 403',
			r.status === 403 && /owner/i.test(JSON.stringify(r.data)),
			`${r.status} ${JSON.stringify(r.data)}`
		);
	}

	// ===================== TRIPS update-reconcile =====================
	// T1: extend trip end_date by 3 days -> day records added by update hook
	{
		const before = await req(
			'GET',
			`/api/collections/days/records?filter=(trip='${tripId}')&perPage=1`,
			{ token: tokens.owner }
		);
		const countBefore = before.data?.totalItems ?? 0;
		const trip = await req('GET', `/api/collections/trips/records/${tripId}`, {
			token: tokens.owner
		});
		const end = (trip.data?.end_date || '').slice(0, 10);
		const newEnd =
			new Date(new Date(end + 'T00:00:00Z').getTime() + 3 * 86400000).toISOString().slice(0, 10) +
			' 00:00:00.000Z';
		await req('PATCH', `/api/collections/trips/records/${tripId}`, {
			token: tokens.owner,
			body: { end_date: newEnd }
		});
		const after = await req(
			'GET',
			`/api/collections/days/records?filter=(trip='${tripId}')&perPage=1`,
			{ token: tokens.owner }
		);
		const countAfter = after.data?.totalItems ?? 0;
		check(
			'T1 trips.update extends date -> days reconciled (+3)',
			countAfter === countBefore + 3,
			`before=${countBefore} after=${countAfter}`
		);
	}

	// ===================== CROSS-TRIP REFERENCES (#411) =====================
	// A second trip from the same owner supplies foreign member / item / phase ids.
	// Each reference must belong to the record's own trip (model-level, so admin
	// saves are covered too); same-trip controls must still pass.
	{
		const other = await req('POST', '/api/collections/trips/records', {
			token: tokens.owner,
			body: {
				title: 'Cross-trip harness',
				slug: 'cross-trip-harness-' + Date.now(),
				created_by: fx.data.userIds.owner,
				timezone: 'UTC',
				start_date: '2026-07-01 00:00:00.000Z',
				end_date: '2026-07-03 00:00:00.000Z'
			}
		});
		const otherTrip = other.data?.id;
		const q = (f) => encodeURIComponent(f);
		const foreignMember = (
			await req('GET', `/api/collections/trip_members/records?filter=${q(`trip="${otherTrip}"`)}`, {
				token: tokens.owner
			})
		).data?.items?.[0]?.id;
		const foreignDay = (
			await req(
				'GET',
				`/api/collections/days/records?filter=${q(`trip="${otherTrip}"`)}&sort=date`,
				{ token: tokens.owner }
			)
		).data?.items?.[0]?.id;
		const foreignPhase = (
			await req('GET', `/api/collections/phases/records?filter=${q(`trip="${otherTrip}"`)}`, {
				token: tokens.owner
			})
		).data?.items?.[0]?.id;
		const foreignItem = (
			await req('POST', '/api/collections/items/records', {
				token: tokens.owner,
				body: {
					trip: otherTrip,
					day: foreignDay,
					type: 'activity',
					title: 'Foreign item'
				}
			})
		).data?.id;
		if (!otherTrip || !foreignMember || !foreignPhase || !foreignItem) {
			console.error('cross-trip setup failed', {
				otherTrip,
				foreignMember,
				foreignPhase,
				foreignItem
			});
			process.exit(2);
		}
		const M = "That member isn't on this trip.";
		const I = "That item isn't on this trip.";
		const P = "That phase isn't on this trip.";
		const is400 = (r, msg) => r.status === 400 && r.data?.message === msg;
		const show = (r) => `${r.status} ${JSON.stringify(r.data?.message)}`;
		const expense = (extra) =>
			req('POST', '/api/collections/expenses/records', {
				token: tokens.owner,
				body: {
					trip: tripId,
					amount_usd: 20,
					description: 'cross-trip',
					date: today,
					category: 'food',
					split_mode: 'equal',
					split_data: { members: [memberIds.owner] },
					...extra
				}
			});

		let r = await expense({ paid_by: foreignMember });
		check('X1 expenses.paid_by foreign member -> 400', is400(r, M), show(r));
		r = await expense({ split_data: { members: [memberIds.owner, foreignMember] } });
		check('X2 expenses equal split with a foreign member -> 400', is400(r, M), show(r));
		r = await expense({
			split_mode: 'by_amount',
			split_data: { amounts: { [memberIds.owner]: 10, [foreignMember]: 10 } }
		});
		check('X3 expenses by_amount split with a foreign member -> 400', is400(r, M), show(r));
		r = await expense({ linked_item: foreignItem });
		check('X4 expenses.linked_item foreign item -> 400', is400(r, I), show(r));
		r = await expense({
			linked_item: fx.data.itemId,
			split_data: { members: [memberIds.owner, memberIds.traveler] }
		});
		check('X5 expenses same-trip refs -> 200', r.status === 200, show(r));
		const sameTripExpense = r.data?.id;
		r = await req('PATCH', `/api/collections/expenses/records/${sameTripExpense}`, {
			token: tokens.owner,
			body: { paid_by: foreignMember }
		});
		check('X6 expenses.update paid_by to a foreign member -> 400', is400(r, M), show(r));

		// #506 — viewers are never a payer or part of a split.
		const V = "Viewers can't pay for or share an expense.";
		r = await expense({ split_data: { members: [memberIds.owner, memberIds.viewer] } });
		check('V1 expenses equal split with a viewer -> 400', is400(r, V), show(r));
		r = await expense({
			split_mode: 'by_amount',
			split_data: { amounts: { [memberIds.owner]: 10, [memberIds.viewer]: 10 } }
		});
		check('V2 expenses by_amount split with a viewer -> 400', is400(r, V), show(r));
		r = await expense({ paid_by: memberIds.viewer });
		check('V3 expenses.paid_by viewer -> 400', is400(r, V), show(r));
		r = await req('PATCH', `/api/collections/expenses/records/${sameTripExpense}`, {
			token: tokens.owner,
			body: { amount_usd: 30 }
		});
		check('V4 expenses.update leaving split untouched -> 200', r.status === 200, show(r));

		r = await req('POST', '/api/collections/settlements/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				from_member: memberIds.owner,
				to_member: foreignMember,
				amount_usd: 5,
				date: today
			}
		});
		check('X7 settlements.to_member foreign member -> 400', is400(r, M), show(r));

		const checklist = (extra) =>
			req('POST', '/api/collections/checklists/records', {
				token: tokens.owner,
				body: {
					trip: tripId,
					title: 'Cross-trip list',
					kind: 'manual',
					...extra
				}
			});
		r = await checklist({ phase: foreignPhase });
		check('X8 checklists.phase foreign phase -> 400', is400(r, P), show(r));
		r = await checklist({ item: foreignItem });
		check('X9 checklists.item foreign item -> 400', is400(r, I), show(r));
		r = await checklist({ phase: fx.data.phaseId, item: '' });
		check('X10 checklists same-trip phase (empty item) -> 200', r.status === 200, show(r));

		r = await req('POST', '/api/collections/votes/records', {
			token: tokens.traveler,
			body: {
				trip: tripId,
				item: foreignItem,
				member: memberIds.traveler,
				value: 'like'
			}
		});
		check('X11 votes.item foreign item -> 400', is400(r, I), show(r));

		// #519 — the remaining member/item/scenario references, and the item trip/creator lock.
		const S = "That scenario isn't on this trip.";
		const patch = (col, id, body, token = tokens.owner) =>
			req('PATCH', `/api/collections/${col}/records/${id}`, { token, body });
		r = await req('POST', '/api/collections/trip_goals/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				title: 'Cross-trip goal',
				created_by: memberIds.owner,
				manual_status: 'unplanned',
				items: [foreignItem]
			}
		});
		check('X12 trip_goals.items foreign item -> 400', is400(r, I), show(r));
		r = await req('POST', '/api/collections/trip_goals/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				title: 'Same-trip goal',
				created_by: memberIds.owner,
				manual_status: 'unplanned',
				items: [fx.data.itemId]
			}
		});
		check('X13 trip_goals.items same-trip item -> 200', r.status === 200, show(r));

		const scen = await req('POST', '/api/collections/scenarios/records', {
			token: tokens.owner,
			body: {
				trip: tripId,
				title: 'Home scenario',
				champion: memberIds.owner,
				status: 'candidate'
			}
		});
		const foreignScen = await req('POST', '/api/collections/scenarios/records', {
			token: tokens.owner,
			body: {
				trip: otherTrip,
				title: 'Foreign scenario',
				champion: foreignMember,
				status: 'candidate'
			}
		});
		if (scen.status !== 200 || foreignScen.status !== 200) {
			console.error('scenario setup failed', show(scen), show(foreignScen));
			process.exit(2);
		}
		r = await patch('scenarios', scen.data.id, { keystones: [foreignItem] });
		check('X14 scenarios.keystones foreign item -> 400', is400(r, I), show(r));
		r = await patch('scenarios', scen.data.id, { fork_of: foreignScen.data.id });
		check('X15 scenarios.fork_of foreign scenario -> 400', is400(r, S), show(r));
		r = await patch('scenarios', scen.data.id, { keystones: [fx.data.itemId] });
		check('X16 scenarios.keystones same-trip item -> 200', r.status === 200, show(r));

		const list = await checklist({ title: 'Task list' });
		const task = await req('POST', '/api/collections/tasks/records', {
			token: tokens.owner,
			body: { checklist: list.data?.id, title: 'Pack' }
		});
		r = await patch('tasks', task.data?.id, { assignee: foreignMember });
		check('X17 tasks.assignee foreign member -> 400', is400(r, M), show(r));
		r = await patch('tasks', task.data?.id, { assignee: memberIds.traveler });
		check('X18 tasks.assignee same-trip member -> 200', r.status === 200, show(r));

		const ci = await req('POST', '/api/collections/checklist_items/records', {
			token: tokens.owner,
			body: { item: fx.data.itemId, text: 'Passport' }
		});
		r = await patch('checklist_items', ci.data?.id, { checked_by: foreignMember });
		check(
			'X19 checklist_items.checked_by foreign member -> 400',
			ci.status === 200 && is400(r, M),
			`${ci.status} / ${show(r)}`
		);

		r = await patch('items', fx.data.itemId, { booked_by: foreignMember });
		check('X20 items.booked_by foreign member -> 400', is400(r, M), show(r));
		r = await patch('items', fx.data.itemId, { 'assigned_to+': foreignMember });
		check('X21 items.assigned_to foreign member -> 400', is400(r, M), show(r));
		r = await patch('items', fx.data.itemId, { trip: otherTrip });
		check(
			'X22 items.trip move to another trip -> 400',
			r.status === 400 && /another trip/.test(r.data?.message),
			show(r)
		);
		r = await patch('items', fx.data.itemId, { created_by: memberIds.traveler });
		check(
			'X23 items.created_by rewrite -> 400',
			r.status === 400 && /creator/.test(r.data?.message),
			show(r)
		);
		r = await patch('items', fx.data.itemId, { assigned_to: [memberIds.owner] });
		check('X24 items.assigned_to same-trip member -> 200', r.status === 200, show(r));
	}

	console.log(results.join('\n'));
	console.log(`\n  ${pass} passed, ${fail} failed`);
	process.exit(fail > 0 ? 1 : 0);
}
main().catch((e) => {
	console.error(e);
	process.exit(3);
});
