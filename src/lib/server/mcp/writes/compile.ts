// #503 / ADR-0025 §2 — turn the AI's generic ops into the exact changes a
// commit will write. Checks here are the ones PB can't make: the can't-list,
// that every op lands in the proposal's trip (Review Focus 1), friendly inputs
// (a date, a 24h time, "$ref:name"), author stamps, and the app's Suggestion
// routing. Everything else (roles, tiling, item validity) is PB's call at commit.
import { randomBytes } from 'node:crypto';
import type { TripRef } from '../context';
import { ymd } from '../present';
import { blockedReason, WRITABLE, type WritableSpec } from './registry';
import type { Outcome, PlannedChange, WriteOp } from './types';

export const MAX_OPS = 50;

export interface RecordLoader {
	/** The record as the user can see it, or null. */
	get(collection: string, id: string): Promise<Record<string, unknown> | null>;
	/** The trip id a record (or a create's data) belongs to, via its spec's tripPath. */
	tripIdOf(collection: string, record: Record<string, unknown>): Promise<string>;
	/** The trip's day records (id + stored date). */
	days(tripId: string): Promise<{ id: string; date: string }[]>;
}

const ITEM_EDIT_REFUSED = "Only the trip's owners can edit items. I can leave a comment for them instead.";
/** #226 / #402: a traveler may change who's going on any item (PB keeps it self-only). */
const SELF_FIELDS = new Set(['assigned_to', 'not_going']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const STAMP_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/;

const newId = () => {
	const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from(randomBytes(15), (b) => alphabet[b % alphabet.length]).join('');
};
const label = (s: string) => s.replace(/_/g, ' ');
const isPrivileged = (ref: TripRef) => ref.role === 'owner' || ref.role === 'co_owner';

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

export async function compileOps(loader: RecordLoader, ref: TripRef, ops: WriteOp[], userId = ''): Promise<PlannedChange[]> {
	if (!ops.length) throw new Error('Nothing to change.');
	if (ops.length > MAX_OPS) throw new Error(`At most ${MAX_OPS} changes at once.`);

	const trip = ref.trip;
	const elsewhere = `That record isn't in ${trip.title}.`;
	const refs = new Map<string, string>();
	const created = new Set<string>();
	let days: { id: string; date: string }[] | null = null;
	const tripDays = async () => (days ??= await loader.days(trip.id));

	const dayIdFor = async (date: string) => {
		if (!ISO_DATE.test(date)) throw new Error(`"${date}" isn't a date. Use YYYY-MM-DD.`);
		if (!trip.start_date) throw new Error(`${trip.title} has no dates yet, so nothing can go on a day.`);
		const day = (await tripDays()).find((d) => ymd(d.date) === date);
		if (!day) throw new Error(`${date} is outside ${trip.title} (${ymd(trip.start_date)} → ${ymd(trip.end_date)}).`);
		return day;
	};

	const changes: PlannedChange[] = [];
	for (const op of ops) {
		const blocked = blockedReason(op.collection);
		if (blocked) throw new Error(blocked);
		const spec = WRITABLE[op.collection];
		if (op.action === 'create' && spec.updateOnly) throw new Error(`I can only edit ${spec.label}, not add new ones.`);
		if (op.action === 'update' && spec.createOnly) throw new Error(`I can only add ${spec.label}, not edit them.`);

		const raw = { ...(op.data ?? {}) };
		for (const field of Object.keys(raw)) {
			if (field === 'date' && spec.dayField) continue;
			if (field === 'trip' && op.action === 'create') continue;
			const why = blockedReason(op.collection, field);
			if (why) throw new Error(why);
		}
		const data = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, substituteRefs(v, refs)]));

		// The record and its trip (Review Focus 1: every op lands in this trip).
		let record: Record<string, unknown> | null = null;
		if (op.action === 'update') {
			record = await loader.get(op.collection, String(op.id ?? '').trim());
			if (!record) throw new Error(`No ${label(op.collection)} record "${op.id}" on a trip you're a member of.`);
			if ((await loader.tripIdOf(op.collection, record)) !== trip.id) throw new Error(elsewhere);
			// Nor may an update move it out: re-resolve the trip with the new values.
			const moved = { ...record, ...data };
			if (spec.tripPath === 'id' ? 'id' in data : spec.tripPath.split('.')[0] in data) {
				const parent = String(moved[spec.tripPath.split('.')[0]] ?? '');
				if (!created.has(parent) && (await loader.tripIdOf(op.collection, moved)) !== trip.id) throw new Error(elsewhere);
			}
		} else if (spec.tripPath === 'trip') {
			if (data.trip !== undefined && data.trip !== trip.id) throw new Error(elsewhere);
			data.trip = trip.id;
		} else {
			const parent = spec.tripPath.split('.')[0];
			const pid = String(data[parent] ?? '');
			if (!pid) throw new Error(`Say which ${label(parent)} this belongs to (${parent}).`);
			if (!created.has(pid) && (await loader.tripIdOf(op.collection, data)) !== trip.id) throw new Error(elsewhere);
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
			} else if (record?.[spec.dayField]) {
				dayDate = ymd((await tripDays()).find((d) => d.id === record![spec.dayField!])?.date ?? '');
			}
		}
		for (const f of spec.timeFields ?? []) {
			if (!(f in data) || data[f] === '' || data[f] === null) continue;
			const v = String(data[f]);
			const stamped = v.match(STAMP_TIME);
			if (stamped) data[f] = `${stamped[1]} ${stamped[2]}:00.000Z`;
			else if (HHMM.test(v)) {
				if (!dayDate) throw new Error(`Give a date for ${label(f)} (this ${label(op.collection).replace(/s$/, '')} isn't on a day).`);
				data[f] = `${dayDate} ${v}:00.000Z`;
			} else throw new Error(`"${v}" isn't a time. Use 24-hour HH:MM, e.g. 09:40.`);
		}
		for (const f of spec.dateFields ?? []) {
			if (!(f in data) || data[f] === '' || data[f] === null) continue;
			const v = String(data[f]).slice(0, 10);
			if (!ISO_DATE.test(v)) throw new Error(`"${data[f]}" isn't a date. Use YYYY-MM-DD.`);
			data[f] = `${v} 00:00:00.000Z`;
		}

		const invalid = spec.validate?.(data, { action: op.action, trip });
		if (invalid) throw new Error(invalid);

		let id: string;
		if (op.action === 'create') {
			for (const [f, who] of Object.entries(spec.stamp ?? {})) data[f] = who === 'user' ? userId : ref.memberId;
			id = newId();
			if (op.ref) refs.set(op.ref, id);
			created.add(id);
		} else {
			id = String(record!.id ?? op.id);
		}

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
