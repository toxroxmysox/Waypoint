import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}
	if (!env.GOOGLE_MAPS_API_KEY) {
		error(503, 'Places service unavailable');
	}

	const placeId = url.searchParams.get('place_id');
	const sessionToken = url.searchParams.get('session_token');
	if (!placeId) return json({ error: 'Missing place_id' }, { status: 400 });

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
	return json(data);
};
