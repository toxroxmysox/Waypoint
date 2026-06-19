import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// #244: Now + Today merged into one weighted "Now" tab. The Today layout now
// lives at /now (the "Today" sub-tab); /today is kept only as a redirect so deep
// links and the older item-detail / new-item back-links don't 404. The "Next 3
// days" sub-tab still lives at the child route /today/upcoming (unaffected).
export const load: PageServerLoad = async ({ params }) => {
	redirect(308, `/trips/${params.slug}/now`);
};
