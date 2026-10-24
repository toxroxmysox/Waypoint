// #503 / ADR-0025 §3 — commit a proposal the user said yes to (in chat, or the
// card's Confirm). All-or-nothing; refused if anything it touches changed since
// the preview, if it isn't this user's and connection's, or if AI changes were
// switched off in between.
import { z } from 'zod';
import { result } from '../present';
import { ALREADY_SAVED, commitProposal } from '../writes/commit';
import { OUTCOME_TEXT } from '../writes/preview';
import type { ToolDef } from './types';

export const commitChanges: ToolDef = {
	name: 'commit_changes',
	title: 'Save a proposed change',
	description:
		'Save a preview from propose_changes, exactly as shown. Call only after the user says yes in a later message ' +
		'(or taps Confirm on the card). Everything in it is saved, or nothing is.',
	inputSchema: { proposal_id: z.string().describe('The proposal id from propose_changes') },
	write: true,
	mutates: true,
	async run(ctx, { proposal_id }: { proposal_id: string }) {
		const { changeId, changes, outcome, proposal, already, unrecorded } = await commitProposal(
			ctx,
			proposal_id
		);
		if (already) {
			return result(
				ALREADY_SAVED,
				[{ emoji: '✅', title: ALREADY_SAVED, lines: [`“${proposal.quote}”`] }],
				{
					change_id: changeId,
					note: 'This preview was already saved; nothing more was written.'
				}
			);
		}
		const failed = changes.filter((c) => !c.committed);
		const cards = changes.map((c) => ({
			emoji: c.committed ? '✅' : '⚠️',
			title: c.title,
			tag: c.collection.replace(/_/g, ' '),
			lines: [c.committed ? OUTCOME_TEXT[c.outcome] : 'Not sent: Waypoint refused the suggestion.']
		}));
		return result(outcome || 'Nothing saved', cards, {
			change_id: changeId,
			note:
				`“${proposal.quote}” — ${outcome || 'nothing saved'}.${failed.length ? ` ${failed.length} not sent.` : ''}` +
				(unrecorded
					? ' Saved, but not recorded for undo: change it back in the app if needed.'
					: ' Say “undo that” to revert.')
		});
	}
};
