import type { ItemType, ConfirmationCode, Day, Phase, TripMember } from '$lib/types';

export type ItemFormMode = 'create' | 'edit' | 'view';

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
}

export interface ItemFormContext {
	days: Day[];
	phases: Phase[];
	members: TripMember[];
	preselectedDay?: string;
	preselectedPhase?: string;
	tripStartDate: string;
	tripEndDate: string;
}

