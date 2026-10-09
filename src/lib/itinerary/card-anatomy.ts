// Pure derivations behind the Card (head / meta / strip) and the Timeline Rail
// (#420; spec §Timeline Rail geometry, §Card anatomy, §Overlap, §Going,
// §Accessibility; CARD_SYSTEM D2/D8/D9/D10). No DOM, no I/O: layout itself is
// proven by `pnpm verify:visual`, these are the rules it renders.
import { formatClock, formatCountdown } from '$lib/shell/format';
import { timeShape, type TimeFields, type TimeShape } from '$lib/itinerary/timeline';
import type { ItemType } from '$lib/itinerary/types';

/** The fields these derivations read; any Item satisfies it. */
export interface CardItemFields extends TimeFields {
	id: string;
	title: string;
	type: ItemType;
	location_name?: string;
	description?: string;
	assigned_to?: string[];
	not_going?: string[];
}

// --- Rail geometry (D9) -------------------------------------------------------
/** px: rule-to-text, text height, text-to-segment, segment-to-icon, icon disc. */
export const RAIL = { column: 48, gap: 8, rulePad: 5, text: 11, textSeg: 4, segIcon: 4, icon: 24, minSeg: 6 } as const;
/** A card with a time label is at least this tall (D8/D9: "about 62px"). */
export const TIMED_MIN_HEIGHT = 62;

export interface RailSegment {
	/** px from the card's top edge. */
	top: number;
	length: number;
}

/**
 * Where the rail's segments run for a card of `height` px. The top segment runs
 * from under the start label to above the icon; the bottom from under the icon to
 * above the end label. A segment shorter than 6px is dropped (null). Only
 * segments that touch a label exist: untimed has none, start-only only the top,
 * end-only only the bottom. The segment runs within the item, never between cards.
 */
export function railSegments(
	height: number,
	shape: TimeShape
): { top: RailSegment | null; bottom: RailSegment | null } {
	const labelEnd = RAIL.rulePad + RAIL.text + RAIL.textSeg; // 20
	const iconTop = height / 2 - RAIL.icon / 2 - RAIL.segIcon;
	const iconBottom = height / 2 + RAIL.icon / 2 + RAIL.segIcon;
	const keep = (s: RailSegment): RailSegment | null => (s.length >= RAIL.minSeg ? s : null);
	const topSeg = keep({ top: labelEnd, length: iconTop - labelEnd });
	const botSeg = keep({ top: iconBottom, length: height - labelEnd - iconBottom });
	return {
		top: shape === 'range' || shape === 'start-only' ? topSeg : null,
		bottom: shape === 'range' || shape === 'end-only' ? botSeg : null
	};
}

// --- Strip overflow (D2) ------------------------------------------------------
export type StripFit = 'full' | 'icon' | 'dropped';
export interface StripMeasure {
	key: string;
	/** Width as text + icon. */
	full: number;
	/** Width as the icon alone. */
	icon: number;
}

/**
 * The overflow rule. `entries` are in priority order (highest first). While the
 * strip doesn't fit, the lowest-priority entry still `full` shrinks to its icon;
 * then it drops; then the next lowest does the same.
 */
export function fitStrip(entries: StripMeasure[], available: number, gap = 8): Record<string, StripFit> {
	const state: Record<string, StripFit> = Object.fromEntries(entries.map((e) => [e.key, 'full' as StripFit]));
	const width = () => {
		const shown = entries.filter((e) => state[e.key] !== 'dropped');
		const sum = shown.reduce((n, e) => n + (state[e.key] === 'icon' ? e.icon : e.full), 0);
		return sum + Math.max(0, shown.length - 1) * gap;
	};
	for (let i = entries.length - 1; i >= 0 && width() > available; i--) {
		state[entries[i].key] = 'icon';
		if (width() > available) state[entries[i].key] = 'dropped';
	}
	return state;
}

/** Rough text width (px) at the strip's 11px type, for `fitStrip`. */
export function estimateTextWidth(text: string, px = 11): number {
	return Math.ceil(text.length * px * 0.56);
}

// --- Strip entries (D2, #429) -------------------------------------------------
export type StripKind = 'overlap' | 'needs-booking' | 'booked' | 'code' | 'docs';
export interface StripEntry {
	key: string;
	kind: StripKind;
	/** The visible text. */
	text: string;
	/** Spoken in full, including when shrunk to the icon. */
	label: string;
	tone: 'red' | 'ink' | 'gold' | 'quiet';
	/** A `code` entry: the value the chip copies on tap. */
	copy?: string;
}

export interface StripCode {
	/** Copied on tap: the first usable code. */
	value: string;
	/** What the chip prints: `ABC123` or `ABC123 +2`. */
	text: string;
	/** Other codes the item holds (the `+n`). */
	extra: number;
	label: string;
}

/**
 * The Trip Mode `✓ {code}` chip: the first non-blank code, `+n` for the rest.
 * Null when the item has no usable code (it then keeps `✓ Booked`).
 */
export function stripCode(codes: { label?: string; value?: string }[] | undefined): StripCode | null {
	const usable = (codes ?? []).map((c) => (c.value ?? '').trim()).filter(Boolean);
	if (usable.length === 0) return null;
	const extra = usable.length - 1;
	return {
		value: usable[0],
		text: extra > 0 ? `${usable[0]} +${extra}` : usable[0],
		extra,
		label:
			extra > 0
				? `Copy confirmation code ${usable[0]}, ${extra} more ${extra === 1 ? 'code' : 'codes'} on the item`
				: `Copy confirmation code ${usable[0]}`
	};
}

const clip = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The strip's left side in priority order: Overlaps > Needs booking > Booked (a
 * `✓ {code}` chip in Trip Mode when the item has a code) > documents. Trip Mode
 * shows no conflicts at all: an overlap pair passed in is ignored (spec §Overlap).
 */
export function stripEntries(p: {
	mode: 'planning' | 'trip';
	overlap?: OverlapInfo;
	needsBooking: boolean;
	booked: boolean;
	codes?: { label?: string; value?: string }[];
	docCount: number;
}): StripEntry[] {
	const out: StripEntry[] = [];
	const overlap = p.mode === 'planning' ? p.overlap : undefined;
	if (overlap)
		out.push({
			key: 'overlap',
			kind: 'overlap',
			text: `Overlaps ${clip(overlap.partnerTitle)}`,
			label: `Overlaps ${overlap.partnerTitle}`,
			tone: overlap.shared ? 'red' : 'ink'
		});
	if (p.needsBooking)
		out.push({ key: 'needs', kind: 'needs-booking', text: 'To book', label: 'Needs booking', tone: 'gold' });
	else if (p.booked) {
		const code = p.mode === 'trip' ? stripCode(p.codes) : null;
		if (code)
			out.push({ key: 'code', kind: 'code', text: code.text, label: code.label, tone: 'ink', copy: code.value });
		else out.push({ key: 'booked', kind: 'booked', text: 'Booked', label: 'Booked', tone: 'quiet' });
	}
	if (p.docCount > 0)
		out.push({
			key: 'docs',
			kind: 'docs',
			text: String(p.docCount),
			label: `${p.docCount} ${p.docCount === 1 ? 'document' : 'documents'}`,
			tone: 'ink'
		});
	return out;
}

// --- Meta (D2) ----------------------------------------------------------------
const AIRPORT = /\(([A-Z0-9]{3,4})\)/;
/**
 * The best "where" for the type: location; a flight's route (`MKE → DEN` from the
 * departure label and the description's arrival label); a note's first description
 * line. '' when the item has none.
 */
export function cardMeta(item: Pick<CardItemFields, 'type' | 'location_name' | 'description'>): string {
	if (item.type === 'note') {
		return (item.description ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
	}
	if (item.type === 'flight') {
		const from = AIRPORT.exec(item.location_name ?? '')?.[1];
		const to = AIRPORT.exec(item.description ?? '')?.[1];
		if (from && to) return `${from} → ${to}`;
	}
	return item.location_name?.trim() ?? '';
}

// --- Going (D6) ---------------------------------------------------------------
export interface GoingBubble {
	memberId: string;
	notGoing: boolean;
}
/** At most 3 bubbles (the going ones, then the struck not-going), the rest as `extra`. */
export function goingBubbles(
	item: Pick<CardItemFields, 'assigned_to' | 'not_going'>,
	max = 3
): { shown: GoingBubble[]; extra: number } {
	const all: GoingBubble[] = [
		...(item.assigned_to ?? []).map((memberId) => ({ memberId, notGoing: false })),
		...(item.not_going ?? []).map((memberId) => ({ memberId, notGoing: true }))
	];
	return { shown: all.slice(0, max), extra: Math.max(0, all.length - max) };
}

// --- Overlap (D10) ------------------------------------------------------------
export interface OverlapInfo {
	partnerId: string;
	partnerTitle: string;
	/** Red only when the same people are going to both. */
	shared: boolean;
	/** Role against the NAMED partner: the earlier-starting item's END and the later one's START go red (when shared). */
	role: 'earlier' | 'later';
	/** This item's start time is red: it starts inside an item it shares people with. */
	redStart: boolean;
	/** This item's end time is red: a shared-people item starts before it ends. */
	redEnd: boolean;
}

/** Minutes since midnight from a stored time string; NaN when none. */
export function clockMinutes(t: string | undefined): number {
	const m = /(\d{1,2}):(\d{2})/.exec((t ?? '').split(/[T ]/).pop() ?? '');
	return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
}

/**
 * Overlap as pairs: each item with a start AND an end that collides with another
 * learns a partner and whether they share a Going member (`assigned_to` only).
 * Both items of a pair carry it. With several collisions (three-way) the note
 * names a partner sharing people if there is one, else the first by start; the
 * rail times go red per collision with shared people, so one item can be red at
 * both its start and its end.
 */
export function overlapPairs(items: CardItemFields[]): Map<string, OverlapInfo> {
	const ranged = items
		.filter((i) => timeShape(i) === 'range')
		.map((i) => ({ i, s: clockMinutes(i.start_time), e: clockMinutes(i.end_time) }))
		.sort((a, b) => a.s - b.s);
	const out = new Map<string, OverlapInfo>();
	const note = (self: CardItemFields, other: CardItemFields, shared: boolean, role: 'earlier' | 'later') => {
		const cur = out.get(self.id);
		const redStart = (cur?.redStart ?? false) || (shared && role === 'later');
		const redEnd = (cur?.redEnd ?? false) || (shared && role === 'earlier');
		// First collision names the partner; a later shared one replaces an unshared one.
		const keep = cur && (cur.shared || !shared);
		out.set(self.id, {
			...(keep ? cur : { partnerId: other.id, partnerTitle: other.title, shared, role }),
			redStart,
			redEnd
		});
	};
	for (let a = 0; a < ranged.length; a++) {
		for (let b = a + 1; b < ranged.length; b++) {
			if (ranged[b].s >= ranged[a].e) break;
			const ia = ranged[a].i;
			const ib = ranged[b].i;
			const shared = (ia.assigned_to ?? []).some((id) => ib.assigned_to?.includes(id));
			note(ia, ib, shared, 'earlier');
			note(ib, ia, shared, 'later');
		}
	}
	return out;
}

// --- Free time (D8/D9) --------------------------------------------------------
export interface FreeGap {
	minutes: number;
	from: string;
	to: string;
}
/**
 * Gaps >= 60 min between a KNOWN end (an end time or a deadline) and the next
 * timed start, keyed by the item whose start closes the gap. `items` is in
 * display order. A start-only item has no known end, so it opens no gap.
 */
export function freeTimeGaps(items: CardItemFields[]): Map<string, FreeGap> {
	const out = new Map<string, FreeGap>();
	let lastEnd: number | null = null;
	let lastEndStr = '';
	for (const item of items) {
		const shape = timeShape(item);
		if (shape === 'untimed') continue;
		if (shape === 'range' || shape === 'start-only') {
			const start = clockMinutes(item.start_time);
			if (lastEnd !== null && start - lastEnd >= 60) {
				out.set(item.id, { minutes: start - lastEnd, from: formatClock(lastEndStr), to: formatClock(item.start_time ?? '') });
			}
		}
		if (shape === 'start-only') {
			lastEnd = null;
		} else {
			const end = clockMinutes(item.end_time);
			if (lastEnd === null || end > lastEnd) {
				lastEnd = end;
				lastEndStr = item.end_time ?? '';
			}
		}
	}
	return out;
}

/** `2h free · 4:30p to 6:30p` */
export function freeTimeLabel(gap: FreeGap): string {
	return `${formatCountdown(gap.minutes)} free · ${gap.from} to ${gap.to}`;
}
/** What a screen reader hears for the gap. */
export function freeTimeSpoken(gap: FreeGap): string {
	return `Free, ${gap.from} to ${gap.to}`;
}

// --- Accessible name (D2) -----------------------------------------------------
function spoken(t: string | undefined): { clock: string; mer: 'AM' | 'PM' } {
	const clock = formatClock(t ?? ''); // 6:30p
	return { clock: clock.slice(0, -1), mer: clock.endsWith('p') ? 'PM' : 'AM' };
}

/** `6:30 to 8:30 PM`, `6:30 PM`, `by 4:30 PM`, '' when untimed. */
export function spokenTime(item: TimeFields): string {
	const shape = timeShape(item);
	if (shape === 'untimed') return '';
	const s = spoken(item.start_time);
	const e = spoken(item.end_time);
	if (shape === 'start-only') return `${s.clock} ${s.mer}`;
	if (shape === 'end-only') return `by ${e.clock} ${e.mer}`;
	return s.mer === e.mer ? `${s.clock} to ${e.clock} ${e.mer}` : `${s.clock} ${s.mer} to ${e.clock} ${e.mer}`;
}

/**
 * time + title + type + state, e.g. "6:30 to 8:30 PM, Dinner at The Immigrant,
 * meal, needs booking". State = overlap note, then needs booking / booked.
 */
export function cardAccessibleName(p: {
	item: CardItemFields;
	needsBooking: boolean;
	booked: boolean;
	overlapWith?: string;
}): string {
	return [
		spokenTime(p.item),
		p.item.title,
		p.item.type,
		p.overlapWith ? `overlaps ${p.overlapWith}` : '',
		p.needsBooking ? 'needs booking' : p.booked ? 'booked' : ''
	]
		.filter(Boolean)
		.join(', ');
}
