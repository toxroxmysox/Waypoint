import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const placeId = url.searchParams.get('place_id');
	const sessionToken = url.searchParams.get('session_token');
	if (!placeId) return json({ error: 'Missing place_id' }, { status: 400 });

	const fields =
		'displayName,formattedAddress,location,id,websiteUri,internationalPhoneNumber';
	const params = new URLSearchParams({ sessionToken: sessionToken ?? '' });
	const res = await fetch(
		`https://places.googleapis.com/v1/places/${placeId}?${params}`,
		{
			headers: {
				'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY!,
				'X-Goog-FieldMask': fields
			}
		}
	);

	const data = await res.json();
	return json(data);
};
