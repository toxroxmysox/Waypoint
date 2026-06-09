import type { ItemType, ConfirmationCode, Day, Phase, TripMember } from '$lib/types';

export type ItemFormMode = 'create' | 'edit' | 'view';

// #78 — a goal this item can be linked to (the "Addresses goal(s)" multi-select).
// The link is stored goal-side; the form just collects the selected goal ids.
export interface GoalOption {
	id: string;
	title: string;
}

export interface ItemFormData {
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	day: string;
	phase: string;
	start_time: string;
	end_time: string;
	end_date: string;
	location_name: string;
	location_address: string;
	location_coords: unknown;
	google_place_id: string;
	booked: boolean;
	requires_booking: boolean;
	reservation_url: string;
	free_cancellation: boolean;
	cost_estimate_usd: number;
	cost_actual_usd: number;
	confirmation_codes: ConfirmationCode[];
	assigned_to: string[];
	status: string;
	linked_goal_ids: string[];
}

export interface ItemFormContext {
	days: Day[];
	phases: Phase[];
	members: TripMember[];
	goals?: GoalOption[];
	preselectedDay?: string;
	preselectedPhase?: string;
	tripStartDate: string;
	tripEndDate: string;
}

