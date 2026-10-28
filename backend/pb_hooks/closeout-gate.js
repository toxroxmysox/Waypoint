'use strict';

// #576 — shared by items.pb.js's create + update hooks. A plain CommonJS module
// (NOT *.pb.js, so PB doesn't load it as hooks); hooks require it INSIDE each
// callback — goja isolation hides file-scope helpers (see digest.pb.js).

// Every item field a non-owner may never change (the traveler self-assign
// exception) — the single list; the closeout exception derives from it.
const lockedFields = [
	'trip',
	'phase',
	'day',
	'type',
	'subtype',
	'title',
	'description',
	'location_name',
	'location_address',
	'location_coords',
	'google_place_id',
	'start_time',
	'end_time',
	'start_tz',
	'end_tz',
	'flight_number',
	'end_date',
	'status',
	'booked',
	'booked_by',
	'paid_by',
	'confirmation_codes',
	'reservation_url',
	'free_cancellation',
	'cost_estimate_usd',
	'cost_actual_usd',
	'sort_order',
	'parent_item',
	'requires_booking',
	'created_by'
];

// Has the trip ended? Mirrors trip-lifecycle.ts: closed (archived) or wrap-up
// (today > end_date in the trip's timezone). goja has no Intl, so the trip-local
// date is digest-core.js's tripLocalDate. Empty dates read via getString (an
// empty date field is a truthy object); no start_date = forming, no end_date =
// planning -> not ended. Fail closed: any error -> not ended.
function tripEnded(app, tripId) {
	try {
		const trip = app.findRecordById('trips', tripId);
		if (trip.getBool('archived')) return true;
		if (!trip.getString('start_date') || !trip.getString('end_date')) return false;
		const tz = ('' + trip.getString('timezone')).trim();
		const usable = tz === 'UTC' || (tz.indexOf('/') > 0 && tz.toLowerCase() !== 'local');
		const nowT = new DateTime().time();
		let today;
		if (!usable) {
			today = nowT.format('2006-01-02');
		} else {
			try {
				today = nowT.in(new Timezone(tz)).format('2006-01-02');
			} catch (_) {
				today = nowT.format('2006-01-02');
			}
		}
		return today > trip.getString('end_date').split(/[T ]/)[0];
	} catch (_) {
		return false;
	}
}

module.exports = { lockedFields: lockedFields, tripEnded: tripEnded };
