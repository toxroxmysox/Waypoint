import { z } from 'zod';
import type { Task } from '$lib/types';
import { formatDayDate } from '$lib/shell/format';
import { resolveTrip } from '../context';
import { loadTripDays, loadTripItems } from '../day-data';
import { auditTrip, type AuditGap, type CodeDoc } from '../audit';
import { offTrip, result, type Card } from '../present';
import type { ToolDef } from './types';

const LABEL: Record<AuditGap['kind'], { emoji: string; tag: string }> = {
	no_lodging: { emoji: '🛏️', tag: 'night without lodging' },
	unbooked: { emoji: '📌', tag: 'not booked yet' },
	flight_no_code: { emoji: '✈️', tag: 'no confirmation code' },
	overlap: { emoji: '⏱️', tag: 'times overlap' },
	unplaced_idea: { emoji: '💡', tag: 'idea not on a day' },
	open_task: { emoji: '☑️', tag: 'open task' }
};
const ORDER = Object.keys(LABEL) as AuditGap['kind'][];

export const auditTripTool: ToolDef = {
	name: 'audit_trip',
	title: "What's missing",
	description:
		'Gaps Waypoint can see on a trip: nights without lodging, items that still need booking, flights without a confirmation code, ' +
		'overlapping times, ideas not yet on a day, and open tasks.',
	inputSchema: { trip: z.string().describe('Trip slug, or part of its title') },
	async run(ctx, { trip: ref }: { trip: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const pb = ctx.pb;
		const [days, items, codeDocs, tasks] = await Promise.all([
			loadTripDays(ctx, t.trip),
			loadTripItems(ctx, t.trip),
			pb.collection('documents').getFullList<CodeDoc>({
				filter: pb.filter('trip = {:t} && kind = "code"', { t: t.trip.id }),
				fields: 'item,kind,code_label,code_value',
				requestKey: null
			}),
			pb.collection('tasks').getFullList<Task>({
				filter: pb.filter('checklist.trip = {:t}', { t: t.trip.id }),
				fields: 'id,checklist,title,checked,assignee,order',
				requestKey: null
			})
		]);
		const gaps = auditTrip({ trip: t.trip, days, items, codeDocs, tasks }).sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
		const cards: Card[] = gaps.map((g) => ({
			emoji: LABEL[g.kind].emoji,
			title: g.title,
			tag: LABEL[g.kind].tag,
			lines: [g.date ? formatDayDate(g.date) : '', g.itemId ? `id: ${g.itemId}` : ''].filter(Boolean)
		}));
		return result(`What's missing · ${t.trip.title}`, cards, cards.length ? {} : { note: 'Nothing missing that Waypoint can see.' });
	}
};
