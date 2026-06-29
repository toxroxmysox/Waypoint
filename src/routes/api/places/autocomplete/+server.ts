import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { checkRateLimit } from '$lib/server/rate-limit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	// Per-user cost-DoS throttle (#285): 120 req/min, burst 240. Stays UNCACHED
	// (query-varying); Google session tokens + this bucket are the cost guard.
	if (!checkRateLimit('places-autocomplete', locals.user.id)) {
		error(429, 'Too many requests');
	}
	if (!env.GOOGLE_MAPS_API_KEY) {
		error(503, 'Places service unavailable');
	}

	const input = url.searchParams.get('input');
	const sessionToken = url.searchParams.get('session_token');
	if (!input) return json({ suggestions: [] });

	const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY
		},
		body: JSON.stringify({
			input,
			sessionToken
		})
	});

	const data = await res.json();
	return json(data);
};
