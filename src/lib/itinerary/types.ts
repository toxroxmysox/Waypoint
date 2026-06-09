import type { RecordModel } from 'pocketbase';

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

export interface Phase extends RecordModel {
	trip: string;
	name: string;
	location: string;
	country_code: string;
	start_date: string;
	end_date: string;
	order: number;
}

export interface Day extends RecordModel {
	trip: string;
	phases: string[];
	date: string;
	notes: string;
}

export type ItemType = 'lodging' | 'transportation' | 'activity' | 'meal' | 'note' | 'checklist' | 'flight';
export type ItemStatus = 'planned' | 'done' | 'considered' | 'unplanned';

export interface ConfirmationCode {
	label: string;
	value: string;
}

export interface Item extends RecordModel {
	trip: string;
	phase: string;
	day: string;
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
	end_date: string;
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
	sort_order: number;
	parent_item: string;
	requires_booking: boolean;
	created_by: string;
}

export interface ChecklistItem extends RecordModel {
	item: string;
	text: string;
	checked_by: string;
	checked_at: string;
	order: number;
}

// ADR-0003 — standalone primitive. Attachment level is derived, never stored:
// item set → item-level; else phase set → phase-level; else trip-level.
export type ChecklistKind = 'manual' | 'booking';

export interface Checklist extends RecordModel {
	trip: string;
	phase: string;
	item: string;
	title: string;
	kind: ChecklistKind;
	order: number;
}

export interface Task extends RecordModel {
	checklist: string;
	title: string;
	checked: boolean;
	assignee: string;
	order: number;
}
