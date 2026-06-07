import type PocketBase from 'pocketbase';
import type { Checklist, Task } from '$lib/types';

// Shared loaders for trip/phase-scoped manual checklists. Centralises the
// "manual, item-unscoped, with their tasks" fetch used by the Lists index,
// Overview previews, Trip Mode, Export, and Clone (#49/#50/#51/#52/#53).
export async function fetchManualChecklists(
	pb: PocketBase,
	tripId: string
): Promise<{ checklists: Checklist[]; tasks: Task[] }> {
	const checklists = await pb.collection('checklists').getFullList<Checklist>({
		filter: `trip = "${tripId}" && kind = "manual" && item = ""`,
		sort: 'order'
	});
	const tasks =
		checklists.length > 0
			? await pb.collection('tasks').getFullList<Task>({
					filter: checklists.map((c) => `checklist = "${c.id}"`).join(' || '),
					sort: 'order'
				})
			: [];
	return { checklists, tasks };
}

export interface ChecklistRollup {
	id: string;
	title: string;
	phase: string;
	done: number;
	total: number;
	assigneeIds: string[];
}

// Per-checklist progress + distinct assignees, for the index/overview previews.
export function rollupChecklists(checklists: Checklist[], tasks: Task[]): ChecklistRollup[] {
	return checklists.map((c) => {
		const own = tasks.filter((t) => t.checklist === c.id);
		return {
			id: c.id,
			title: c.title,
			phase: c.phase,
			done: own.filter((t) => t.checked).length,
			total: own.length,
			assigneeIds: [...new Set(own.filter((t) => t.assignee).map((t) => t.assignee))]
		};
	});
}
