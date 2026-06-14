export interface TripExport {
	_waypoint_version: 1;
	exported_at: string;
	trip: {
		title: string;
		slug: string;
		start_date: string;
		end_date: string;
		timezone: string;
		location_summary: string;
		countries: string[];
		photo_album_url: string;
		archive_enabled: boolean;
		archive_publish_after_days: number;
		auto_approve_suggestions: boolean;
	};
	phases: Array<{
		name: string;
		location: string;
		country_code: string;
		start_date: string;
		end_date: string;
		order: number;
	}>;
	days: Array<{
		date: string;
		notes: string;
		phase_names: string[];
	}>;
	items: Array<{
		day_date: string | null;
		phase_name: string | null;
		type: string;
		subtype: string;
		title: string;
		description: string;
		location_name: string;
		location_address: string;
		location_coords: { lat: number; lng: number } | null;
		google_place_id: string;
		start_time: string | null;
		end_time: string | null;
		start_tz: string;
		end_tz: string;
		end_date: string | null;
		status: string;
		booked: boolean;
		requires_booking: boolean;
		confirmation_codes: Array<{ label: string; value: string }>;
		cost_estimate_usd: number;
		cost_actual_usd: number;
		reservation_url: string;
		notes: string;
	}>;
	// Trip/phase-scoped manual checklists (ADR-0003 §7). `assignee` is stripped
	// on export — trip-scoped member ids won't resolve on import.
	checklists: Array<{
		title: string;
		phase_name: string | null;
		tasks: Array<{ title: string; checked: boolean }>;
	}>;
	budget: {
		categories: Array<{
			category: string;
			mode: string;
			daily_amount: number | null;
			total: number;
		}>;
	} | null;
	// ── Snapshot-only sections (see EXPORT COVERAGE in export.ts) ─────────────
	// Captured so a kept export is a true record (money ledger + group input),
	// but NOT restored on import: every row below keys members by id, and a
	// single-owner re-import can't reconstruct the roster to re-link them.
	// `member_ref` values point at `members[].ref`; a human key, not PII.
	members: Array<{
		ref: string;
		display_name: string;
		role: string;
	}>;
	expenses: Array<{
		paid_by_ref: string;
		amount_usd: number;
		description: string;
		date: string;
		category: string;
		split_mode: string;
		split_data: unknown;
	}>;
	settlements: Array<{
		from_member_ref: string;
		to_member_ref: string;
		amount_usd: number;
		date: string;
		note: string;
	}>;
	goals: Array<{
		title: string;
		description: string;
		status: string;
		sort_order: number;
		created_by_ref: string;
		votes: Array<{ member_ref: string; value: string }>;
	}>;
}
