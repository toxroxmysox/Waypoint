import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { safeRedirect } from '$lib/shell/safe-redirect';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) {
		// Already authed (e.g. followed a deep link in a logged-in tab) — honor
		// the preserved destination instead of always dumping on /trips.
		redirect(303, safeRedirect(url.searchParams.get('redirect')));
	}
	// Surface the validated destination so the form can echo it through the OTP
	// round-trip as a hidden field.
	return { redirectTo: safeRedirect(url.searchParams.get('redirect'), '') };
};

export const actions: Actions = {
	requestOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase();
		const redirectTo = data.get('redirect')?.toString() ?? '';

		if (!email) {
			return fail(400, { email, error: 'Email is required.', redirectTo });
		}

		try {
			const result = await locals.pb.collection('users').requestOTP(email);
			return { otpId: result.otpId, email, redirectTo };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to send code.';
			return fail(500, { email, error: message, redirectTo });
		}
	},

	verifyOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const otpId = data.get('otpId')?.toString();
		const code = data.get('code')?.toString().trim();
		const redirectTo = data.get('redirect')?.toString() ?? '';

		if (!otpId || !code) {
			return fail(400, { error: 'Code is required.', redirectTo });
		}

		try {
			await locals.pb.collection('users').authWithOTP(otpId, code);
			// Auth cookie is set by hooks.server.ts
		} catch {
			return fail(400, { error: 'Invalid or expired code. Try again.', redirectTo });
		}

		// /claim checks for pending placeholder memberships and redirects through
		// to the final destination if there are none. Thread the preserved
		// deep-link target so it survives the claim gate.
		const dest = safeRedirect(redirectTo, '');
		redirect(303, dest ? `/claim?redirect=${encodeURIComponent(dest)}` : '/claim');
	}
};
