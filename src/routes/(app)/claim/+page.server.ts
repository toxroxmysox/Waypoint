import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_PB_URL } from '$env/static/public';
import { safeRedirect } from '$lib/shell/safe-redirect';

export interface Claim {
	member_id: string;
	trip_id: string;
	trip_slug: string;
	trip_title: string;
	placeholder_name: string;
	role: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const token = locals.pb.authStore.token;
	// Deep-link destination threaded from login through the claim gate (#179).
	const dest = safeRedirect(url.searchParams.get('redirect'));

	const res = await fetch(`${PUBLIC_PB_URL}/api/members/my-claims`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) {
		redirect(303, dest);
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
		// Nothing pending — land on the preserved deep-link target (or /trips).
		redirect(303, dest);
	}

	return { claims, redirectTo: safeRedirect(url.searchParams.get('redirect'), '') };
};

export const actions: Actions = {
	accept: async ({ request, locals }) => {
		const data = await request.formData();
		const memberId = data.get('member_id')?.toString();
		const tripSlug = data.get('trip_slug')?.toString();
		const displayName = data.get('display_name')?.toString().trim() || '';
		const dest = safeRedirect(data.get('redirect')?.toString(), '');

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
		// (preserving any deep-link target) to show the next pending claim or
		// fall through to the preserved destination / trips.
		if (tripSlug) redirect(303, `/trips/${tripSlug}`);
		redirect(303, dest ? `/claim?redirect=${encodeURIComponent(dest)}` : '/claim');
	},

	skip: async ({ request }) => {
		const data = await request.formData();
		// Skipping the claim still honors the original deep-link destination.
		redirect(303, safeRedirect(data.get('redirect')?.toString()));
	}
};
