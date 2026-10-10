// What a Record card shows (#436; spec stories 57/58, CARD_SYSTEM D2): the day page's
// rail and meta, read-only. Pure: layout is proven by `pnpm verify:visual`.
import { cardMeta } from '$lib/itinerary/card-anatomy';
import { formatDayDate } from '$lib/shell/format';
import type { ItemType } from '$lib/itinerary/types';

export interface RecordCardItem {
	type: ItemType;
	title: string;
	location_name?: string;
	description?: string;
	start_time?: string | null;
	end_time?: string | null;
	end_date?: string;
}

const dateOnly = (s: string | null | undefined) => (s ?? '').split(/[T ]/)[0];

/**
 * The rail times and the meta line for one record item on `dayDate`. A multi-day
 * item (an `end_date` after its day: lodging, a rental) keeps its start on the rail
 * and drops the later-day end (a range read backwards otherwise); its meta ends
 * `through Sat Oct 3`. A note's description is the body, so it has no meta.
 */
export function recordCardFields(
	item: RecordCardItem,
	dayDate: string
): { start_time: string; end_time: string; meta: string } {
	const day = dateOnly(dayDate);
	const through = dateOnly(item.end_date);
	const multiDay = !!through && !!day && through > day;
	const meta =
		item.type === 'note'
			? ''
			: [cardMeta(item), multiDay ? `through ${formatDayDate(through)}` : ''].filter(Boolean).join(' · ');
	return {
		start_time: item.start_time ?? '',
		end_time: multiDay ? '' : (item.end_time ?? ''),
		meta
	};
}
