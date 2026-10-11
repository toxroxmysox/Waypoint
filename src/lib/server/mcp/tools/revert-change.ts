// #503 / ADR-0025 §5 — "undo that": revert the user's latest AI Change, or one
// by id. Leaves alone anything someone changed since, and says what it skipped.
import { z } from 'zod';
import { result } from '../present';
import { ALREADY_UNDONE, revertChange } from '../writes/revert';
import type { ToolDef } from './types';

export const revertChangeTool: ToolDef = {
	name: 'revert_change',
	title: 'Undo an AI change',
	description:
		'Undo a change made through Waypoint’s connector: the user’s latest one, or `change_id` (from commit_changes). ' +
		'Fields someone changed since are left alone and listed; records it added are removed.',
	inputSchema: { change_id: z.string().optional().describe('AI change id (default: the latest)') },
	write: true,
	mutates: true,
	async run(ctx, { change_id }: { change_id?: string }) {
		const r = await revertChange(ctx.pb, ctx.user.id, change_id);
		if (r.already) return result(ALREADY_UNDONE, [{ emoji: '↩️', title: ALREADY_UNDONE, lines: [`“${r.quote}”`] }]);
		const cards = [
			...(r.restored.length ? [{ emoji: '↩️', title: 'Undone', lines: r.restored }] : []),
			...(r.skipped.length ? [{ emoji: '⚠️', title: 'Left as is', lines: r.skipped }] : [])
		];
		return result(`Undone: “${r.quote}”`, cards, { note: r.skipped.length ? 'Some things were left as they are.' : 'Everything was put back.' });
	}
};
