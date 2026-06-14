import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		// Preserve the deep-link destination so a logged-out hit on (e.g.) a
		// notification link or shared day URL lands back here after OTP. The
		// landing pages (/login, /trips) don't need preserving — skip the noise.
		const dest = url.pathname + url.search;
		const target = dest === '/trips' ? '/login' : `/login?redirect=${encodeURIComponent(dest)}`;
		redirect(303, target);
	}

	return {
		user: locals.user
	};
};
