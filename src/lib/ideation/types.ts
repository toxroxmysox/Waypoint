// #337 (Candidate Scenarios / Ideation) — the scenario domain types.
// See docs/superpowers/specs/2026-07-03-scenario-building-design.md.
import type { VoteValue, TripMember } from '../collaboration/types';
import type { Item } from '../itinerary/types';

export type ScenarioStatus = 'candidate' | 'won' | 'archived';

/** One segment of a phase sketch: a named leg with a whole-day duration. Durations,
 *  NOT real phase records — forming trips have no days yet (spec §Data model). */
export interface PhaseSketchSegment {
	name: string;
	days: number;
}

/** A pitch for what a forming trip could be. Champion-authored, forkable. */
export interface Scenario {
	id: string;
	trip: string;
	title: string;
	pitch: string;
	champion: string; // trip_members id
	date_start: string; // '' when unset
	date_end: string; // '' when unset
	// ⚠ PB numbers can't be null — unset stores as 0. Treat 0/falsy as "no budget"
	// everywhere (the #332/#335 scar); never render "$0".
	budget_per_person: number;
	phase_sketch: PhaseSketchSegment[]; // [] when unset
	keystones: string[]; // items ids
	fork_of: string; // '' when not a fork
	status: ScenarioStatus;
	created: string;
	updated: string;
	expand?: {
		champion?: TripMember;
		keystones?: Item[];
		fork_of?: Scenario;
	};
}

/** A vote on a scenario. Parallels Vote/GoalVote (ADR-0004 separate collection).
 *  No `trip` field — trip is reachable via `scenario`. Shares VoteValue +
 *  voting.ts scoring/grouping. */
export interface ScenarioVote {
	id: string;
	scenario: string;
	member: string;
	value: VoteValue;
	created: string;
}

export type ScenarioPointKind = 'pro' | 'con';

/** A pro or con on a scenario — a one-line, comment-like entry. Author-deletable. */
export interface ScenarioPoint {
	id: string;
	scenario: string;
	member: string;
	kind: ScenarioPointKind;
	text: string;
	created: string;
	expand?: { member?: TripMember };
}

/** The immutable snapshot minted at promotion. "How we decided" reads this
 *  forever. Written by the cascade hook only (never client-written). */
export interface Decision {
	id: string;
	trip: string;
	payload: DecisionPayload;
	created: string;
}

/** The frozen snapshot: every scenario (incl. sketch + keystone labels), vote
 *  tallies, pros/cons, chooser, and date at the moment of the decision. */
export interface DecisionPayload {
	chosen_scenario: string;
	chosen_title: string;
	chooser: string; // trip_members id
	chooser_name: string;
	decided_at: string; // ISO
	date_start: string;
	date_end: string;
	budget_per_person: number;
	scenarios: DecisionScenarioSnapshot[];
}

export interface DecisionScenarioSnapshot {
	id: string;
	title: string;
	pitch: string;
	champion_name: string;
	date_start: string;
	date_end: string;
	budget_per_person: number;
	phase_sketch: PhaseSketchSegment[];
	keystone_labels: string[];
	votes: Record<VoteValue, number>;
	pros: string[];
	cons: string[];
	won: boolean;
}
