import { fail, redirect, isRedirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember } from '$lib/types';
import { hashVaultPassword } from '$lib/vault/vault-password';

export const load: PageServerLoad = async ({ parent }) => {
	const { trip, membership } = await parent();
	return { trip, membership, hasVaultPassword: !!trip.vault_password_hash };
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const data = await request.formData();
		const title = data.get('title')?.toString().trim();
		const startDate = data.get('start_date')?.toString();
		const endDate = data.get('end_date')?.toString();
		const timezone = data.get('timezone')?.toString() || '';
		const locationSummary = data.get('location_summary')?.toString().trim() || '';
		const autoApproveSuggestions = data.get('auto_approve_suggestions') === 'on';

		if (!title) return fail(400, { error: 'Title is required.' });
		if (!startDate || !endDate) return fail(400, { error: 'Start and end dates are required.' });
		if (new Date(startDate) > new Date(endDate)) {
			return fail(400, { error: 'Start date must be before end date.' });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only trip owners can change settings.' });
			}

			await locals.pb.collection('trips').update(trip.id, {
				title,
				start_date: startDate + ' 00:00:00.000Z',
				end_date: endDate + ' 00:00:00.000Z',
				timezone,
				location_summary: locationSummary,
				auto_approve_suggestions: autoApproveSuggestions
			});

			return { success: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update trip.';
			return fail(500, { error: message });
		}
	},

	delete: async ({ locals, params }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only trip owners can delete the trip.' });
			}

			await locals.pb.collection('trips').delete(trip.id);
			redirect(303, '/trips');
		} catch (err: unknown) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to delete trip.';
			return fail(500, { error: message });
		}
	},

	setVaultPassword: async ({ request, locals, params }) => {
		const data = await request.formData();
		const password = data.get('vault_password')?.toString();
		const confirm = data.get('vault_password_confirm')?.toString();

		if (!password || password.length < 4) {
			return fail(400, { vaultError: 'Password must be at least 4 characters.' });
		}
		if (password !== confirm) {
			return fail(400, { vaultError: 'Passwords do not match.' });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { vaultError: 'Only trip owners can set the vault password.' });
			}

			const hash = hashVaultPassword(password);
			await locals.pb.collection('trips').update(trip.id, { vault_password_hash: hash });

			return { vaultSuccess: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to set vault password.';
			return fail(500, { vaultError: message });
		}
	},

	toggleArchive: async ({ request, locals, params }) => {
		const data = await request.formData();
		const archiveEnabled = data.get('archive_enabled') === 'on';
		const publishDays = parseInt(data.get('archive_publish_after_days')?.toString() || '7', 10);

		if (isNaN(publishDays) || publishDays < 0) {
			return fail(400, { archiveError: 'Publish delay must be a non-negative number.' });
		}

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { archiveError: 'Only trip owners can change archive settings.' });
			}

			const updates: Record<string, unknown> = {
				archive_enabled: archiveEnabled,
				archive_publish_after_days: publishDays
			};

			if (archiveEnabled && !trip.public_share_token) {
				const { generateArchiveToken } = await import('$lib/portability/archive-token');
				updates.public_share_token = generateArchiveToken();
			}

			await locals.pb.collection('trips').update(trip.id, updates);
			const updatedTrip = await locals.pb.collection('trips').getOne(trip.id);

			return {
				archiveSuccess: true,
				shareToken: updatedTrip.public_share_token
			};
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update archive settings.';
			return fail(500, { archiveError: message });
		}
	},

	archiveTrip: async ({ locals, params }) => {
		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const membership = await locals.pb
				.collection('trip_members')
				.getFirstListItem<TripMember>(`trip = "${trip.id}" && user = "${locals.user!.id}"`);
			if (membership.role !== 'owner' && membership.role !== 'co_owner') {
				return fail(403, { error: 'Only trip owners can archive a trip.' });
			}

			const updates: Record<string, unknown> = { archived: true };

			if (trip.archive_enabled && !trip.public_share_token) {
				const { generateArchiveToken } = await import('$lib/portability/archive-token');
				updates.public_share_token = generateArchiveToken();
			}

			await locals.pb.collection('trips').update(trip.id, updates);
			return { archived: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to archive trip.';
			return fail(500, { error: message });
		}
	}
};
