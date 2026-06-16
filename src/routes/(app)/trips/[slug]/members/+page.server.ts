import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TripMember, PendingInvite, User, JoinToken } from '$lib/types';
import { memberAvatarUrl } from '$lib/collaboration/member-avatar';
import { PUBLIC_PB_URL } from '$env/static/public';

// Hydrated row for the members list. Display name resolution:
//   placeholder → display_name (set at creation) || placeholder_name
//   real user → display_name (per-trip nickname) || user.name || user.email
type MemberRow = TripMember & {
	displayLabel: string;
	emailLabel: string;
	isPlaceholder: boolean;
	isDeparted: boolean;
	removedAtLabel: string;
	avatarUrl: string;
};

type PendingRow = PendingInvite & {
	inviterLabel: string;
	expiresAtLabel: string;
};

type JoinLinkRow = {
	id: string;
	role: JoinToken['role'];
	token: string;
	expiresAtLabel: string;
	expired: boolean;
};

export const load: PageServerLoad = async ({ parent, locals }) => {
	const { trip, membership } = await parent();

	// The roster page is the one surface that intentionally fetches tombstones
	// too — every OTHER trip_members query guards with `removed_at = ""` (#133).
	// We fetch all and split into active vs former below.
	const members = await locals.pb.collection('trip_members').getFullList<TripMember>({
		filter: `trip = "${trip.id}"`,
		sort: 'id',
		expand: 'user'
	});

	const authUser = (locals.user ?? null) as User | null;

	const memberRows: MemberRow[] = members.map((m) => {
		const avatarUrl = memberAvatarUrl(locals.pb, m);
		// #133: a Departed Member tombstone (removed_at set). `user` is cleared, so
		// the snapshotted display_name is the only name we have.
		if (m.removed_at) {
			return {
				...m,
				displayLabel: m.display_name || '(removed member)',
				emailLabel: '',
				isPlaceholder: false,
				isDeparted: true,
				removedAtLabel: m.removed_at.split(' ')[0],
				avatarUrl
			};
		}
		const isPlaceholder = !m.user;
		if (isPlaceholder) {
			return {
				...m,
				displayLabel: m.display_name || m.placeholder_name || '(placeholder)',
				emailLabel: m.placeholder_email || '',
				isPlaceholder: true,
				isDeparted: false,
				removedAtLabel: '',
				avatarUrl
			};
		}
		if (authUser && m.user === authUser.id) {
			return {
				...m,
				displayLabel: m.display_name || authUser.name || authUser.email || '(you)',
				emailLabel: authUser.email || '',
				isPlaceholder: false,
				isDeparted: false,
				removedAtLabel: '',
				avatarUrl
			};
		}
		return {
			...m,
			// #234: keep placeholder_name as the final name fallback even on the
			// real-user branch. #223 resolved names via expand.user.name, but a
			// name-only placeholder has no user to expand — if such a row ever lands
			// here (e.g. a stale/orphaned `user` ref that doesn't expand), it must
			// still show its entered name, not the generic "(member)". Mirrors the
			// canonical display chain (VoteStacks / member-name.ts).
			displayLabel:
				m.display_name ||
				m.expand?.user?.name ||
				m.expand?.user?.email ||
				m.placeholder_name ||
				'(member)',
			// Other members' email stays hidden on the roster (emailVisibility is off; #223 fixes names, not email exposure).
			emailLabel: '',
			isPlaceholder: false,
			isDeparted: false,
			removedAtLabel: '',
			avatarUrl
		};
	});

	const activeMembers = memberRows.filter((m) => !m.isDeparted);
	const formerMembers = memberRows.filter((m) => m.isDeparted);

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
			} else {
				inviterLabel =
					inviter.display_name ||
					inviter.expand?.user?.name ||
					inviter.expand?.user?.email ||
					inviter.placeholder_name ||
					'someone';
			}
		}
		return {
			...p,
			inviterLabel,
			expiresAtLabel: p.expires_at ? p.expires_at.split(' ')[0] : ''
		};
	});

	// #118 — shared join links. Live (non-revoked) links for this trip, one per
	// role at most. Non-viewer members manage them (#152); the section is hidden
	// for viewers, but the data is cheap and the listRule already gates it.
	let joinLinks: JoinLinkRow[] = [];
	try {
		const tokens = await locals.pb.collection('join_tokens').getFullList<JoinToken>({
			filter: `trip = "${trip.id}" && revoked = false`,
			sort: 'role'
		});
		const now = new Date();
		joinLinks = tokens.map((t) => ({
			id: t.id,
			role: t.role,
			token: t.token,
			expiresAtLabel: t.expires_at ? t.expires_at.split(' ')[0] : '',
			expired: t.expires_at ? new Date(t.expires_at) < now : false
		}));
	} catch {
		// listRule denies non-members; surface empty.
	}

	const isOwner = membership.role === 'owner' || membership.role === 'co_owner';
	const canInvite = isOwner || membership.role === 'traveler';
	const canAddPlaceholder = canInvite;
	// #152 — join links are managed by any non-viewer member (owner, co_owner,
	// traveler), matching email-invite authority; trip must be open (not archived).
	const canManageJoinLinks = canInvite && !trip.archived;
	// Active owners only — a tombstoned owner must not prop up the sole-owner count.
	const ownerCount = members.filter((m) => m.role === 'owner' && !m.removed_at).length;

	return {
		trip,
		membership,
		members: activeMembers,
		formerMembers,
		pending: pendingRows,
		joinLinks,
		isOwner,
		canInvite,
		canAddPlaceholder,
		canManageJoinLinks,
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
	},

	// Self-serve leave (#206). Reuses the SAME tombstone path as `remove` —
	// POSTs the caller's own member row to /api/members/remove with NO
	// disposition. The hook detects self-leave (target.user === authRecord.id),
	// forces disposition='keep' (PRD §13: a leaver can't reassign or cascade,
	// so expenses stay pointed at the tombstone), always drops their votes
	// (§12), and blocks the sole active owner. No new hard-delete path.
	leave: async ({ request, locals }) => {
		const data = await request.formData();
		const memberId = data.get('member_id')?.toString();
		if (!memberId) return fail(400, { leave: { error: 'Missing member id.' } });

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
			let msg = 'Could not leave this trip.';
			try {
				const body = await res.json();
				// Reframe the hook's sole-owner block from the leaver's POV.
				const hookMsg = (body?.message || '').toString();
				msg = /sole owner/i.test(hookMsg)
					? "You're the only owner — transfer ownership or remove the other members before you can leave."
					: hookMsg || msg;
			} catch (_) {}
			return fail(res.status, { leave: { error: msg } });
		}

		return { leave: { success: true } };
	},

	// --- #118 join-link management. All three go through the join hook (role cap
	// + owner gating + token generation live server-side). ---
	createJoinLink: async ({ request, locals, params }) => {
		const data = await request.formData();
		const role = data.get('role')?.toString() || '';
		const expiresDays = data.get('expires_days')?.toString() || '';

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			await locals.pb.send('/api/join/create', {
				method: 'POST',
				body: { trip_id: trip.id, role, expires_days: expiresDays || undefined }
			});
			return { joinLink: { success: true, action: 'create' } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to create join link.';
			return fail(400, { joinLink: { error: message } });
		}
	},

	rotateJoinLink: async ({ request, locals, params }) => {
		const data = await request.formData();
		const role = data.get('role')?.toString() || '';

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			await locals.pb.send('/api/join/rotate', {
				method: 'POST',
				body: { trip_id: trip.id, role }
			});
			return { joinLink: { success: true, action: 'rotate' } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to rotate join link.';
			return fail(400, { joinLink: { error: message } });
		}
	},

	revokeJoinLink: async ({ request, locals, params }) => {
		const data = await request.formData();
		const role = data.get('role')?.toString() || '';

		try {
			const trip = await locals.pb
				.collection('trips')
				.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug }));
			await locals.pb.send('/api/join/revoke', {
				method: 'POST',
				body: { trip_id: trip.id, role }
			});
			return { joinLink: { success: true, action: 'revoke' } };
		} catch (err: unknown) {
			const message = extractErrorMessage(err) || 'Failed to revoke join link.';
			return fail(400, { joinLink: { error: message } });
		}
	}
};

function extractErrorMessage(err: unknown): string {
	if (!err || typeof err !== 'object') return '';
	const e = err as { message?: string; response?: { message?: string } };
	return e.response?.message || e.message || '';
}
