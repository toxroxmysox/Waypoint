import type { RecordModel } from 'pocketbase';

export interface User extends RecordModel {
	email: string;
	name: string;
	avatar: string;
}

export interface Trip extends RecordModel {
	slug: string;
	title: string;
	start_date: string;
	end_date: string;
	timezone: string;
	location_summary: string;
	countries: string[];
	cover_image: string;
	photo_album_url: string;
	archive_enabled: boolean;
	archive_publish_after_days: number;
	public_share_token: string;
	auto_approve_suggestions: boolean;
	created_by: string;
	archived: boolean;
}

export type MemberRole = 'owner' | 'co_owner' | 'traveler' | 'viewer';

export interface TripMember extends RecordModel {
	trip: string;
	user: string;
	placeholder_name: string;
	placeholder_email: string;
	display_name: string;
	role: MemberRole;
	joined_at: string;
}

export interface Phase extends RecordModel {
	trip: string;
	name: string;
	location: string;
	country_code: string;
	start_date: string;
	end_date: string;
	color: string;
	order: number;
}

export interface Day extends RecordModel {
	trip: string;
	phases: string[];
	date: string;
	notes: string;
}

export type ItemType = 'lodging' | 'transportation' | 'activity' | 'meal' | 'note' | 'checklist';
export type Slot = 'morning' | 'afternoon' | 'evening' | 'anytime';
export type ItemStatus = 'planned' | 'done';
export type ParkingLotScope = 'none' | 'trip' | 'phase' | 'day';

export interface ConfirmationCode {
	label: string;
	value: string;
}

export interface Item extends RecordModel {
	trip: string;
	phase: string;
	day: string;
	slot: Slot;
	type: ItemType;
	subtype: string;
	title: string;
	description: string;
	location_name: string;
	location_address: string;
	location_coords: { lat: number; lng: number } | null;
	google_place_id: string;
	start_time: string;
	end_time: string;
	start_tz: string;
	end_tz: string;
	status: ItemStatus;
	booked: boolean;
	booked_by: string;
	paid_by: string;
	confirmation_codes: ConfirmationCode[];
	reservation_url: string;
	free_cancellation: boolean;
	cost_estimate_usd: number;
	cost_actual_usd: number;
	assigned_to: string[];
	rank: number;
	parking_lot_scope: ParkingLotScope;
	parent_item: string;
	created_by: string;
}

export interface ChecklistItem extends RecordModel {
	item: string;
	text: string;
	checked_by: string;
	checked_at: string;
	order: number;
}
