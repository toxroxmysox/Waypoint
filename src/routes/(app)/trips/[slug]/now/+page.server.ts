import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { trip } = await parent();
	return { trip };
};
