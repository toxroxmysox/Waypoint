// #503 / ADR-0025 §2 — turn the AI's generic ops into the exact changes a
// commit will write. Checks here are the ones PB can't make: the can't-list
// (and only the collection's real field names, so PB's `field+` / `+field`
// modifiers can't slip past it), that every op and every link it sets lands in
// the proposal's trip (Review Focus 1), friendly inputs (a date, a 24h time,
// "$ref:name"), author stamps, what the app's forms fill in, and the app's
// Suggestion routing. Roles, tiling and item validity stay PB's call at
// commit; the phase rules are also run here so the preview can't promise
// what the hooks will refuse.
import { randomBytes } from 'node:crypto';
import type { TripRef } from '../context';
import { ymd } from '../present';
import { retilePhases, validateMovePhaseStart, validateNewPhaseStart } from '$lib/itinerary/phase-tiling';
import { shiftStoredDays } from '$lib/shell/trip-time';
import { blockedReason, WRITABLE, type WritableSpec } from './registry';
import type { Outcome, PlannedChange, WriteOp } from './types';

export const MAX_OPS = 50;

export interface RecordLoader {
	/** The record as the user can see it, or null. */
	get(collection: string, id: string): Promise<Record<string, unknown> | null>;
	/** The trip id a record (or a create's data) belongs to, via its spec's tripPath. */
	tripIdOf(collection: string, record: Record<string, unknown>): Promise<string>;
	/** The trip's day records (id, stored date, the phases covering it). */
	days(tripId: string): Promise<{ id: string; date: string; phases?: string[] }[]>;
	/** The trip's phases. */
	phases(tripId: string): Promise<{ id: string; name: string; start_date: string; order: number }[]>;
}

const ITEM_EDIT_REFUSED = "Only the trip's owners can edit items. I can leave a comment for them instead.";
/** #226 / #402: a traveler may change who's going on any item (PB keeps it self-only). */
const SELF_FIELDS = new Set(['assigned_to', 'not_going']);
/** Collections the app lets only owners/co-owners change (#175, budgets.pb.js). */
const OWNERS_ONLY: Record<string, string> = { phases: 'phases', trip_budgets: 'the budget' };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const STAMP_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/;
const DAY_MS = 86400_000;

/** Relation fields → the trip-scoped collection they point at (review I6: links stay in the trip). */
const LINKS: Record<string, string> = {
	phase: 'phases',
	day: 'days',
	item: 'items',
	items: 'items',
	linked_item: 'items',
	parent_item: 'items',
	keystones: 'items',
	fork_of: 'scenarios',
	checklist: 'checklists',
	goal: 'trip_goals',
	scenario: 'scenarios',
	suggestion: 'suggestions',
	paid_by: 'trip_members',
	booked_by: 'trip_members',
	assigned_to: 'trip_members',
	not_going: 'trip_members',
	assignee: 'trip_members',
	checked_by: 'trip_members',
	from_member: 'trip_members',
	to_member: 'trip_members',
	members: 'trip_members'
};

const newId = () => {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(randomBytes(15), (b) => alphabet[b % alphabet.length]).join('');
};
const label = (s: string) => s.replace(/_/g, ' ');
const isPrivileged = (ref: TripRef) => ref.role === 'owner' || ref.role === 'co_owner';
const empty = (v: unknown) => v === undefined || v === null || v === '';

function substituteRefs(v: unknown, refs: Map<string, string>): unknown {
	if (typeof v === 'string' && v.startsWith('$ref:')) {
		const id = refs.get(v.slice(5));
		if (!id) throw new Error(`"${v}" doesn't name a record created earlier in this proposal.`);
		return id;
	}
	if (Array.isArray(v)) return v.map((x) => substituteRefs(x, refs));
	return v;
}

function titleOf(record: Record<string, unknown> | null, data: Record<string, unknown>, spec: WritableSpec): string {
	for (const src of [record, data]) {
		for (const k of ['title', 'name', 'description', 'code_label', 'text', 'thought']) {
			const v = src?.[k];
			if (typeof v === 'string' && v.trim()) return v.trim();
		}
	}
	return spec.label;
}

/** The field names an op may carry: the spec's fields, its day field, and `trip` on a create. */
function allowedKeys(spec: WritableSpec): Set<string> {
	const keys = new Set(Object.keys(spec.fields));
	if (spec.dayField) keys.add(spec.dayField);
	if (spec.tripPath === 'trip') keys.add('trip');
	return keys;
}

export async function compileOps(loader: RecordLoader, ref: TripRef, ops: WriteOp[], userId = ''): Promise<PlannedChange[]> {
	if (!ops.length) throw new Error('Nothing to change.');
	if (ops.length > MAX_OPS) throw new Error(`At most ${MAX_OPS} changes at once.`);

	const trip = ref.trip;
	const elsewhere = `That record isn't in ${trip.title}.`;
	const refs = new Map<string, string>();
	const created = new Set<string>();
	let days: Awaited<ReturnType<RecordLoader['days']>> | null = null;
	let phases: Awaited<ReturnType<RecordLoader['phases']>> | null = null;
	const tripDays = async () => (days ??= await loader.days(trip.id));
	const tripPhases = async () => (phases ??= await loader.phases(trip.id));

	const dayIdFor = async (date: string) => {
		if (!ISO_DATE.test(date)) throw new Error(`"${date}" isn't a date. Use YYYY-MM-DD.`);
		if (!trip.start_date) throw new Error(`${trip.title} has no dates yet, so nothing can go on a day.`);
		const day = (await tripDays()).find((d) => ymd(d.date) === date);
		if (!day) throw new Error(`${date} is outside ${trip.title} (${ymd(trip.start_date)} → ${ymd(trip.end_date)}).`);
		return day;
	};

	/** Every link an op sets must point inside this trip (or at a record this proposal creates). */
	const checkLinks = async (data: Record<string, unknown>) => {
		for (const [field, target] of Object.entries(LINKS)) {
			if (!(field in data)) continue;
			for (const id of (Array.isArray(data[field]) ? data[field] : [data[field]]) as unknown[]) {
				if (empty(id) || created.has(String(id))) continue;
				if (target === 'days' && (await tripDays()).some((d) => d.id === id)) continue;
				if (target === 'phases' && (await tripPhases()).some((p) => p.id === id)) continue;
				const rec = await loader.get(target, String(id));
				if (!rec || String(rec.trip ?? '') !== trip.id) throw new Error(`That ${label(field)} isn't in ${trip.title}.`);
			}
		}
	};

	const changes: PlannedChange[] = [];
	for (const op of ops) {
		const blocked = blockedReason(op.collection);
		if (blocked) throw new Error(blocked);
		const spec = WRITABLE[op.collection];
		if (op.action === 'create' && spec.updateOnly) throw new Error(`I can only edit ${spec.label}, not add new ones.`);
		if (op.action === 'update' && spec.createOnly) throw new Error(`I can only add ${spec.label}, not edit them.`);
		if (OWNERS_ONLY[op.collection] && !isPrivileged(ref)) throw new Error(`Only the trip's owners can change ${OWNERS_ONLY[op.collection]}.`);

		const raw = { ...(op.data ?? {}) };
		const allowed = allowedKeys(spec);
		for (const field of Object.keys(raw)) {
			if (field === 'date' && spec.dayField) continue;
			const why = blockedReason(op.collection, field.replace(/^\+|[+-]$/g, ''));
			if (why) throw new Error(why);
			if (!allowed.has(field)) throw new Error(`"${field}" isn't something I can set on ${spec.label}. Ask describe for the fields.`);
		}
		const data = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, substituteRefs(v, refs)]));

		// The record and its trip (Review Focus 1: every op lands in this trip).
		let record: Record<string, unknown> | null = null;
		if (op.action === 'update') {
			record = await loader.get(op.collection, String(op.id ?? '').trim());
			if (!record) throw new Error(`No ${label(op.collection)} record "${op.id}" on a trip you're a member of.`);
			if ((await loader.tripIdOf(op.collection, record)) !== trip.id) throw new Error(elsewhere);
		}
		if (spec.tripPath === 'trip') {
			if (data.trip !== undefined && data.trip !== trip.id) throw new Error(elsewhere);
			if (op.action === 'create') data.trip = trip.id;
		} else if (op.action === 'create') {
			const parent = spec.tripPath.split('.')[0];
			if (!data[parent]) throw new Error(`Say which ${label(parent)} this belongs to (${parent}).`);
		}

		// Role routing, as the app does it (#175 items are owner/co_owner).
		let via: PlannedChange['via'] = 'record';
		let outcome: Outcome = 'saved';
		if (op.collection === 'items' && !isPrivileged(ref)) {
			if (op.action === 'create') {
				via = 'suggestion';
				outcome = trip.auto_approve_suggestions ? 'idea' : 'suggested';
			} else {
				const own = record?.created_by === ref.memberId;
				const selfOnly = Object.keys(data).every((f) => SELF_FIELDS.has(f));
				if (!own && !selfOnly) throw new Error(ITEM_EDIT_REFUSED);
			}
		}

		// Friendly inputs → stored values.
		let dayDate = '';
		if (spec.dayField) {
			const oldDayDate = record?.[spec.dayField]
				? ymd((await tripDays()).find((d) => d.id === record![spec.dayField!])?.date ?? '')
				: '';
			if ('date' in data) {
				const date = data.date ? String(data.date) : '';
				delete data.date;
				if (date) {
					const day = await dayIdFor(date);
					data[spec.dayField] = day.id;
					dayDate = date;
				} else {
					data[spec.dayField] = '';
				}
			} else if (spec.dayField in data && data[spec.dayField]) {
				dayDate = ymd((await tripDays()).find((d) => d.id === data[spec.dayField!])?.date ?? '');
			} else {
				dayDate = oldDayDate;
			}
			// Moving to another day moves the times and span with it (the app's
			// stored times carry their date; story 11).
			if (record && oldDayDate && dayDate && dayDate !== oldDayDate) {
				const delta = Math.round((Date.parse(dayDate) - Date.parse(oldDayDate)) / DAY_MS);
				for (const f of [...(spec.timeFields ?? []), 'end_date']) {
					if (!(f in data) && !empty(record[f])) data[f] = shiftStoredDays(String(record[f]), delta);
				}
			}
		}
		for (const f of spec.timeFields ?? []) {
			if (!(f in data) || empty(data[f])) continue;
			const v = String(data[f]);
			const stamped = v.match(STAMP_TIME);
			if (stamped) data[f] = `${stamped[1]} ${stamped[2]}:00.000Z`;
			else if (HHMM.test(v)) {
				if (!dayDate) throw new Error(`Give a date for ${label(f)} (this ${label(op.collection).replace(/s$/, '')} isn't on a day).`);
				data[f] = `${dayDate} ${v}:00.000Z`;
			} else throw new Error(`"${v}" isn't a time. Use 24-hour HH:MM, e.g. 09:40.`);
		}
		for (const f of spec.dateFields ?? []) {
			if (!(f in data) || empty(data[f])) continue;
			const v = String(data[f]).slice(0, 10);
			if (!ISO_DATE.test(v)) throw new Error(`"${data[f]}" isn't a date. Use YYYY-MM-DD.`);
			data[f] = `${v} 00:00:00.000Z`;
		}

		const invalid = spec.validate?.(data, { action: op.action, trip });
		if (invalid) throw new Error(invalid);

		// Phase starts: the same rules phases.pb.js applies (ADR-0021).
		if (op.collection === 'phases' && 'start_date' in data && trip.start_date) {
			const list = await tripPhases();
			const start = ymd(String(data.start_date));
			const why =
				op.action === 'create'
					? validateNewPhaseStart(start, trip.start_date, trip.end_date, list.map((p) => p.start_date))
					: validateMovePhaseStart(String(record!.id), start, retilePhases(list, trip.end_date), trip.start_date, trip.end_date);
			if (why) throw new Error(why);
		}

		let id: string;
		if (op.action === 'create') {
			for (const [f, who] of Object.entries(spec.stamp ?? {})) data[f] = who === 'user' ? userId : ref.memberId;
			// What the app's forms fill in (required fields the AI can't or needn't send).
			if (op.collection === 'checklists') data.kind = 'manual';
			if (op.collection === 'scenarios') data.status = 'candidate';
			if (op.collection === 'trip_goals' && empty(data.manual_status)) data.manual_status = 'unplanned';
			if (op.collection === 'items') {
				const dayId = String(data.day ?? '');
				if (empty(data.status)) data.status = dayId ? 'planned' : 'unplanned';
				if (empty(data.phase)) {
					// items/new: a day's item takes the day's phase; an idea takes the first phase (#196).
					const dayPhase = dayId ? (await tripDays()).find((d) => d.id === dayId)?.phases?.[0] : undefined;
					const first = [...(await tripPhases())].sort((a, b) => a.order - b.order)[0]?.id;
					if (dayPhase ?? first) data.phase = dayPhase ?? first;
				}
			}
			id = newId();
			if (op.ref) refs.set(op.ref, id);
		} else {
			id = String(record!.id ?? op.id);
		}

		await checkLinks(data);
		if (op.action === 'create') created.add(id);

		changes.push({
			action: op.action,
			collection: op.collection,
			id,
			via,
			before: record ? Object.fromEntries(Object.keys(data).map((k) => [k, record![k] ?? null])) : null,
			after: data,
			outcome,
			title: titleOf(record, data, spec)
		});
	}
	return changes;
}
