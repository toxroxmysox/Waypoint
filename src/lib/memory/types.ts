// Trip Memory bounded context (#269 / ADR-0007) — a Memory is NOT a Document.
// One photo + one thought, per member, per day; the unique (day, author) index
// is the cap that defines the domain.

export interface Memory {
	id: string;
	trip: string;
	day: string;
	/** trip_members.id — the capturing member. Author-only edit/delete. */
	author: string;
	/** Stored filename ('' = no photo). Protected file — always proxy, never a bare PB URL. */
	photo: string;
	/** Max 280 chars ('' = no thought). */
	thought: string;
	created: string;
	updated: string;
}
