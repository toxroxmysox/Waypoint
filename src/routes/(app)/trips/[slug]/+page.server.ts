import type { PageServerLoad } from './$types';
import { fetchManualChecklists, rollupChecklists } from '$lib/itinerary/checklist-loaders';

// Overview checklist previews (#51): roll up each manual, non-item-scoped
// Checklist's done/total so the Overview can show compact mini-cards under the
// whole-trip header and each phase's days. Same shape as the Lists index.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();
	const { checklists, tasks } = await fetchManualChecklists(locals.pb, trip.id);
	return { lists: rollupChecklists(checklists, tasks) };
};
