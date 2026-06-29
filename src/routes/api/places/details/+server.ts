import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { checkRateLimit, placeDetailsCache } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	// Per-user cost-DoS throttle (#285): 120 req/min, burst 240.
	if (!checkRateLimit('places-details', locals.user.id)) {
		error(429, 'Too many requests');
	}
	if (!env.GOOGLE_MAPS_API_KEY) {
		error(503, 'Places service unavailable');
	}

	const placeId = url.searchParams.get('place_id');
	const sessionToken = url.searchParams.get('session_token');
	if (!placeId) return json({ error: 'Missing place_id' }, { status: 400 });

	// Cache (#285): place details are stable, keyed by place_id, TTL ~30 days.
	// A repeat lookup within TTL is served without a second upstream call.
	const cached = placeDetailsCache.get(placeId);
	if (cached !== undefined) return json(cached);

	const fields =
		'displayName,formattedAddress,location,id,websiteUri,internationalPhoneNumber';
	const res = await fetch(
		`https://places.googleapis.com/v1/places/${placeId}`,
		{
			headers: {
				'Content-Type': 'application/json',
				'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
				'X-Goog-FieldMask': fields,
				...(sessionToken ? { 'X-Goog-Session-Token': sessionToken } : {})
			}
		}
	);

	const data = await res.json();
	// Only cache successful upstream responses; don't memoize errors/4xx.
	if (res.ok) placeDetailsCache.set(placeId, data);
	return json(data);
};
