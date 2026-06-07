import type { PageServerLoad } from './$types';
import type { Checklist, Task } from '$lib/types';

// Overview checklist previews (#51): roll up each manual, non-item-scoped
// Checklist's done/total so the Overview can show compact mini-cards under the
// whole-trip header and each phase's days. Same shape as the Lists index.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();

	const checklists = await locals.pb.collection('checklists').getFullList<Checklist>({
		filter: `trip = "${trip.id}" && kind = "manual" && item = ""`,
		sort: 'order'
	});

	const tasks =
		checklists.length > 0
			? await locals.pb.collection('tasks').getFullList<Task>({
					filter: checklists.map((c) => `checklist = "${c.id}"`).join(' || '),
					fields: 'id,checklist,checked'
				})
			: [];

	const lists = checklists.map((c) => {
		const own = tasks.filter((t) => t.checklist === c.id);
		return {
			id: c.id,
			title: c.title,
			phase: c.phase,
			done: own.filter((t) => t.checked).length,
			total: own.length
		};
	});

	return { lists };
};
