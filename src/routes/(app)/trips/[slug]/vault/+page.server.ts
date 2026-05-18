import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { VaultEntry, TripMember } from '$lib/types';

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const hasVaultPassword = !!trip.vault_password_hash;

	const entries = hasVaultPassword
		? await locals.pb.collection('vault_entries').getFullList<VaultEntry>({
				filter: `trip = "${trip.id}"`,
				sort: '-id'
			})
		: [];

	return { trip, membership, entries, hasVaultPassword };
};

export const actions: Actions = {
	createEntry: async ({ request, locals, params }) => {
		const data = await request.formData();
		const encryptedTitle = data.get('encrypted_title')?.toString();
		const encryptedBody = data.get('encrypted_body')?.toString();

		if (!encryptedTitle || !encryptedBody) {
			return fail(400, { error: 'Encrypted data is required.' });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			await locals.pb.collection('vault_entries').create({
				trip: trip.id,
				encrypted_title: encryptedTitle,
				encrypted_body: encryptedBody,
				created_by: membership.id
			});
			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to create entry.';
			return fail(500, { error: message });
		}
	},

	deleteEntry: async ({ request, locals }) => {
		const data = await request.formData();
		const entryId = data.get('entry_id')?.toString();
		if (!entryId) return fail(400, { error: 'Missing entry_id.' });

		try {
			await locals.pb.collection('vault_entries').delete(entryId);
			return { deleted: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to delete entry.';
			return fail(500, { error: message });
		}
	}
};
