import type { Checklist, Task } from '$lib/types';

export interface ClonedChecklist {
	checklist: { trip: string; phase: string; item: ''; title: string; kind: 'manual'; order: number };
	tasks: Array<{ title: string; checked: false; order: number }>;
}

// Clone payloads for trip/phase-scoped manual checklists (ADR-0003 §7):
// `checked` reset to false, `assignee` dropped (carry the template forward,
// blank). The booking Smart List (kind = booking) is never stored, so it's
// naturally excluded; item-scoped lists are skipped (their Item is a different
// instance in the clone). Phase-scoped lists whose phase wasn't cloned are
// dropped too.
export function cloneChecklistPayloads(
	checklists: Checklist[],
	tasks: Task[],
	phaseIdMap: Map<string, string>,
	newTripId: string
): ClonedChecklist[] {
	const out: ClonedChecklist[] = [];
	for (const c of checklists) {
		if (c.kind !== 'manual' || c.item) continue;
		let phase = '';
		if (c.phase) {
			const mapped = phaseIdMap.get(c.phase);
			if (!mapped) continue; // phase not part of the clone
			phase = mapped;
		}
		out.push({
			checklist: { trip: newTripId, phase, item: '', title: c.title, kind: 'manual', order: c.order },
			tasks: tasks
				.filter((t) => t.checklist === c.id)
				.map((t) => ({ title: t.title, checked: false as const, order: t.order }))
		});
	}
	return out;
}
