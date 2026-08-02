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

	// #340: never launder an upstream failure into a 200. Google's error body
	// echoes the request and hints at API-key/quota state, so it stays
	// server-side — the client gets a status and a generic message.
	if (!res.ok) {
		console.error(
			'[places/autocomplete] upstream failed:',
			res.status,
			(await res.text()).slice(0, 200)
		);
		error(res.status === 429 ? 429 : 502, 'Place search unavailable');
	}

	const data = await res.json();
	// Shape to exactly what PlacesAutocomplete.svelte consumes — no raw
	// upstream passthrough.
	const suggestions = (Array.isArray(data?.suggestions) ? data.suggestions : [])
		.filter((s: unknown) => (s as { placePrediction?: unknown })?.placePrediction)
		.map((s: { placePrediction: { placeId?: string; text?: { text?: string } } }) => ({
			placePrediction: {
				placeId: s.placePrediction.placeId ?? '',
				text: { text: s.placePrediction.text?.text ?? '' }
			}
		}));
	return json({ suggestions });
};
