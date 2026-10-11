import type { Item, ItemType } from '$lib/types';

// The Booking Smart List is a derived projection, never stored (ADR-0003 / PRD §4):
// one synthetic row per Item that is planned, requires booking, and isn't booked
// yet. Checking a row writes `booked = true` to the Item, which drops it from the
// projection. Kept as a pure predicate so it's unit-testable and reused by both
// the smart-list route and the index "N left" count.

// Item types pre-filled `requires_booking = true` by the 0030 migration.
export const BOOKABLE_TYPES: ItemType[] = ['lodging', 'flight', 'transportation'];

export function defaultRequiresBooking(type: ItemType): boolean {
	return BOOKABLE_TYPES.includes(type);
}

type BookingFields = Pick<Item, 'status' | 'requires_booking' | 'booked'>;

export function needsBooking(item: BookingFields): boolean {
	return item.status === 'planned' && item.requires_booking === true && item.booked !== true;
}

export function bookingProjection<T extends BookingFields>(items: T[]): T[] {
	return items.filter(needsBooking);
}

export interface BookingWords {
	/** Spoken/state form: `Needs booking`. */
	needs: string;
	/** The gold chip's visible text: `To book`. */
	chip: string;
	/** The Hero's link-out: `Book`. */
	book: string;
	/** The confirm action and its sheet title: `Mark booked`. */
	mark: string;
	/** The done state: `Booked`. */
	done: string;
}

const BOOK_WORDS: BookingWords = { needs: 'Needs booking', chip: 'To book', book: 'Book', mark: 'Mark booked', done: 'Booked' };
const RESERVE_WORDS: BookingWords = {
	needs: 'Needs reservation',
	chip: 'To reserve',
	book: 'Reserve',
	mark: 'Mark reserved',
	done: 'Reserved'
};

/**
 * #462 — a meal is reserved, not booked. Same `requires_booking` / `booked` flags and
 * the same flow; only the words change. Aggregates over mixed types ("3 to book") keep
 * the booking words.
 */
export function bookingWords(type: string | undefined): BookingWords {
	return type === 'meal' ? RESERVE_WORDS : BOOK_WORDS;
}
