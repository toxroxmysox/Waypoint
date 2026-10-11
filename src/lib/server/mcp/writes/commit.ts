// #503 / ADR-0025 §3 — commit exactly the proposal the user saw. Order matters:
// ownership and expiry, then a second commit (Confirm *and* "yes") answers
// "Already saved", then the switches are re-checked against a fresh read of the
// trip, then every touched field must still hold its preview value (stale →
// refuse, re-propose). Record changes go in ONE PB batch (a transaction: all or
// nothing) with the user's own token, so PB rules + hooks decide as in the app.
// A traveler's item adds then go through the app's suggestion route. Last, the
// private AI Change audit row (superuser: members can't write it).
import { env } from '$env/dynamic/private';
import { ClientResponseError } from 'pocketbase';
import { adminPb } from '../admin-pb';
import { myTrips, type McpContext } from '../context';
import { scrub } from '../present';
import { assertCanWrite, writesEnabled } from './gate';
import { pbLoader } from './loader';
import { outcomeLine } from './preview';
import { markCommitted, staleFields, takeProposal } from './proposals';
import { WRITABLE } from './registry';
import type { CommittedChange, Proposal } from './types';

export const ALREADY_SAVED = 'Already saved.';
export const WRITES_OFF = 'AI changes are turned off on this Waypoint right now.';

/** Every human-readable message in a PB error, batch sub-errors included. */
export function pbErrorText(err: unknown): string {
	if (!(err instanceof ClientResponseError)) return (err as Error)?.message || 'Something went wrong.';
	const found: string[] = [];
	const walk = (v: unknown) => {
		if (!v || typeof v !== 'object') return;
		const o = v as Record<string, unknown>;
		if (typeof o.message === 'string' && o.message) found.push(o.message);
		for (const x of Object.values(o)) walk(x);
	};
	walk(err.response);
	const msgs = [...new Set(found)].filter((m) => !/^(Batch transaction failed|Failed to process the request|Something went wrong)/i.test(m));
	return scrub(msgs.join(' ') || err.message || 'Waypoint refused the change.');
}

export async function commitProposal(
	ctx: McpContext,
	proposalId: string
): Promise<{ changeId: string; changes: CommittedChange[]; outcome: string; proposal: Proposal; already?: true }> {
	const p = takeProposal(proposalId.trim(), ctx.user.id, ctx.connectionId);
	if (p === 'expired') throw new Error('That preview has expired (they last 15 minutes). Ask me to propose it again.');
	if (p === 'not_yours') throw new Error("That preview isn't yours to confirm.");
	if (p.committedChangeId) {
		return { changeId: p.committedChangeId, changes: [], outcome: ALREADY_SAVED, proposal: p, already: true };
	}

	if (!writesEnabled(env)) throw new Error(WRITES_OFF);
	const ref = (await myTrips(ctx)).find((t) => t.trip.id === p.tripId);
	if (!ref) throw new Error("You're no longer a member of that trip.");
	assertCanWrite(ref);

	const loader = pbLoader(ctx.pb);
	for (const c of p.changes) {
		if (c.action !== 'update') continue;
		const stale = staleFields(c, await loader.get(c.collection, c.id));
		if (stale.length) throw new Error(`${c.title} changed since the preview (${stale.join(', ')}). Ask me to propose again.`);
	}

	const records = p.changes.filter((c) => c.via === 'record');
	if (records.length) {
		const batch = ctx.pb.createBatch();
		for (const c of records) {
			if (c.action === 'create') batch.collection(c.collection).create({ id: c.id, ...c.after });
			else batch.collection(c.collection).update(c.id, c.after);
		}
		try {
			await batch.send({ requestKey: null });
		} catch (err) {
			throw new Error(pbErrorText(err));
		}
	}

	const committed: CommittedChange[] = [];
	for (const c of p.changes) {
		if (c.via === 'record') {
			committed.push({ ...c, committed: true });
			continue;
		}
		// A traveler's item add, exactly as the app sends it (#175): the route
		// queues it, or adds it straight away when the trip auto-approves.
		const stamps = Object.keys(WRITABLE[c.collection]?.stamp ?? {});
		const payload = Object.fromEntries(Object.entries(c.after).filter(([k]) => k !== 'trip' && !stamps.includes(k)));
		try {
			const res = await ctx.pb.send<{ suggestion_id: string }>('/api/suggestions/create', {
				method: 'POST',
				body: { trip_id: p.tripId, payload },
				requestKey: null
			});
			committed.push({ ...c, committed: true, suggestionId: res.suggestion_id });
		} catch (err) {
			committed.push({ ...c, committed: false });
			if (!records.length && committed.every((x) => !x.committed)) throw new Error(pbErrorText(err));
		}
	}

	const row = await (await adminPb()).collection('ai_changes').create(
		{ user: ctx.user.id, connection: ctx.connectionId, trip: p.tripId, quote: p.quote, changes: committed },
		{ requestKey: null }
	);
	markCommitted(p.id, row.id);
	return { changeId: row.id, changes: committed, outcome: outcomeLine(committed.filter((c) => c.committed)), proposal: p };
}
