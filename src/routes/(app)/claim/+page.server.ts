import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_PB_URL } from '$env/static/public';

export interface Claim {
	member_id: string;
	trip_id: string;
	trip_slug: string;
	trip_title: string;
	placeholder_name: string;
	role: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	const token = locals.pb.authStore.token;

	const res = await fetch(`${PUBLIC_PB_URL}/api/members/my-claims`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) {
		redirect(303, '/trips');
	}

	const { claims } = (await res.json()) as { claims: Claim[] };

	if (!claims || claims.length === 0) {
		// No placeholder claims — check for pending email invites.
		const invRes = await fetch(`${PUBLIC_PB_URL}/api/invites/my-pending`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (invRes.ok) {
			const { invites } = (await invRes.json()) as { invites: { code: string }[] };
			if (invites && invites.length > 0) {
				redirect(303, `/invite/${invites[0].code}`);
			}
		}
		redirect(303, '/trips');
	}

	return { claims };
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		const data = await request.formData();
		const memberId = data.get('member_id')?.toString();
		const tripSlug = data.get('trip_slug')?.toString();
		const displayName = data.get('display_name')?.toString().trim() || '';

		if (!memberId) return fail(400, { error: 'Missing member_id.' });

		const token = locals.pb.authStore.token;

		const res = await fetch(`${PUBLIC_PB_URL}/api/members/claim`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ member_id: memberId, display_name: displayName })
		});

		if (!res.ok) {
			let msg = 'Failed to claim membership.';
			try {
				const body = await res.json();
				msg = body?.message || msg;
			} catch (_) {}
			return fail(res.status, { error: msg, member_id: memberId });
		}

		// On success: go to the trip if slug is known, otherwise reload /claim
		// which will show the next pending claim or redirect to /trips.
		redirect(303, tripSlug ? `/trips/${tripSlug}` : '/claim');
	},

	skip: async () => {
		redirect(303, '/trips');
	}
};
