import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { PUBLIC_PB_URL } from '$env/static/public';

// Status the page renders different UI for.
//   not_found    — code doesn't exist
//   expired      — code exists but past expires_at
//   match        — logged in AND auth email == invite email → one-click accept
//   mismatch     — logged in AND auth email != invite email → "log out and try again"
//   logged_out   — anon → render inline OTP flow with the invite email pre-filled
type InviteStatus = 'not_found' | 'expired' | 'match' | 'mismatch' | 'logged_out';

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
	// Lookup is anon — call directly without going through the SDK so we don't
	// need to thread auth into the harness path.
	let lookup: {
		email?: string;
		role?: string;
		trip_title?: string;
		expired?: boolean;
		unclaimed_placeholders?: { member_id: string; display_name: string; role: string }[];
	} | null = null;
	let lookupStatus = 0;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (locals.pb.authStore.token) {
		headers['Authorization'] = `Bearer ${locals.pb.authStore.token}`;
	}
	try {
		const res = await fetch(PUBLIC_PB_URL + '/api/invites/lookup', {
			method: 'POST',
			headers,
			body: JSON.stringify({ code: params.code })
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
			code: params.code,
			status: 'not_found' as InviteStatus,
			email: '',
			role: '',
			tripTitle: '',
			authEmail: locals.user?.email ?? '',
			unclaimedPlaceholders: []
		};
	}

	let status: InviteStatus;
	if (lookup.expired) {
		status = 'expired';
	} else if (locals.user) {
		const authEmail = (locals.user.email || '').trim().toLowerCase();
		const inviteEmail = (lookup.email || '').trim().toLowerCase();
		status = authEmail === inviteEmail ? 'match' : 'mismatch';
	} else {
		status = 'logged_out';
	}

	return {
		code: params.code,
		status,
		email: lookup.email || '',
		role: lookup.role || '',
		tripTitle: lookup.trip_title || '',
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
			const body: Record<string, string> = { code: params.code };
			if (claimPlaceholder) {
				body.claim_placeholder = claimPlaceholder;
			}
			const res = await locals.pb.send<{ trip_id: string }>('/api/invites/accept', {
				method: 'POST',
				body
			});
			const trip = await locals.pb.collection('trips').getOne<{ slug: string }>(res.trip_id);
			redirect(303, `/trips/${trip.slug}`);
		} catch (err: unknown) {
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			const message = extractErrorMessage(err) || 'Failed to accept invite.';
			return fail(400, { error: message });
		}
	},

	requestOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase();
		if (!email) return fail(400, { error: 'Email is required.' });

		try {
			const result = await locals.pb.collection('users').requestOTP(email);
			return { otpId: result.otpId, email };
		} catch (err: unknown) {
			console.error('[invite requestOTP] failed:', err);
			return fail(500, { email, error: 'Failed to send code. Please try again.' });
		}
	},

	signOut: async ({ locals }) => {
		// Used from the mismatch state — clear the wrong-account session and
		// fall through so the page re-renders as logged_out with the invite
		// email pre-filled.
		locals.pb.authStore.clear();
		return { signedOut: true };
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
		// On success, fall through. The page reloads, the user is now logged
		// in, and the load function will return status='match' which surfaces
		// the one-click accept button. Keeping verify and accept separate
		// avoids an inconsistent-state class of bug if accept fails after
		// auth succeeds.
		return { verified: true };
	}
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
