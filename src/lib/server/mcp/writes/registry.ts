// #503 / ADR-0025 — the can't-list made concrete. A connected AI writes with the
// user's own PB token, so PB rules + hooks are the permission gate (#411). This
// registry adds only what PB can't express: which collections and fields the AI
// may never touch, how friendly inputs (a date, a 24h time) map onto stored
// fields, the author fields the server fills, and the few form-only checks the
// invariant audit chose to keep here
// (docs/plans/2026-10-11-mcp-writes/invariant-audit.md).
//
// Every PB collection is either WRITABLE or BLOCKED; mcp-writes-registry.spec.ts
// fails when a new collection lands unclassified, so it forces a decision.
import type { Trip } from '$lib/types';
// Relative, not $lib: mcp-writes-registry.spec.ts imports this file under Playwright.
import { isValidTimeZone } from '../../../shell/trip-time';

export interface ValidateContext {
	action: 'create' | 'update';
	trip: Trip;
}

export interface WritableSpec {
	/** Plain words for describe, e.g. 'trip items (plans and ideas)'. */
	label: string;
	/** Relation path from a record to its trip id ('id' for trips itself). */
	tripPath: string;
	/** Fields the AI may set, with a short hint each, for describe. Informational: the gate is the blocklist + PB. */
	fields: Record<string, string>;
	/** Author fields the server fills on create (never the AI): 'user' = users id, 'member' = trip_members id. */
	stamp?: Record<string, 'user' | 'member'>;
	/** Relation field a friendly `date` (YYYY-MM-DD) resolves into, e.g. 'day'. */
	dayField?: string;
	/** Fields that accept 'HH:MM' (trip-local), stored on the record's day. */
	timeFields?: string[];
	/** Date fields that accept 'YYYY-MM-DD'. */
	dateFields?: string[];
	/** Items: a traveler's create routes through /api/suggestions/create, as in the app. */
	viaSuggestion?: true;
	/** No create through the connector (rows the app makes itself, or the trip). */
	updateOnly?: true;
	/** No update through the connector (PB has no update path). */
	createOnly?: true;
	/** Fields blocked for this collection only. */
	blockedFields?: string[];
	/** Form-only checks kept here by the audit. Returns a plain-words refusal or null. */
	validate?: (data: Record<string, unknown>, ctx: ValidateContext) => string | null;
}

const dated = (t: Trip) => !!t.start_date;
const negative = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Number(v) >= 0);

export const WRITABLE: Record<string, WritableSpec> = {
	trips: {
		label: 'the trip itself (title, dates, place, timezone, sharing)',
		tripPath: 'id',
		updateOnly: true,
		fields: {
			title: 'trip name',
			start_date: 'YYYY-MM-DD; with end_date. Changing dates re-tiles phases and adds/removes days',
			end_date: 'YYYY-MM-DD',
			timezone: 'IANA zone, e.g. Europe/Lisbon',
			location_summary: 'short place summary',
			notes: 'free-text trip notes',
			countries: 'list of country codes',
			photo_album_url: 'link to a shared album',
			auto_approve_suggestions: 'owners only: add traveler suggestions straight away',
			archived: 'owners only: lock the trip',
			archive_enabled: 'owners only: public archive link',
			archive_show_budget: 'owners only: show budget in the public archive',
			archive_publish_at: 'owners only: YYYY-MM-DD the archive goes public'
		},
		dateFields: ['start_date', 'end_date', 'archive_publish_at'],
		blockedFields: ['last_digest_at', 'digest_state', 'slug'],
		validate: (d) =>
			d.timezone !== undefined && d.timezone !== '' && !isValidTimeZone(String(d.timezone))
				? `"${d.timezone}" isn't a timezone I know. Use an IANA name like Europe/Lisbon.`
				: null
	},
	phases: {
		label: 'phases (the legs of a trip; they tile the dates)',
		tripPath: 'trip',
		fields: {
			name: 'phase name',
			location: 'where',
			country_code: 'two-letter country code',
			start_date: 'YYYY-MM-DD; a phase runs until the next one starts',
			notes: 'free-text notes for the phase'
		},
		dateFields: ['start_date'],
		blockedFields: ['end_date', 'order']
	},
	days: {
		label: 'day notes',
		tripPath: 'trip',
		updateOnly: true,
		fields: { notes: 'free-text notes for the day' },
		blockedFields: ['date', 'trip']
	},
	items: {
		label: 'trip items (plans and ideas: stays, travel, flights, activities, meals, notes)',
		tripPath: 'trip',
		viaSuggestion: true,
		stamp: { created_by: 'member' },
		dayField: 'day',
		timeFields: ['start_time', 'end_time'],
		dateFields: ['end_date'],
		fields: {
			type: 'lodging | transportation | flight | activity | meal | note | checklist',
			title: 'what it is',
			date: 'YYYY-MM-DD; places it on that day (omit for an idea)',
			phase: 'phase id (for an idea with no day)',
			start_time: 'HH:MM, trip-local',
			end_time: 'HH:MM, trip-local',
			end_date: 'YYYY-MM-DD, for multi-day stays',
			status: 'planned | done | considered | unplanned (closeout)',
			description: 'details',
			location_name: 'place name',
			location_address: 'address',
			booked: 'true when booked',
			booked_by: 'member id',
			paid_by: 'member id',
			confirmation_codes: 'list of {label, value}',
			reservation_url: 'booking link',
			free_cancellation: 'true/false',
			cost_estimate_usd: 'number',
			cost_actual_usd: 'number',
			assigned_to: 'member ids going',
			not_going: 'member ids not going (your own only)',
			requires_booking: 'true/false',
			flight_number: 'e.g. TP1234',
			subtype: 'free text, e.g. ferry',
			start_tz: 'IANA zone of the start (flights)',
			end_tz: 'IANA zone of the end (flights)',
			parent_item: 'item id this belongs to',
			sort_order: 'number'
		}
	},
	checklists: {
		label: 'lists (packing, to-do, booking)',
		tripPath: 'trip',
		fields: { title: 'list name', phase: 'phase id', item: 'item id', order: 'number' },
		blockedFields: ['kind']
	},
	tasks: {
		label: 'tasks on a list',
		tripPath: 'checklist.trip',
		fields: { checklist: 'list id', title: 'the task', checked: 'true when done', assignee: 'member id', order: 'number' }
	},
	checklist_items: {
		label: 'checklist lines on an item',
		tripPath: 'item.trip',
		fields: { item: 'item id', text: 'the line', checked_by: 'member id', checked_at: 'YYYY-MM-DD', order: 'number' },
		dateFields: ['checked_at']
	},
	expenses: {
		label: 'expenses',
		tripPath: 'trip',
		stamp: { created_by: 'member' },
		dateFields: ['date'],
		fields: {
			description: 'what it was',
			amount_usd: 'number, USD',
			date: 'YYYY-MM-DD',
			paid_by: 'member id',
			category: 'lodging | transportation | food | activity | other',
			split_mode: 'equal | by_amount',
			split_data: 'equal: {members: [ids]}; by_amount: {amounts: {memberId: number}} summing to amount_usd',
			linked_item: 'item id'
		}
	},
	settlements: {
		label: 'settle-up payments between members',
		tripPath: 'trip',
		stamp: { created_by: 'member' },
		dateFields: ['date'],
		fields: { from_member: 'member id', to_member: 'member id', amount_usd: 'number, USD', date: 'YYYY-MM-DD', note: 'text' }
	},
	trip_budgets: {
		label: 'the trip budget (owners)',
		tripPath: 'trip',
		fields: { categories: 'list of {category, mode: per_day | total, total}' }
	},
	money_units: {
		label: 'money groups (members who pool spending)',
		tripPath: 'trip',
		stamp: { created_by: 'member' },
		fields: { members: 'member ids', budget_usd: 'number, USD' },
		validate: (d) => (negative(d.budget_usd) ? 'A group budget must be a positive number.' : null)
	},
	votes: {
		label: "the user's own vote on an item (only one they state)",
		tripPath: 'trip',
		stamp: { member: 'member' },
		fields: { item: 'item id', value: 'love | like | flexible | dislike' }
	},
	trip_goals: {
		label: 'trip goals',
		tripPath: 'trip',
		stamp: { created_by: 'member' },
		fields: {
			title: 'the goal',
			description: 'details',
			manual_status: 'unplanned | planned | done | considered',
			items: 'item ids that serve it',
			prompt: 'short prompt label',
			sort_order: 'number'
		}
	},
	goal_votes: {
		label: "the user's own vote on a goal (only one they state)",
		tripPath: 'goal.trip',
		stamp: { member: 'member' },
		fields: { goal: 'goal id', value: 'love | like | flexible | dislike' }
	},
	scenarios: {
		label: 'scenarios (pitches for a trip that has no dates yet)',
		tripPath: 'trip',
		stamp: { champion: 'member' },
		dateFields: ['date_start', 'date_end'],
		fields: {
			title: 'up to 120 characters',
			pitch: 'up to 200 characters',
			date_start: 'YYYY-MM-DD',
			date_end: 'YYYY-MM-DD',
			budget_per_person: 'number, USD',
			phase_sketch: 'list of {name, nights}',
			keystones: 'item ids',
			fork_of: 'scenario id'
		},
		blockedFields: ['status'],
		validate: (d, { action, trip }) => {
			if (action === 'create' && dated(trip)) return 'This trip already has dates, so scenarios are closed.';
			const s = d.date_start ? String(d.date_start) : '';
			const e = d.date_end ? String(d.date_end) : '';
			if (('date_start' in d || 'date_end' in d) && !!s !== !!e) return 'Give a scenario both dates, or neither.';
			if (s && e && s.slice(0, 10) > e.slice(0, 10)) return 'The scenario ends before it starts.';
			if (negative(d.budget_per_person)) return 'A budget must be a positive number.';
			return null;
		}
	},
	scenario_votes: {
		label: "the user's own vote on a scenario (only one they state)",
		tripPath: 'scenario.trip',
		stamp: { member: 'member' },
		fields: { scenario: 'scenario id', value: 'love | like | flexible | dislike' }
	},
	scenario_points: {
		label: 'pros and cons on a scenario',
		tripPath: 'scenario.trip',
		stamp: { member: 'member' },
		createOnly: true,
		fields: { scenario: 'scenario id', kind: 'pro | con', text: 'up to 200 characters' }
	},
	availability: {
		label: "the user's own availability on a dateless trip's poll",
		tripPath: 'trip',
		stamp: { member: 'member' },
		dateFields: ['day'],
		fields: { day: 'YYYY-MM-DD', value: 'available | maybe' },
		validate: (_d, { trip }) => (dated(trip) ? 'This trip already has dates, so the availability poll is closed.' : null)
	},
	suggestion_votes: {
		label: "the user's own vote on a suggestion (only one they state)",
		tripPath: 'suggestion.trip',
		stamp: { member: 'member' },
		fields: { suggestion: 'suggestion id', value: 'love | like | flexible | dislike' }
	},
	memories: {
		label: "the user's own memory thought for a day (no photos)",
		tripPath: 'trip',
		stamp: { author: 'member' },
		dayField: 'day',
		fields: { date: 'YYYY-MM-DD; the day it belongs to', thought: 'up to 280 characters' }
	},
	documents: {
		label: 'confirmation codes and booking references (no file uploads)',
		tripPath: 'trip',
		createOnly: true,
		stamp: { uploaded_by: 'member' },
		fields: { kind: 'code', code_label: 'e.g. Hotel booking ref', code_value: 'the code', caption: 'note', item: 'item id' },
		validate: (d) => (d.kind !== 'code' ? "I can't upload files yet; I can save a code (kind: code)." : null)
	}
};

/** Collections the connector never writes (ADR-0025 §1, plus server-only rows). */
export const BLOCKED_COLLECTIONS: readonly string[] = [
	'trip_members',
	'pending_invites',
	'join_tokens',
	'users',
	'mcp_connections',
	'mcp_tokens',
	'ai_changes',
	'notifications',
	'vault_entries',
	// Created/approved only through the app's suggestion routes; a traveler's
	// item add is routed there by the write layer (WritableSpec.viaSuggestion).
	'suggestions',
	// Written only by /api/scenarios/promote.
	'decisions'
];

/** Fields the connector never writes on any collection (ADR-0025 §1). */
export const BLOCKED_FIELDS: readonly string[] = [
	'email',
	'placeholder_email',
	'soft_token',
	'token',
	'public_share_token',
	'ai_access',
	'ai_write',
	'created_by',
	'uploaded_by',
	'invited_by',
	'author',
	'champion',
	'member',
	'hash',
	'photo',
	'file',
	'avatar',
	'cover_image',
	'id',
	'created',
	'updated'
];

const REASONS: Record<string, string> = {
	trip_members: "I can't change a trip's members.",
	pending_invites: "I can't send or change invitations.",
	join_tokens: "I can't make or change join links.",
	users: "I can't change anyone's account.",
	email: "I can't read or write email addresses.",
	placeholder_email: "I can't read or write email addresses.",
	ai_access: "I can't change AI settings. The trip's owner can, in trip settings.",
	ai_write: "I can't change AI settings. The trip's owner can, in trip settings.",
	photo: "I can't upload photos or files yet.",
	file: "I can't upload photos or files yet.",
	avatar: "I can't upload photos or files yet.",
	cover_image: "I can't upload photos or files yet."
};

const AUTHOR = new Set(['created_by', 'uploaded_by', 'invited_by', 'author', 'champion', 'member']);

/** Plain-words refusal for a collection (and optionally one of its fields), or null when allowed. */
export function blockedReason(collection: string, field?: string): string | null {
	if (REASONS[collection] && BLOCKED_COLLECTIONS.includes(collection)) return REASONS[collection];
	if (BLOCKED_COLLECTIONS.includes(collection) || !WRITABLE[collection]) {
		return `I can't change ${collection.replace(/_/g, ' ')} records.`;
	}
	if (field === undefined) return null;
	if (REASONS[field] && BLOCKED_FIELDS.includes(field)) return REASONS[field];
	if (AUTHOR.has(field)) return `Who made something is set by Waypoint; I can't change ${field.replace(/_/g, ' ')}.`;
	if (BLOCKED_FIELDS.includes(field) || WRITABLE[collection].blockedFields?.includes(field)) {
		return `I can't change ${field.replace(/_/g, ' ')} on ${collection.replace(/_/g, ' ')}.`;
	}
	return null;
}
