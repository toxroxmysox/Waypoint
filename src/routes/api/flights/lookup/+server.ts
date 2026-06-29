import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { checkRateLimit, flightLookupCache } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	// Per-user cost-DoS throttle (#285): 120 req/min, burst 240.
	if (!checkRateLimit('flights-lookup', locals.user.id)) {
		error(429, 'Too many requests');
	}
	if (!env.AERODATABOX_API_KEY) {
		error(503, 'Flight lookup service unavailable');
	}

	const flightNumber = url.searchParams.get('flight');
	const date = url.searchParams.get('date');
	if (!flightNumber || !date) {
		return json({ error: 'Missing flight or date' }, { status: 400 });
	}

	// Cache (#285): keyed by flight-number + date, TTL ~6h. A repeat lookup
	// within TTL is served without a second upstream call.
	const cacheKey = `${flightNumber}|${date}`;
	const cached = flightLookupCache.get(cacheKey);
	if (cached !== undefined) return json(cached);

	const res = await fetch(
		`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`,
		{
			headers: {
				'X-RapidAPI-Key': env.AERODATABOX_API_KEY,
				'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
			}
		}
	);

	if (!res.ok) return json({ error: 'Flight not found' }, { status: 404 });
	const data = await res.json();
	flightLookupCache.set(cacheKey, data);
	return json(data);
};
