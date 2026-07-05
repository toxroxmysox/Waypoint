import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Decision, DecisionPayload } from '$lib/ideation/types';

// #337 — "How we decided". Reads the immutable decision record minted at promotion
// (readable forever). Any trip member (incl. viewers) may read it.
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip } = await parent();

	let decision: Decision;
	try {
		decision = await locals.pb
			.collection('decisions')
			.getFirstListItem<Decision>(`trip = "${trip.id}"`, { sort: '-created' });
	} catch {
		error(404, 'No decision recorded for this trip yet.');
	}

	// The payload is an immutable snapshot; normalize it defensively (older records
	// or a raw JSON read shouldn't crash the view).
	const payload = (decision.payload || {}) as Partial<DecisionPayload>;

	return {
		trip: { slug: trip.slug, title: trip.title },
		decision: {
			decidedAt: payload.decided_at || decision.created,
			chooserName: payload.chooser_name || 'Someone',
			chosenTitle: payload.chosen_title || '',
			dateStart: payload.date_start || '',
			dateEnd: payload.date_end || '',
			scenarios: Array.isArray(payload.scenarios) ? payload.scenarios : []
		}
	};
};
