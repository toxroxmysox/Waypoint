import type { Item } from '$lib/types';

// #245 Door 1 — the boundary-day core. A calendar day can belong to ≥2 phases
// (a travel-transition day). To scope the "ideas for now" strip to the CURRENT
// phase we must derive which of the day's phases is live RIGHT NOW. Pure — no IO.
//
// Derivation (PRD §6, Grill Resolutions):
//   1. current phase = the phase of the ACTIVE (ongoing) item;
//   2. else the phase of the MOST-RECENT item today ordered by `start_time`
//      (never list/`sort_order` position — an untimed idea sorted high in the
//      day list is not "what we just did");
//   3. TRANSITION RULE: if the chosen item is `transportation` or `flight`, the
//      current phase is the phase of the NEXT item being travelled TOWARD (the
//      arriving phase) — even if that next item is on a LATER day (a late-night
//      arrival with nothing else today still means we've arrived);
//   4. NO items at all today → the day's own phase (`primaryPhaseForDay`).
//
// Generalises to >2 phases: it never assumes exactly two.

const TRANSIT_TYPES: ReadonlySet<string> = new Set(['transportation', 'flight']);

function parseDateTime(dt: string): Date {
	if (!dt) return new Date(0);
	return new Date(dt.replace(' ', 'T'));
}

function isMultiDay(i: Item): boolean {
	return !!i.end_date && i.end_date.trim() !== '';
}

function isTransit(i: Item): boolean {
	return TRANSIT_TYPES.has(i.type);
}

/** The ongoing timed item right now (latest end_time wins among overlaps). */
function activeItem(items: Item[], now: Date): Item | null {
	const t = now.getTime();
	const ongoing = items.filter((i) => {
		if (isMultiDay(i)) return false;
		if (!i.start_time || !i.end_time) return false;
		return parseDateTime(i.start_time).getTime() <= t && t < parseDateTime(i.end_time).getTime();
	});
	if (ongoing.length === 0) return null;
	return ongoing
		.slice()
		.sort((a, b) => parseDateTime(b.end_time).getTime() - parseDateTime(a.end_time).getTime())[0];
}

/**
 * The most-recent item today by `start_time` at/before `now` — "what we're on or
 * just did". Timed items only (an untimed idea has no clock position, so it is
 * never "the current moment"); multi-day banners excluded (their far-future end
 * would hijack the pick — the #82 scar). Latest start at/before now wins.
 */
function mostRecentByTime(items: Item[], now: Date): Item | null {
	const t = now.getTime();
	const started = items.filter(
		(i) => !isMultiDay(i) && !!i.start_time && parseDateTime(i.start_time).getTime() <= t
	);
	if (started.length === 0) return null;
	return started
		.slice()
		.sort((a, b) => parseDateTime(b.start_time).getTime() - parseDateTime(a.start_time).getTime())[0];
}

export interface CurrentPhaseInput {
	/** Today's discrete (non-spanning) items. Order doesn't matter — sorted within. */
	todayItems: Item[];
	/** Trip-local moment (trip-local-as-UTC, see trip-time.ts `tripNow`). */
	now: Date;
	/**
	 * Discrete items on LATER days, earliest-first by `start_time`, for the
	 * transit transition rule (the arriving item may be on a later day). The
	 * caller supplies the forward window; an empty list disables cross-day lookup.
	 */
	forwardItems: Item[];
	/** The day's own phase id (`primaryPhaseForDay`) — the no-items fallback. '' if none. */
	fallbackPhaseId: string;
}

/**
 * Derive the current phase id for today. See module header for the rules. Returns
 * the fallback (the day's own phase) when no timed item can resolve it.
 */
export function currentPhaseId(input: CurrentPhaseInput): string {
	const { todayItems, now, forwardItems, fallbackPhaseId } = input;

	// 1 + 2: the live item is the active one, else the most-recent-by-time.
	const anchor = activeItem(todayItems, now) ?? mostRecentByTime(todayItems, now);

	// 4: nothing timed to anchor on → the day's own phase.
	if (!anchor) return fallbackPhaseId;

	// 3: transition rule. A transit item's phase is the *departing* context; the
	// live phase is where we're arriving — the next non-transit item travelled
	// toward, today or on a later day. Skip chained transit legs (a connecting
	// flight) to the first real destination.
	if (isTransit(anchor)) {
		const arriving = nextArrivingItem(anchor, todayItems, forwardItems, now);
		if (arriving) return arriving.phase;
		// No destination yet recorded (still en route, nothing booked beyond) —
		// fall back to the day's own phase rather than the departing transit phase.
		return fallbackPhaseId;
	}

	return anchor.phase;
}

/**
 * The next non-transit item we're travelling toward after `transit`, searching
 * today's later items first, then the forward (later-day) window. Chained transit
 * legs are skipped so a connecting flight resolves to the eventual destination.
 */
function nextArrivingItem(
	transit: Item,
	todayItems: Item[],
	forwardItems: Item[],
	now: Date
): Item | null {
	const transitStart = parseDateTime(transit.start_time).getTime();

	// Today's items strictly after the transit leg, earliest-first.
	const laterToday = todayItems
		.filter(
			(i) =>
				i.id !== transit.id &&
				!isMultiDay(i) &&
				!!i.start_time &&
				parseDateTime(i.start_time).getTime() >= transitStart
		)
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());

	// forwardItems are already later-day, earliest-first (caller contract), but
	// re-sort defensively so the merge is deterministic regardless of input order.
	const laterDays = forwardItems
		.filter((i) => !isMultiDay(i))
		.slice()
		.sort((a, b) => parseDateTime(a.start_time).getTime() - parseDateTime(b.start_time).getTime());

	for (const candidate of [...laterToday, ...laterDays]) {
		if (isTransit(candidate)) continue; // skip a connecting leg
		return candidate;
	}
	return null;
}
