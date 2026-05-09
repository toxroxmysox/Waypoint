import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember, PendingInvite, User } from '$lib/types';
import { PUBLIC_PB_URL } from '$env/static/public';

// Hydrated row for the members list. Display name resolution:
//   placeholder → display_name (set at creation) || placeholder_name
//   real user → display_name (per-trip nickname) || user.name || user.email
type MemberRow = TripMember & {
	displayLabel: string;
	emailLabel: string;
	isPlaceholder: boolean;
};

type PendingRow = PendingInvite & {
	inviterLabel: string;
	expiresAtLabel: string;
};

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		sort: 'id'
	});

	const authUser = (locals.user ?? null) as User | null;

	const memberRows: MemberRow[] = members.map((m) => {
		const isPlaceholder = !m.user;
		if (isPlaceholder) {
			return {
				...m,
				displayLabel: m.display_name || m.placeholder_name || '(placeholder)',
				emailLabel: m.placeholder_email || '',
				isPlaceholder: true
			};
		}
		if (authUser && m.user === authUser.id) {
			return {
				...m,
				displayLabel: m.display_name || authUser.name || authUser.email || '(you)',
				emailLabel: authUser.email || '',
				isPlaceholder: false
			};
		}
		return {
			...m,
			displayLabel: m.display_name || '(member)',
			emailLabel: '',
			isPlaceholder: false
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
			if (authUser && inviter.user === authUser.id) {
				inviterLabel = inviter.display_name || authUser.name || authUser.email || 'you';
			} else if (inviter.display_name) {
				inviterLabel = inviter.display_name;
			} else if (inviter.placeholder_name) {
				inviterLabel = inviter.placeholder_name;
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
	const canAddPlaceholder = canInvite;
	const ownerCount = members.filter((m) => m.role === 'owner').length;

	return {
		trip,
		membership,
		members: memberRows,
		pending: pendingRows,
		isOwner,
		canInvite,
		canAddPlaceholder,
		ownerCount
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
	},

	addPlaceholder: async ({ request, locals, params }) => {
		const data = await request.formData();
		const displayName = data.get('display_name')?.toString().trim() || '';
		const placeholderEmail = data.get('placeholder_email')?.toString().trim().toLowerCase() || '';
		const role = data.get('role')?.toString() || '';

		if (!displayName) return fail(400, { placeholder: { error: 'Display name is required.' } });
		if (!role) return fail(400, { placeholder: { error: 'Role is required.' } });

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));

			const token = locals.pb.authStore.token;
			const res = await fetch(`${PUBLIC_PB_URL}/api/members/add-placeholder`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					trip_id: trip.id,
					display_name: displayName,
					placeholder_email: placeholderEmail || undefined,
					role
				})
			});

			if (!res.ok) {
				let msg = 'Failed to add member.';
				try {
					const body = await res.json();
					msg = body?.message || msg;
				} catch (_) {}
				return fail(res.status, { placeholder: { error: msg } });
			}

			return { placeholder: { success: true, displayName } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to add member.';
			return fail(400, { placeholder: { error: message } });
		}
	},

	promote: async ({ request, locals }) => {
		const data = await request.formData();
		const memberId = data.get('member_id')?.toString();
		if (!memberId) return fail(400, { action: { error: 'Missing member id.' } });

		const token = locals.pb.authStore.token;
		const res = await fetch(`${PUBLIC_PB_URL}/api/members/promote`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ member_id: memberId })
		});

		if (!res.ok) {
			let msg = 'Failed to promote member.';
			try {
				const body = await res.json();
				msg = body?.message || msg;
			} catch (_) {}
			return fail(res.status, { action: { error: msg } });
		}

		return { action: { success: true } };
	},

	remove: async ({ request, locals }) => {
		const data = await request.formData();
		const memberId = data.get('member_id')?.toString();
		if (!memberId) return fail(400, { action: { error: 'Missing member id.' } });

		const token = locals.pb.authStore.token;
		const res = await fetch(`${PUBLIC_PB_URL}/api/members/remove`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			},
			body: JSON.stringify({ member_id: memberId })
		});

		if (!res.ok) {
			let msg = 'Failed to remove member.';
			try {
				const body = await res.json();
				msg = body?.message || msg;
			} catch (_) {}
			return fail(res.status, { action: { error: msg } });
		}

		return { action: { success: true } };
	}
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
