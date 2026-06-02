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
		status: string;
		booked: boolean;
		confirmation_codes: Array<{ label: string; value: string }>;
		cost_estimate_usd: number;
		cost_actual_usd: number;
		reservation_url: string;
		notes: string;
	}>;
	budget: {
		categories: Array<{
			category: string;
			mode: string;
			daily_amount: number | null;
			total: number;
		}>;
	} | null;
}
