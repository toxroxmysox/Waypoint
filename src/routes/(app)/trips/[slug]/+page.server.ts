import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Item, ItemType, Day, Phase, Expense, Settlement, TripMember, Vote } from '$lib/types';
import { fetchManualChecklists, rollupChecklists } from '$lib/itinerary/checklist-loaders';
import { firstVotablePhase } from '$lib/collaboration/swipe-deck';
import { summarizeDays } from '$lib/itinerary/day-card';
import { getTripLifecycle } from '$lib/trip-mode/trip-lifecycle';
import { simplifyDebts } from '$lib/money/debt-simplify';
import { buildArchiveView } from '$lib/portability/archive-view';
import { publishStatus, resolvePublishDay } from '$lib/portability/archive-visibility';
import { tripToday, tripTz } from '$lib/shell/trip-time';
import { needsOnboarding } from '$lib/collaboration/onboarding';

// Overview checklist previews (#51): roll up each manual, non-item-scoped
// Checklist's done/total so the Overview can show compact mini-cards under the
// whole-trip header and each phase's days. Same shape as the Lists index.
//
// Day-card content (#65): the overview now also rides ONE items fetch to compute
// per-day summaries (count + booked + budget + stay chip). The day count and the
// booked|budget toggle share this single query — no N+1 per day.
//
// Lifecycle router (#239/#195): the Overview is a lifecycle router computed HERE in
// server load (NOT in AppShell). `wrap-up` → the wrap-up banner replaces the top of
// the page (trip-details card + Flights & Stays); `closed` → the read-only Record view
// (#242, via buildArchiveView) with the Share affordance; planning/active fall through
// to the normal planning Overview, unchanged. Navigation is untouched: still the 5
// planning tabs, no new mode.
export const load: PageServerLoad = async ({ parent, locals, url }) => {
	const { trip, membership, days, phases } = await parent();

	const lifecycle = getTripLifecycle(trip);

	// #274 Onboarding spine. The member-keyed welcome card auto-shows on a member's
	// first visit, gated by the per-user once-ever signal — REGARDLESS of trip
	// content. This is the fix for the ES-1 gap (the old `isFresh` hero was keyed
	// on trip content and missed an invited member joining a populated trip).
	// `locals.user` is the full auth record (hooks.server.ts authRefresh), so it
	// carries `onboarded_at`.
	//
	// #276 Re-trigger ("Replay intro"). The More menu links here with `?welcome=1`,
	// which FORCE-SHOWS the welcome card on demand — IGNORING the once-ever signal
	// (PRD §5). The override neither depends on nor clears `onboarded_at`: the
	// auto-show stays gated by `needsOnboarding`, and the replayed card's
	// completeOnboarding action is a no-op on an already-stamped user (it only
	// stamps when `needsOnboarding(user)` — see the action below). So a veteran can
	// replay the intro freely without altering their flag.
	const forceWelcome = url.searchParams.get('welcome') === '1';
	const showWelcome = forceWelcome || needsOnboarding(locals.user);

	// Forming (#270/ADR-0022) → the dateless-trip home: the idea list + the
	// prominent set-dates affordance. No days/phases exist yet (the create hook
	// skips seeding), so none of the planning Overview's day/phase content can
	// render; ideas are phase-less unplanned items collected until promotion.
	if (lifecycle === 'forming') {
		const ideas = await locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,type,title,status',
			sort: '-created'
		});
		const canSetDates = membership.role === 'owner' || membership.role === 'co_owner';
		return {
			lifecycle,
			// The onboarding welcome card is a planning-Overview surface; the forming
			// home carries its own guidance copy instead.
			showWelcome: false,
			formingIdeas: ideas.map((i) => ({ id: i.id, type: i.type, title: i.title })),
			canSetDates,
			// Shape-consistent defaults (see the closed branch below).
			votable: { hasVotable: false, unratedTotal: 0, swipeHref: null as string | null },
			wrapUp: { balanceOwed: false },
			lists: [] as ReturnType<typeof rollupChecklists>,
			daySummaries: {} as ReturnType<typeof summarizeDays>,
			keyItems: [] as { id: string; type: ItemType; title: string }[],
			totalItems: ideas.length,
			record: undefined as ReturnType<typeof buildArchiveView> | undefined,
			share: undefined as ClosedShare | undefined,
			canManage: false
		};
	}

	// Closed → the read-only Record view (#242). Reuse buildArchiveView (same
	// sanitization as the public archive) for the done-items record + the curated
	// "what we considered". Compute the Share affordance facts: an ABSOLUTE share URL
	// (origin + /archive/[token]) and the plain-language publish status. The owner/
	// co_owner gets the Publish/change-date/disable + reopen controls (the page gates
	// them; the server actions re-enforce role).
	if (lifecycle === 'closed') {
		const recordItems = await locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			sort: 'day,sort_order'
		});
		// Opt-in budget summary (#243): only load expenses + member count when the owner
		// enabled it; buildArchiveView surfaces the aggregate total + rough per-person
		// only (never itemized / who-owes-whom).
		let recordExpenses: Expense[] = [];
		let recordMemberCount = 0;
		if (trip.archive_show_budget) {
			[recordExpenses, recordMemberCount] = await Promise.all([
				locals.pb.collection('expenses').getFullList<Expense>({ filter: `trip = "${trip.id}"` }),
				locals.pb
					.collection('trip_members')
					.getFullList<TripMember>({ filter: `trip = "${trip.id}" && removed_at = ""` })
					.then((m) => m.length)
			]);
		}
		const record = buildArchiveView(trip, phases as Phase[], days as Day[], recordItems, {
			expenses: recordExpenses,
			memberCount: recordMemberCount
		});
		const status = publishStatus(trip);
		const canManage = membership.role === 'owner' || membership.role === 'co_owner';
		return {
			lifecycle,
			showWelcome,
			record,
			canManage,
			// Forming-only keys, absent here (shape consistency — see forming branch).
			formingIdeas: [] as { id: string; type: ItemType; title: string }[],
			canSetDates: false,
			share: {
				// Absolute URL so it pastes into a group text as a working link (no
				// hand-assembled domain). "" token → not yet shareable (Publish mints it).
				url: trip.public_share_token
					? `${url.origin}/archive/${trip.public_share_token}`
					: '',
				status,
				archiveEnabled: trip.archive_enabled,
				// Pre-seed the date control on re-edit: a scheduled record carries its date.
				publishDate: status.status === 'scheduled' ? status.date : '',
				showBudget: trip.archive_show_budget,
				// #301: trip-LOCAL today for the publish-date default (matches the gate).
				today: tripToday(tripTz(trip))
			},
			// Planning-Overview keys, defaulted — the page never reads them when closed,
			// but a consistent shape keeps the page-data union from narrowing them to
			// `undefined` in the other branches.
			votable: { hasVotable: false, unratedTotal: 0, swipeHref: null as string | null },
			wrapUp: { balanceOwed: false },
			lists: [] as ReturnType<typeof rollupChecklists>,
			daySummaries: {} as ReturnType<typeof summarizeDays>,
			keyItems: [] as { id: string; type: ItemType; title: string }[],
			// First-run hero (#111/ES-1) keys the empty state on CONTENT, never day count
			// (days always exist on a real trip). A closed trip is never "fresh".
			totalItems: recordItems.length
		};
	}

	const [{ checklists, tasks }, items] = await Promise.all([
		fetchManualChecklists(locals.pb, trip.id),
		locals.pb.collection('items').getFullList<Item>({
			filter: `trip = "${trip.id}"`,
			fields: 'id,phase,day,end_date,type,title,status,booked,requires_booking,cost_estimate_usd'
		})
	]);

	// #275 Adaptive onboarding CTA. Detect whether THIS member has votable content
	// to weigh in on — an unrated planned|unplanned item (the swipe deck's
	// eligibility). The overview already rode the items fetch above; the only extra
	// cost is the member's own votes (one small query, same shape Goals already
	// pays for the launch door). Populated for a vote → vote-deck CTA; nothing to
	// rate (bare trip, or all rated) → goals CTA. The card always names both doors;
	// only the PRIMARY action flips. `swipeHref` is null when there's no launch
	// phase, which is exactly when the CTA falls back to goals.
	const myVotes = await locals.pb.collection('votes').getFullList<Vote>({
		filter: `trip = "${trip.id}" && member = "${membership.id}"`,
		fields: 'item'
	});
	const { phaseId: votablePhaseId, unratedTotal } = firstVotablePhase(
		items,
		myVotes,
		(phases as Phase[]).map((p) => p.id)
	);
	const votable = {
		hasVotable: !!votablePhaseId,
		unratedTotal,
		swipeHref: votablePhaseId ? `/trips/${trip.slug}/swipe/${votablePhaseId}` : null
	};

	// Settle-up is gated on BALANCE, not lifecycle (Grill Resolution #6): the row shows
	// only when an outstanding debt exists. `simplifyDebts` already nets expenses against
	// settlements and applies a float tolerance — a non-empty edge list means someone
	// still owes someone. We only pay for this query on a wrap-up trip (the only state
	// that renders the banner); other states never read it.
	let balanceOwed = false;
	if (lifecycle === 'wrap-up') {
		const [expenses, settlements] = await Promise.all([
			locals.pb.collection('expenses').getFullList<Expense>({ filter: `trip = "${trip.id}"` }),
			locals.pb
				.collection('settlements')
				.getFullList<Settlement>({ filter: `trip = "${trip.id}"` })
		]);
		balanceOwed = simplifyDebts(expenses, settlements).length > 0;
	}

	return {
		lifecycle,
		showWelcome,
		// #275 — drives the welcome card's adaptive primary CTA (vote vs goals).
		votable,
		// Wrap-up banner facts (only meaningful when lifecycle === 'wrap-up'). Close-out
		// is always outstanding in wrap-up (it's how you LEAVE wrap-up). Settle-up is
		// outstanding only when a balance is owed.
		wrapUp: { balanceOwed },
		lists: rollupChecklists(checklists, tasks),
		daySummaries: summarizeDays(items, days as Day[]),
		// #200 — light findability lens: surface flights + lodging on the Overview so
		// a member finds the flight/hotel without opening days one by one. Not search.
		keyItems: items
			.filter((i) => i.type === 'flight' || i.type === 'lodging')
			.map((i) => ({ id: i.id, type: i.type, title: i.title })),
		// First-run hero (#111/ES-1): the empty state is keyed on CONTENT — zero items AND
		// zero phases — not day count (the PB hook auto-creates day rows, so days are always
		// > 0 on a real trip and can never gate a first-run state). Reuses the items fetch above.
		totalItems: items.length,
		// Closed-only keys, absent here (the page reads them only under `isClosed`).
		record: undefined as ReturnType<typeof buildArchiveView> | undefined,
		share: undefined as ClosedShare | undefined,
		canManage: false,
		// Forming-only keys, absent here (shape consistency — see forming branch).
		formingIdeas: [] as { id: string; type: ItemType; title: string }[],
		canSetDates: false
	};
};

type ClosedShare = {
	url: string;
	status: ReturnType<typeof publishStatus>;
	archiveEnabled: boolean;
	publishDate: string;
	showBudget: boolean;
	today: string;
};

// Helper inlined per action (server load can't share a closure with actions): resolve
// the trip + the caller's ACTIVE membership, throwing fail(403) for a non-owner.
async function requireOwner(
	locals: App.Locals,
	slug: string
): Promise<{ tripId: string; ok: true } | { ok: false; status: number; message: string }> {
	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug }));
	const membership = await locals.pb
		.collection('trip_members')
		.getFirstListItem<TripMember>(
			`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
		);
	if (membership.role !== 'owner' && membership.role !== 'co_owner') {
		return { ok: false, status: 403, message: 'Only owners or co-owners can do that.' };
	}
	return { tripId: trip.id, ok: true };
}

export const actions: Actions = {
	// #270 / ADR-0022 — the promotion door. The forming home's "Set the dates"
	// form posts here; writing both dates promotes the trip (the trips.pb.js
	// update hook seeds "Phase 1", generates + buckets the days, and re-homes
	// the phase-less forming ideas). One-way — the hook rejects un-dating.
	// Owner/co_owner only, matching the settings date form.
	setDates: async ({ request, locals, params }) => {
		try {
			const gate = await requireOwner(locals, params.slug);
			if (!gate.ok) return fail(gate.status, { dateError: gate.message });

			const data = await request.formData();
			const startDate = data.get('start_date')?.toString() || '';
			const endDate = data.get('end_date')?.toString() || '';

			if (!startDate || !endDate) {
				return fail(400, { dateError: 'Pick both dates.' });
			}
			if (new Date(startDate) > new Date(endDate)) {
				return fail(400, { dateError: 'Start date must be before end date.' });
			}

			await locals.pb.collection('trips').update(gate.tripId, {
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z'
			});

			// Reload the Overview — now dated, it renders the planning home with the
			// freshly seeded days and Phase 1 (ideas intact in its parking lot).
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, {
				dateError: err instanceof Error ? err.message : 'Failed to set the dates.'
			});
		}
	},

	// #274 Onboarding spine — set-complete. Stamp the per-user once-ever signal when
	// the member completes their first action OR taps "Got it" on the welcome card.
	// Gates ONLY the auto-show (the card never auto-reappears on any trip afterward).
	// `users.updateRule = SELF_ONLY` (0014) authorizes a member to update their own
	// record via the authed client; we only ever touch the caller's own row.
	// Idempotent: if already stamped we leave the original timestamp untouched.
	completeOnboarding: async ({ request, locals, params }) => {
		// Optional `redirect_to` — set when the member completes their FIRST ACTION
		// (the primary CTA stamps + forwards to /goals/capture). Absent when they tap
		// "Got it" (stamp + stay). Guarded to same-origin app paths only (no open
		// redirect): must be a leading-slash path under this trip OR /trips.
		const data = await request.formData();
		const raw = data.get('redirect_to')?.toString() ?? '';
		const safeRedirect =
			raw.startsWith(`/trips/${params.slug}/`) || raw === `/trips/${params.slug}` ? raw : '';
		try {
			const user = locals.user;
			if (!user) return fail(401, { error: 'Not signed in.' });
			if (needsOnboarding(user)) {
				await locals.pb.collection('users').update(user.id, {
					onboarded_at: new Date().toISOString().replace('T', ' ')
				});
			}
			if (safeRedirect) redirect(303, safeRedirect);
			return { onboarded: true };
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, {
				error: err instanceof Error ? err.message : 'Failed to finish onboarding.'
			});
		}
	},

	// Standalone Publish/share control on the closed Record view (#242/#241). Owner/
	// co_owner ONLY, SERVER-ENFORCED, gated on role alone (an owner can publish an
	// already-closed trip later — closed-and-private is a normal terminal state).
	// Binary: Publish sets archive_publish_at (+ enables sharing, mints a token);
	// "Keep private"/disable clears the date (and turns sharing off on explicit disable).
	publishRecord: async ({ request, locals, params }) => {
		try {
			const gate = await requireOwner(locals, params.slug);
			if (!gate.ok) return fail(gate.status, { error: gate.message });

			const data = await request.formData();
			const publish = data.get('publish')?.toString() === 'on';
			const disable = data.get('disable')?.toString() === 'on';
			const showBudget = data.get('show_budget')?.toString() === 'on';

			const updates: Record<string, unknown> = {};
			if (disable) {
				// "Disable sharing" — turn the public link off and pause publishing.
				updates.archive_enabled = false;
				updates.archive_publish_at = '';
			} else if (publish) {
				// #301: default "publish now" to the trip-LOCAL today (matching the
				// visibility gate), never the UTC date — see resolvePublishDay.
				const trip = await locals.pb.collection('trips').getOne(gate.tripId);
				const day = resolvePublishDay(data.get('publish_date')?.toString() || '', {
					timezone: trip.timezone
				});
				updates.archive_publish_at = `${day} 00:00:00.000Z`;
				updates.archive_enabled = true;
				updates.archive_show_budget = showBudget;
				if (!trip.public_share_token) {
					const { generateArchiveToken } = await import('$lib/portability/archive-token');
					updates.public_share_token = generateArchiveToken();
				}
			} else {
				// Keep private — clear the publish date (sharing stays enabled but unpublished).
				updates.archive_publish_at = '';
			}

			await locals.pb.collection('trips').update(gate.tripId, updates);
			return { publishSaved: true };
		} catch (err: unknown) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update sharing.' });
		}
	},

	// Reopen a closed trip (#242). Owner/co_owner ONLY, behind a confirm (the UI). Sets
	// archived:false → the trip RE-DERIVES its lifecycle from dates (wrap-up if past end,
	// active if still in range) — there is no special "reopened" state. ALSO clears
	// archive_publish_at so a trip pulled back into editing isn't left publicly exposed
	// (publishing pauses until the next closeout re-sets it).
	reopenTrip: async ({ locals, params }) => {
		try {
			const gate = await requireOwner(locals, params.slug);
			if (!gate.ok) return fail(gate.status, { error: gate.message });

			await locals.pb.collection('trips').update(gate.tripId, {
				archived: false,
				archive_publish_at: ''
			});
			redirect(303, `/trips/${params.slug}`);
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to reopen trip.' });
		}
	}
};
