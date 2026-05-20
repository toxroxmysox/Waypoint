import { json, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const flightNumber = url.searchParams.get('flight');
	const date = url.searchParams.get('date');
	if (!flightNumber || !date) {
		return json({ error: 'Missing flight or date' }, { status: 400 });
	}

	const res = await fetch(
		`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`,
		{
			headers: {
				'X-RapidAPI-Key': env.AERODATABOX_API_KEY!,
				'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
			}
		}
	);

	if (!res.ok) return json({ error: 'Flight not found' }, { status: 404 });
	const data = await res.json();
	return json(data);
};
