import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember, PendingInvite, User } from '$lib/types';

// Hydrated row for the members list. Display name resolution:
//   placeholder → placeholder_name
//   real user → display_name (per-trip nickname) || user.name || user.email
type MemberRow = TripMember & {
	displayLabel: string;
	emailLabel: string;
};

type PendingRow = PendingInvite & {
	inviterLabel: string;
	expiresAtLabel: string;
};

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		sort: 'created'
	});

	// Resolve user records in one batch — display_name + email are needed per row.
	const userIds = members.map((m) => m.user).filter((id) => !!id);
	const usersById: Record<string, User> = {};
	if (userIds.length > 0) {
		const filter = userIds.map((id) => `id = "${id}"`).join(' || ');
		const users = await locals.pb.collection('users').getFullList<User>({ filter });
		for (const u of users) usersById[u.id] = u;
	}

	const memberRows: MemberRow[] = members.map((m) => {
		if (!m.user) {
			return {
				...m,
				displayLabel: m.placeholder_name || '(placeholder)',
				emailLabel: m.placeholder_email || ''
			};
		}
		const u = usersById[m.user];
		return {
			...m,
			displayLabel: m.display_name || u?.name || u?.email || '(unknown)',
			emailLabel: u?.email || ''
		};
	});

	let pending: PendingInvite[] = [];
	try {
		pending = await locals.pb.collection('pending_invites').getFullList<PendingInvite>({
			filter: `trip = "${trip.id}"`,
			sort: '-created'
		});
	} catch {
		// listRule denies non-members; surface empty.
	}

	const memberById = new Map(members.map((m) => [m.id, m]));
	const pendingRows: PendingRow[] = pending.map((p) => {
		const inviter = memberById.get(p.invited_by);
		let inviterLabel = 'someone';
		if (inviter) {
			if (inviter.user && usersById[inviter.user]) {
				const u = usersById[inviter.user];
				inviterLabel = inviter.display_name || u.name || u.email;
			} else {
				inviterLabel = inviter.placeholder_name || 'someone';
			}
		}
		return {
			...p,
			inviterLabel,
			expiresAtLabel: p.expires_at ? p.expires_at.split(' ')[0] : ''
		};
	});

	const isOwner = membership.role === 'owner' || membership.role === 'co_owner';
	const canInvite = isOwner || membership.role === 'traveler';

	return {
		trip,
		membership,
		members: memberRows,
		pending: pendingRows,
		isOwner,
		canInvite
	};
};

export const actions: Actions = {
	invite: async ({ request, locals, params }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString().trim().toLowerCase() || '';
		const role = data.get('role')?.toString() || '';

		if (!email) return fail(400, { invite: { error: 'Email is required.' } });
		if (!role) return fail(400, { invite: { error: 'Role is required.' } });

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			await locals.pb.send('/api/invites/create', {
				method: 'POST',
				body: { trip_id: trip.id, email, role }
			});
			return { invite: { success: true, email } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to send invite.';
			return fail(400, { invite: { error: message, email, role } });
		}
	},

	revoke: async ({ request, locals }) => {
		const data = await request.formData();
		const inviteId = data.get('invite_id')?.toString();
		if (!inviteId) return fail(400, { revoke: { error: 'Missing invite id.' } });

		try {
			await locals.pb.collection('pending_invites').delete(inviteId);
			return { revoke: { success: true } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to revoke invite.';
			return fail(400, { revoke: { error: message } });
		}
	}
};

// Pull a useful message out of either a SvelteKit fetch-style error or a
// PocketBase ClientResponseError. The custom invite endpoints throw
// BadRequestError / ForbiddenError, which the SDK wraps in
// ClientResponseError with the message in `response.data.message`.
function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
