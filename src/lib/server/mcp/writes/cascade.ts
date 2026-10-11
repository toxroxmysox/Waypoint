// #503 / ADR-0025 §4 — what a trip-date or phase change will do to the rest of
// the trip, shown before the user confirms (story 8). It mirrors, step for step,
// what PB does on commit: trips.pb.js (retile + merge phases that no longer fit,
// add/prune days, re-home a pruned day's items) and phases.pb.js (re-tile after
// a start move or a new phase), with retilePhases (ADR-0021) as the shared
// spec. Divergence from the hooks is a bug: mcp-writes.spec.ts's cascade case
// compares this preview with the committed phases.
import { retilePhases, toDay } from '$lib/itinerary/phase-tiling';
import type { Cascade, PlannedChange } from './types';

export type { Cascade };

export interface CascadeSnapshot {
	trip: { id: string; start_date: string; end_date: string };
	phases: { id: string; name: string; start_date: string; end_date: string }[];
	days: { id: string; date: string }[];
	items: { id: string; title: string; phase: string; day: string }[];
}

const addDay = (d: string, n: number) => {
	const x = new Date(`${d}T00:00:00.000Z`);
	x.setUTCDate(x.getUTCDate() + n);
	return x.toISOString().slice(0, 10);
};
function dateRange(start: string, end: string): string[] {
	const out: string[] = [];
	for (let d = start; d <= end; d = addDay(d, 1)) out.push(d);
	return out;
}
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function cascadeFor(changes: PlannedChange[], snapshot: CascadeSnapshot): Cascade | null {
	const tripChange = changes.find(
		(c) => c.collection === 'trips' && c.action === 'update' && ('start_date' in c.after || 'end_date' in c.after)
	);
	const phaseChanges = changes.filter((c) => c.collection === 'phases' && 'start_date' in c.after);
	if (!tripChange && !phaseChanges.length) return null;

	const { trip } = snapshot;
	const oldStart = toDay(trip.start_date ?? '');
	const oldEnd = toDay(trip.end_date ?? '');
	const newStart = tripChange && 'start_date' in tripChange.after ? toDay(str(tripChange.after.start_date)) : oldStart;
	const newEnd = tripChange && 'end_date' in tripChange.after ? toDay(str(tripChange.after.end_date)) : oldEnd;
	const datesMoved = newStart !== oldStart || newEnd !== oldEnd;
	if (!datesMoved && !phaseChanges.length) return null;
	if (!newStart || !newEnd) return null;

	const nameOf = new Map(snapshot.phases.map((p) => [p.id, p.name]));
	const before = new Map(snapshot.phases.map((p) => [p.id, [toDay(p.start_date), toDay(p.end_date)] as [string, string]]));

	// Phase starts after this proposal's own phase edits/creates.
	let starts = snapshot.phases.map((p) => ({ id: p.id, start: toDay(p.start_date) }));
	for (const c of phaseChanges) {
		const s = toDay(str(c.after.start_date));
		if (c.action === 'create') {
			starts.push({ id: c.id, start: s });
			nameOf.set(c.id, str(c.after.name) || 'New phase');
		} else starts = starts.map((p) => (p.id === c.id ? { ...p, start: s } : p));
	}
	if (!oldStart && !starts.length) {
		// #270 promotion: the hook seeds "Phase 1" across the whole trip.
		starts.push({ id: '__phase1', start: newStart });
		nameOf.set('__phase1', 'Phase 1');
	}

	// trips.pb.js retile: the last phase starting on/before the new start becomes
	// the first; earlier ones merge into it; ones starting on/after the new end
	// merge into their predecessor.
	const merged = new Map<string, string>();
	let kept = [...starts].sort((a, b) => a.start.localeCompare(b.start));
	if (datesMoved) {
		let firstIdx = 0;
		kept.forEach((p, i) => {
			if (p.start <= newStart) firstIdx = i;
		});
		const survivors: typeof kept = [];
		kept.forEach((p, i) => {
			if (i < firstIdx) merged.set(p.id, kept[firstIdx].id);
			else if (i > firstIdx && p.start >= newEnd) merged.set(p.id, survivors[survivors.length - 1].id);
			else survivors.push(p);
		});
		if (survivors.length) survivors[0] = { ...survivors[0], start: newStart };
		kept = survivors;
	}
	const tiled = retilePhases(
		kept.map((p) => ({ id: p.id, start_date: p.start })),
		newEnd
	);
	const after = new Map(tiled.map((p) => [p.id, [p.start, p.end] as [string, string]]));
	const ids = [...new Set([...snapshot.phases.map((p) => p.id), ...starts.map((p) => p.id)])];
	const phases = ids.map((id) => ({ name: nameOf.get(id) ?? 'Phase', before: before.get(id) ?? null, after: after.get(id) ?? null }));

	// Days: the hook adds every missing date in range and prunes the rest.
	const have = new Set(snapshot.days.map((d) => toDay(d.date)));
	const need = datesMoved ? new Set(dateRange(newStart, newEnd)) : have;
	const daysAdded = [...need].filter((d) => !have.has(d)).sort();
	const daysRemoved = [...have].filter((d) => !need.has(d)).sort();

	// Items re-homed: a merged phase's items go to the phase it merged into; a
	// pruned day's items lose the day and keep their phase, else take the
	// surviving phase covering that date (the last starting on/before it).
	const finalPhase = (id: string) => merged.get(id) ?? id;
	const covering = (date: string) => {
		let pick = tiled[0]?.id ?? '';
		for (const p of tiled) if (p.start <= date) pick = p.id;
		return pick;
	};
	const dateOf = new Map(snapshot.days.map((d) => [d.id, toDay(d.date)]));
	const pruned = new Set(daysRemoved);
	const moves: Cascade['moves'] = [];
	for (const item of snapshot.items) {
		const date = item.day ? dateOf.get(item.day) : undefined;
		const dayGone = !!date && pruned.has(date);
		const phaseGone = !!item.phase && merged.has(item.phase);
		if (!dayGone && !phaseGone && !(item.phase === '' && !oldStart)) continue;
		const to = item.phase ? finalPhase(item.phase) : covering(date ?? newStart);
		moves.push({ title: item.title, from: dayGone ? date! : nameOf.get(item.phase) ?? 'ideas', to: nameOf.get(to) ?? 'Phase' });
	}

	return {
		tripBefore: tripChange && datesMoved ? (oldStart ? [oldStart, oldEnd] : null) : null,
		tripAfter: tripChange && datesMoved ? [newStart, newEnd] : null,
		daysAdded,
		daysRemoved,
		phases,
		moves
	};
}
