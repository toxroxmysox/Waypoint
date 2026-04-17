import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(303, '/trips');
	}
};

export const actions: Actions = {
	requestOTP: async ({ request, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase();

		if (!email) {
			return fail(400, { email, error: 'Email is required.' });
		}

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

		if (!otpId || !code) {
			return fail(400, { error: 'Code is required.' });
		}

		try {
			await locals.pb.collection('users').authWithOTP(otpId, code);
			// Auth cookie is set by hooks.server.ts
		} catch {
			return fail(400, { error: 'Invalid or expired code. Try again.' });
		}

		redirect(303, '/trips');
	}
};
