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
	let lookup: { email?: string; role?: string; trip_title?: string; expired?: boolean } | null = null;
	let lookupStatus = 0;
	try {
		const res = await fetch(PUBLIC_PB_URL + '/api/invites/lookup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
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
			authEmail: locals.user?.email ?? ''
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
		authEmail: locals.user?.email ?? ''
	};
};

export const actions: Actions = {
	accept: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated.' });

		try {
			const res = await locals.pb.send<{ trip_id: string }>('/api/invites/accept', {
				method: 'POST',
				body: { code: params.code }
			});
			// Look up trip slug for the redirect.
			const trip = await locals.pb.collection('trips').getOne<{ slug: string }>(res.trip_id);
			redirect(303, `/trips/${trip.slug}`);
		} catch (err: unknown) {
			// Re-throw redirects so SvelteKit handles them.
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
			const message = err instanceof Error ? err.message : 'Failed to send code.';
			return fail(500, { email, error: message });
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
