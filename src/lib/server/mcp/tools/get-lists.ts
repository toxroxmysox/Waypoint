import { z } from 'zod';
import type { Checklist, Task } from '$lib/types';
import { resolveTrip } from '../context';
import { offTrip, result, type Card } from '../present';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

export const getLists: ToolDef = {
	name: 'get_lists',
	title: 'Lists and tasks',
	description: "A trip's lists (packing, to-dos and the like) with every task, open ones first, and who each task is assigned to.",
	inputSchema: { trip: z.string().describe('Trip slug, or part of its title') },
	async run(ctx, { trip: ref }: { trip: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const pb = ctx.pb;
		const [lists, tasks, members] = await Promise.all([
			pb.collection('checklists').getFullList<Checklist>({
				filter: pb.filter('trip = {:t}', { t: t.trip.id }),
				fields: 'id,title,kind,order',
				sort: 'order',
				requestKey: null
			}),
			pb.collection('tasks').getFullList<Task>({
				filter: pb.filter('checklist.trip = {:t}', { t: t.trip.id }),
				fields: 'id,checklist,title,checked,assignee,order',
				sort: 'order',
				requestKey: null
			}),
			loadMembers(ctx, t.trip.id)
		]);
		const name = new Map(members.map((m) => [m.id, memberName(m)]));
		const cards: Card[] = lists.map((l) => {
			const mine = tasks.filter((k) => k.checklist === l.id).sort((a, b) => Number(a.checked) - Number(b.checked) || a.order - b.order);
			const open = mine.filter((k) => !k.checked).length;
			return {
				emoji: '☑️',
				title: l.title,
				tag: `${open} open`,
				lines: mine.length
					? mine.map((k) => `${k.checked ? '☑' : '☐'} ${k.title}${k.assignee && name.get(k.assignee) ? ` · ${name.get(k.assignee)}` : ''}`)
					: ['(empty)']
			};
		});
		return result(`Lists · ${t.trip.title}`, cards, cards.length ? {} : { note: 'No lists on this trip.' });
	}
};
