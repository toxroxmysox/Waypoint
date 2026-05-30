import type { ItemType, ConfirmationCode, Day, Phase, TripMember } from '$lib/types';

export type ItemFormMode = 'create' | 'edit' | 'view';

export interface ItemFormData {
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	day: string;
	slot: string;
	phase: string;
	start_time: string;
	end_time: string;
	location_name: string;
	location_address: string;
	location_coords: unknown;
	google_place_id: string;
	booked: boolean;
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
	preselectedSlot?: string;
	preselectedPhase?: string;
}

export const emptyItemFormData: ItemFormData = {
	type: 'activity',
	subtype: '',
	title: '',
	description: '',
	day: '',
	slot: 'anytime',
	phase: '',
	start_time: '',
	end_time: '',
	location_name: '',
	location_address: '',
	location_coords: null,
	google_place_id: '',
	booked: false,
	reservation_url: '',
	free_cancellation: false,
	cost_estimate_usd: 0,
	cost_actual_usd: 0,
	confirmation_codes: [],
	assigned_to: [],
	status: 'planned'
};
