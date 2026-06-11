import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The standalone trip-wide parking lot is retired (#86). The Parking Lot is
// strictly phase-scoped (see CONTEXT.md) — Phase Detail and Day Detail are the
// only parking surfaces. This trip-wide page was drift, so redirect any lingering
// links to the phases list. Non-permanent redirect (303) by repo convention and to
// avoid browsers caching the route as permanently gone while the phase redesign is in flux.
export const load: PageServerLoad = ({ params }) => {
	redirect(303, `/trips/${params.slug}/phases`);
};
