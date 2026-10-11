// Pure derivations behind the Hero (#428; CARD_SYSTEM D10/D11). No DOM, no I/O.
import { formatClock, formatCountdown } from '$lib/shell/format';
import { memberDisplayName } from '$lib/itinerary/member-name';
import type { TripMember } from '$lib/types';
import type { MapsApp } from '$lib/shell/types';

function wall(t: string | undefined): number {
	return t ? new Date(t.replace(' ', 'T')).getTime() : NaN;
}

export interface HeroStatus {
	label: 'NOW';
	/** `until 4:00p · 55m left`, or `since 1:00p` for a start-only item */
	text: string;
}

/**
 * The live line: `NOW` + `until 4:00p · 55m left` for a range, `since 1:00p` for a
 * start-only item (#431: no end to count to). `now` is a trip-local-as-UTC Date
 * (trip-time `tripNow`), the same frame item times are stored in. Null for a
 * range outside [start, end) (the end is exclusive: an item that ends this
 * minute is already over), a start-only item before its start, and a deadline
 * (end-only), which is never live.
 */
export function heroStatus(
	item: { start_time?: string; end_time?: string },
	now: Date
): HeroStatus | null {
	const s = wall(item.start_time);
	const e = wall(item.end_time);
	const t = now.getTime();
	if (Number.isNaN(s) || t < s) return null;
	if (Number.isNaN(e)) return { label: 'NOW', text: `since ${formatClock(item.start_time!)}` };
	if (t >= e) return null;
	const left = formatCountdown(Math.round((e - t) / 60000));
	return { label: 'NOW', text: `until ${formatClock(item.end_time!)} · ${left} left` };
}

export interface GoingPerson {
	memberId: string;
	name: string;
	/** Said they're not going (struck). */
	notGoing: boolean;
}

/**
 * Everyone who answered (#440), by name: the going ones in `assigned_to` order, then
 * the not-going ones in `not_going` order. No answer is in neither list, so never
 * appears. Departed and unknown ids drop.
 */
export function goingPeople(
	item: { assigned_to?: string[] | null; not_going?: string[] | null },
	members: Array<Pick<TripMember, 'id'> & Partial<TripMember>>
): GoingPerson[] {
	const out: GoingPerson[] = [];
	const add = (ids: string[] | null | undefined, notGoing: boolean) => {
		for (const id of ids ?? []) {
			const m = members.find((mm) => mm.id === id);
			if (!m || m.removed_at) continue;
			out.push({ memberId: id, name: memberDisplayName(m as TripMember), notGoing });
		}
	};
	add(item.assigned_to, false);
	add(item.not_going, true);
	return out;
}

/**
 * Maps universal link in the user's #510 maps app (Google when unset). Google:
 * place id, else coords, else address, else name. Apple has no Google place ids:
 * coords (labelled with the name) else address/name. '' when there is nothing
 * to search. Opens the Maps app on iOS (embedded maps are off the table).
 */
export function mapsUrl(
	item: {
		google_place_id?: string;
		location_name?: string;
		location_address?: string;
		location_coords?: { lat: number; lng: number } | null;
	},
	app?: MapsApp | ''
): string {
	const c = item.location_coords;
	const hasCoords = !!c && typeof c.lat === 'number' && typeof c.lng === 'number';
	const text = item.location_address || item.location_name;
	if (app === 'apple') {
		const label = item.location_name || item.location_address;
		if (hasCoords) return `https://maps.apple.com/?ll=${c!.lat},${c!.lng}` + (label ? `&q=${encodeURIComponent(label)}` : '');
		return text ? `https://maps.apple.com/?q=${encodeURIComponent(text)}` : '';
	}
	const base = 'https://www.google.com/maps/search/?api=1&query=';
	if (item.google_place_id) {
		const q = encodeURIComponent(item.location_name || item.location_address || item.google_place_id);
		return `${base}${q}&query_place_id=${encodeURIComponent(item.google_place_id)}`;
	}
	if (hasCoords) return `${base}${c!.lat},${c!.lng}`;
	return text ? base + encodeURIComponent(text) : '';
}
