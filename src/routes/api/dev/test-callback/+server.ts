// #502 — dev-only redirect target for the e2e OAuth client; echoes the query.
import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	if (env.WAYPOINT_DEV_MODE !== 'true') error(404, 'Not found');
	return json(Object.fromEntries(url.searchParams));
};
