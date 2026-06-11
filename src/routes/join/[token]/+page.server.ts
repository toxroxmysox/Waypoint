import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_PB_URL } from '$env/static/public';

// Status the page renders different UI for.
//   not_found    — token unknown or revoked
//   inactive     — link exists but expired, or the trip is closed
//   ready        — logged in → context card + optional name-only claim + Join
//   logged_out   — anon → context card + inline email+OTP
type JoinStatus = 'not_found' | 'inactive' | 'ready' | 'logged_out';

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	// Anon lookup — call PB directly. Pass the auth token through when present so
	// the lookup can return the name-only claim picker for a signed-in tapper.
	let lookup: {
		role?: string;
		trip_title?: string;
		start_date?: string;
		end_date?: string;
		expired?: boolean;
		closed?: boolean;
		unclaimed_placeholders?: { member_id: string; display_name: string; role: string }[];
	} | null = null;
	let lookupStatus = 0;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (locals.pb.authStore.token) {
		headers['Authorization'] = `Bearer ${locals.pb.authStore.token}`;
	}
	try {
		const res = await fetch(PUBLIC_PB_URL + '/api/join/lookup', {
			method: 'POST',
			headers,
			body: JSON.stringify({ token: params.token })
		});
		lookupStatus = res.status;
		if (res.ok) {
			lookup = await res.json();
		}
	} catch {
		lookupStatus = 0;
	}

	if (lookupStatus !== 200 || !lookup) {
		return {
			token: params.token,
			status: 'not_found' as JoinStatus,
			role: '',
			tripTitle: '',
			startDate: '',
			endDate: '',
			authEmail: locals.user?.email ?? '',
			unclaimedPlaceholders: []
		};
	}

	let status: JoinStatus;
	if (lookup.expired || lookup.closed) {
		status = 'inactive';
	} else if (locals.user) {
		status = 'ready';
	} else {
		status = 'logged_out';
	}

	return {
		token: params.token,
		status,
		role: lookup.role || '',
		tripTitle: lookup.trip_title || '',
		startDate: lookup.start_date || '',
		endDate: lookup.end_date || '',
		closed: !!lookup.closed,
		expired: !!lookup.expired,
		authEmail: locals.user?.email ?? '',
		unclaimedPlaceholders: (lookup.unclaimed_placeholders ?? []) as {
			member_id: string;
			display_name: string;
			role: string;
		}[]
	};
};

export const actions: Actions = {
	accept: async ({ params, locals, request }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated.' });

		const formData = await request.formData();
		const claimPlaceholder = formData.get('claim_placeholder')?.toString() || '';

		try {
			const body: Record<string, string> = { token: params.token };
			if (claimPlaceholder) body.claim_placeholder = claimPlaceholder;
			const res = await locals.pb.send<{ trip_id: string }>('/api/join/accept', {
				method: 'POST',
				body
			});
			const trip = await locals.pb.collection('trips').getOne<{ slug: string }>(res.trip_id);
			redirect(303, `/trips/${trip.slug}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			const message = extractErrorMessage(err) || 'Failed to join trip.';
			return fail(400, { error: message });
		}
	},

	requestOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase();
		if (!email || !email.includes('@')) return fail(400, { error: 'A valid email is required.' });

		try {
			const result = await locals.pb.collection('users').requestOTP(email);
			return { otpId: result.otpId, email };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to send code.';
			return fail(500, { email, error: message });
		}
	},

	verifyOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const otpId = data.get('otpId')?.toString();
		const code = data.get('code')?.toString().trim();
		if (!otpId || !code) return fail(400, { error: 'Code is required.' });

		try {
			await locals.pb.collection('users').authWithOTP(otpId, code);
		} catch {
			return fail(400, { error: 'Invalid or expired code. Try again.' });
		}
		// Fall through: the page reloads authed and load() returns status='ready'
		// with the explicit "Join trip" confirm. Verify and accept stay separate
		// so a failed join after auth doesn't strand an inconsistent state.
		return { verified: true };
	}
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
