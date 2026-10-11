// #503 / ADR-0025 — the shapes the write layer passes between propose, commit
// and revert. Ops are what the AI sends; PlannedChanges are what the server will
// actually write, normalised and checked, with the before-values a commit
// re-checks for staleness and a revert restores.

export type WriteOp =
	| { action: 'create'; collection: string; ref?: string; data: Record<string, unknown> }
	| { action: 'update'; collection: string; id: string; data: Record<string, unknown> };

/** Saved / Sent to the owners as a suggestion / Added as an idea. */
export type Outcome = 'saved' | 'suggested' | 'idea';

export interface PlannedChange {
	action: 'create' | 'update';
	collection: string;
	/** Update target, or a pre-generated 15-char PB id for a create. */
	id: string;
	via: 'record' | 'suggestion';
	/** Only the touched fields; null for a create. */
	before: Record<string, unknown> | null;
	/** Normalised values that will be written. */
	after: Record<string, unknown>;
	outcome: Outcome;
	/** Record title/name for the card. */
	title: string;
}

/** What a trip-date or phase change does to the rest of the trip (Task 7). */
export interface Cascade {
	tripBefore: [string, string] | null;
	tripAfter: [string, string] | null;
	daysAdded: string[];
	daysRemoved: string[];
	phases: { name: string; before: [string, string] | null; after: [string, string] | null }[];
	/** Items/ideas re-homed, by phase name. */
	moves: { title: string; from: string; to: string }[];
}

export interface Proposal {
	id: string;
	userId: string;
	connectionId: string;
	tripId: string;
	quote: string;
	changes: PlannedChange[];
	cascade: Cascade | null;
	expiresAt: number;
	committedChangeId?: string;
	/** Set synchronously when a commit starts, so an overlapping second commit can't run (review I3). */
	committing?: boolean;
}

export type CommittedChange = PlannedChange & { committed: boolean; suggestionId?: string };
