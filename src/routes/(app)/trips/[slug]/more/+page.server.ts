import type { PageServerLoad } from './$types';

// #337 — surface "How we decided" in More only when a decision record exists (the
// trip was promoted out of forming via a scenario vote). A cheap existence check.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();
	const hasDecision = await locals.pb
		.collection('decisions')
		.getFirstListItem(`trip = "${trip.id}"`)
		.then(() => true)
		.catch(() => false);
	return { hasDecision };
};
