// #503 / ADR-0025 §3 — propose: compile the AI's ops against the can't-list and
// the trip, preview them (old → new, the user's words, the real outcome, every
// cascade) and hold them 15 minutes for commit_changes. Writes nothing.
import { z } from 'zod';
import { resolveTrip } from '../context';
import { result } from '../present';
import { cascadeFor } from '../writes/cascade';
import { compileOps } from '../writes/compile';
import { QUOTE_MAX } from '../writes/commit';
import { assertCanWrite } from '../writes/gate';
import { loadLabels, loadSnapshot, pbLoader } from '../writes/loader';
import { outcomeLine, previewCards, rangeText } from '../writes/preview';
import { saveProposal } from '../writes/proposals';
import type { WriteOp } from '../writes/types';
import type { ToolDef } from './types';

const op = z.object({
	action: z.enum(['create', 'update']),
	collection: z.string().describe('Collection name from describe, e.g. items, expenses, phases, trips'),
	id: z.string().optional().describe('Record id (update)'),
	ref: z.string().optional().describe('Name for this new record, so a later op can use "$ref:<name>"'),
	data: z.record(z.string(), z.unknown()).describe('Fields to set. Dates YYYY-MM-DD, times HH:MM (24h), trip-local')
});

export const proposeChanges: ToolDef = {
	name: 'propose_changes',
	title: 'Propose a change',
	description:
		'Preview changes to a trip before anything is written. Pass the user’s own words that state the decision as `quote`, ' +
		'and `ops` (see describe for collections and fields). Returns a preview and a proposal_id. Show the preview and wait: ' +
		'call commit_changes only after the user says yes in a later message (or taps Confirm). Record only what the user ' +
		'stated; never infer a booking, payment, vote or choice. At most 50 ops; all-or-nothing.',
	inputSchema: {
		trip: z.string().describe('Trip slug, id, or name'),
		quote: z.string().describe("The user's own words stating the decision"),
		ops: z.array(op).describe('Changes to make, in order')
	},
	write: true,
	mutates: true,
	async run(ctx, { trip, quote, ops }: { trip: string; quote: string; ops: WriteOp[] }) {
		if (!quote?.trim()) throw new Error("Include the user's own words as `quote`.");
		const ref = await resolveTrip(ctx, trip);
		assertCanWrite(ref);

		const changes = await compileOps(pbLoader(ctx.pb), ref, ops ?? [], ctx.user.id);
		const touchesDates = changes.some(
			(c) => (c.collection === 'trips' && ('start_date' in c.after || 'end_date' in c.after)) || (c.collection === 'phases' && 'start_date' in c.after)
		);
		const snapshot = touchesDates ? await loadSnapshot(ctx.pb, ref.trip) : undefined;
		const cascade = snapshot ? cascadeFor(changes, snapshot) : null;
		const labels = await loadLabels(ctx, ref.trip.id, snapshot);

		const proposal = saveProposal({
			userId: ctx.user.id,
			connectionId: ctx.connectionId,
			tripId: ref.trip.id,
			quote: quote.trim().length > QUOTE_MAX ? `${quote.trim().slice(0, QUOTE_MAX - 1)}…` : quote.trim(),
			changes,
			cascade
		});
		const outcome = outcomeLine(changes);
		const cards = previewCards(changes, cascade, ref.trip, labels);
		const calendar = cascade?.tripBefore && cascade.tripAfter ? { before: cascade.tripBefore, after: cascade.tripAfter } : undefined;
		const n = changes.length;
		return result(`Preview: ${n} change${n === 1 ? '' : 's'} to ${ref.trip.title}`, cards, {
			proposal: { id: proposal.id, quote: proposal.quote, outcome, ...(calendar ? { calendar } : {}) },
			note:
				`“${proposal.quote}” → ${outcome}.` +
				(calendar ? ` Dates: ${rangeText(calendar.before)} → ${rangeText(calendar.after)}.` : '') +
				` Nothing is saved yet: say yes to save it (proposal ${proposal.id}, valid 15 minutes).`
		});
	}
};
