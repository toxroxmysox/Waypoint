import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json().catch(() => ({})) as { ids?: string[]; all?: boolean };
	const BASE = locals.pb.baseUrl;
	const token = locals.pb.authStore.token;

	const res = await fetch(`${BASE}/api/notifications/mark-read`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify(body)
	});

	if (!res.ok) {
		const err = (await res.json().catch(() => ({}))) as { message?: string };
		error(res.status, err.message || 'Failed');
	}

	return json({ ok: true });
};
