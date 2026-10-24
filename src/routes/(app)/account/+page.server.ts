import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { pbFileUrl } from '$lib/shell/pb-file-url';
import { revertChange } from '$lib/server/mcp/writes/revert';
import type { User } from '$lib/types';

// /account ("Profile") — the first user-level settings surface (#104 / PRD #59).
// Self-edit only; covered by the existing users.updateRule = self-only, so no
// rule change is needed. The avatar FileField (5 MB, jpeg/png/webp) has existed
// since migration 0001 and is the backstop behind the client crop pipeline.

const NAME_MAX = 100;
const SEARCH_ENGINES = ['google', 'duckduckgo'];
const MAPS_APPS = ['google', 'apple'];

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch the row fresh rather than reading locals.user: on a POST, authRefresh
	// runs before the action, so locals.user is pre-update when load re-runs in
	// the same request. The own row is always self-readable.
	const user = await locals.pb.collection('users').getOne(locals.user!.id);
	const avatarUrl = user.avatar ? pbFileUrl(user, user.avatar as string) : '';
	// #502 — Connected apps (mcp_connections: list/delete rule = own rows only).
	const connections = await locals.pb
		.collection('mcp_connections')
		.getFullList({ sort: '-created', fields: 'id,client_name,created,last_used_at' })
		.catch(() => []);
	// #503 — Recent AI changes: the last 30 days of this member's AI Changes
	// (ai_changes list rule = own rows only), newest first.
	const since = new Date(Date.now() - 30 * 86400_000).toISOString().replace('T', ' ');
	const aiChanges = await locals.pb
		.collection('ai_changes')
		.getFullList({
			filter: locals.pb.filter('created >= {:since}', { since }),
			sort: '-created',
			fields: 'id,quote,created,reverted_at,changes,expand.trip.title',
			expand: 'trip'
		})
		.catch(() => []);
	// #523 — daily trip emails: the user's own memberships on trips that still
	// get digests (digest-core skips archived trips). Same per-trip field the
	// trip-settings toggle writes.
	const memberships = await locals.pb
		.collection('trip_members')
		.getFullList({
			filter: locals.pb.filter('user = {:u} && removed_at = "" && trip.archived = false', {
				u: user.id
			}),
			sort: '-trip.start_date',
			fields: 'id,digest_opt_out,expand.trip.title',
			expand: 'trip'
		})
		.catch(() => []);
	return {
		profile: { id: user.id, name: user.name as string, avatar: user.avatar as string },
		linkDefaults: {
			search_engine: (user.search_engine as string) || 'google',
			maps_app: (user.maps_app as string) || 'google'
		},
		tripEmails: memberships.map((m) => ({
			id: m.id,
			title: (m.expand?.trip?.title as string) ?? '',
			on: !m.digest_opt_out
		})),
		avatarUrl,
		connections: connections.map((c) => ({
			id: c.id,
			client_name: c.client_name as string,
			created: c.created as string,
			last_used_at: c.last_used_at as string
		})),
		aiChanges: aiChanges.map((c) => ({
			id: c.id,
			quote: c.quote as string,
			created: c.created as string,
			reverted: !!c.reverted_at,
			trip: (c.expand?.trip?.title as string) ?? '',
			count: Array.isArray(c.changes) ? c.changes.length : 0
		}))
	};
};

export const actions: Actions = {
	// #502 / ADR-0024 — Disconnect: deleting the connection cascades its tokens.
	disconnect: async ({ request, locals }) => {
		const id = (await request.formData()).get('id')?.toString() ?? '';
		try {
			await locals.pb.collection('mcp_connections').delete(id);
			return { disconnected: true };
		} catch {
			return fail(404, { disconnectError: 'That connection is already gone.' });
		}
	},

	// #503 — Revert from Recent AI changes (same undo as chat's revert_change).
	revertAiChange: async ({ request, locals }) => {
		const id = (await request.formData()).get('id')?.toString() ?? '';
		try {
			const r = await revertChange(locals.pb, locals.user!.id, id);
			return { reverted: id, skipped: r.skipped };
		} catch (err) {
			return fail(400, { revertError: (err as Error).message || 'Could not undo that change.' });
		}
	},

	// #510 — where "What is this?" searches and place links open.
	updateLinkDefaults: async ({ request, locals }) => {
		const data = await request.formData();
		const search_engine = data.get('search_engine')?.toString() ?? '';
		const maps_app = data.get('maps_app')?.toString() ?? '';
		if (!SEARCH_ENGINES.includes(search_engine) || !MAPS_APPS.includes(maps_app)) {
			return fail(400, { linkDefaultsError: 'Pick a search engine and a maps app.' });
		}
		try {
			await locals.pb.collection('users').update(locals.user!.id, { search_engine, maps_app });
			// The SDK refreshes authStore for the own record; hand the layout the
			// fresh one so links switch without a reload.
			locals.user = locals.pb.authStore.record as unknown as User;
			return { linkDefaultsSuccess: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to save.';
			return fail(500, { linkDefaultsError: message });
		}
	},

	// #523 — per-trip daily email toggles. Only the caller's own active
	// memberships are written; ids come from the form but are re-checked
	// against a server-side lookup.
	updateTripEmails: async ({ request, locals }) => {
		const data = await request.formData();
		const on = new Set(data.getAll('on').map(String));
		try {
			const mine = await locals.pb.collection('trip_members').getFullList({
				filter: locals.pb.filter('user = {:u} && removed_at = "" && trip.archived = false', {
					u: locals.user!.id
				}),
				fields: 'id,digest_opt_out'
			});
			for (const m of mine) {
				const optOut = !on.has(m.id);
				if (!!m.digest_opt_out !== optOut) {
					await locals.pb.collection('trip_members').update(m.id, { digest_opt_out: optOut });
				}
			}
			return { tripEmailsSuccess: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to save.';
			return fail(500, { tripEmailsError: message });
		}
	},

	updateName: async ({ request, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString().trim() ?? '';

		if (!name) return fail(400, { nameError: 'Name is required.' });
		if (name.length > NAME_MAX) {
			return fail(400, { nameError: `Name must be ${NAME_MAX} characters or fewer.` });
		}

		try {
			await locals.pb.collection('users').update(locals.user!.id, { name });
			return { nameSuccess: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to update name.';
			return fail(500, { nameError: message });
		}
	},

	// The client posts a cropped 512² webp (progressive enhancement). Without JS,
	// the raw picked file arrives instead and PB's mime/size caps gate it.
	updateAvatar: async ({ request, locals }) => {
		const data = await request.formData();
		const file = data.get('avatar');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { avatarError: 'Choose an image.' });
		}

		try {
			const fd = new FormData();
			fd.set('avatar', file);
			await locals.pb.collection('users').update(locals.user!.id, fd);
			return { avatarSuccess: true };
		} catch (err: unknown) {
			const e = err as { response?: { data?: Record<string, unknown> } };
			if (e?.response?.data?.avatar) {
				return fail(400, { avatarError: 'Image only (jpeg, png, or webp), up to 5 MB.' });
			}
			const message = err instanceof Error ? err.message : 'Failed to update photo.';
			return fail(500, { avatarError: message });
		}
	},

	removeAvatar: async ({ locals }) => {
		try {
			// Null clears a single-file field in the PB SDK.
			await locals.pb.collection('users').update(locals.user!.id, { avatar: null });
			return { avatarRemoved: true };
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'Failed to remove photo.';
			return fail(500, { avatarError: message });
		}
	}
};
