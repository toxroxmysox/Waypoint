import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { TripMember } from '$lib/types';
import { verifyVaultPassword } from '$lib/vault/vault-password';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	const body = await request.json();
	const { tripId, password } = body;

	if (!tripId || !password) throw error(400, 'Missing tripId or password');

	const trip = await locals.pb.collection('trips').getOne(tripId);

	// Verify membership
	try {
		await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user.id}"`);
	} catch {
		throw error(403, 'Not a member of this trip');
	}

	if (!trip['vault_password_hash']) {
		throw error(400, 'Vault password not set for this trip');
	}

	const valid = verifyVaultPassword(password, trip['vault_password_hash'] as string);

	if (!valid) {
		throw error(401, 'Incorrect vault password');
	}

	return json({ success: true });
};
