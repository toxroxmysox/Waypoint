import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// #571: the Money Units home moved to /money-units (CONTEXT.md: Money Unit, not
// "group"). /groups is kept only as a redirect so bookmarks and old links don't 404.
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/trips/${params.slug}/money-units`);
};
