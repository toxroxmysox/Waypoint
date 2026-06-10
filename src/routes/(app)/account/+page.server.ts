import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// /account ("Profile") — the first user-level settings surface (#104 / PRD #59).
// Self-edit only; covered by the existing users.updateRule = self-only, so no
// rule change is needed. The avatar FileField (5 MB, jpeg/png/webp) has existed
// since migration 0001 and is the backstop behind the client crop pipeline.

const NAME_MAX = 100;

export const load: PageServerLoad = async ({ locals }) => {
	// Fetch the row fresh rather than reading locals.user: on a POST, authRefresh
	// runs before the action, so locals.user is pre-update when load re-runs in
	// the same request. The own row is always self-readable.
	const user = await locals.pb.collection('users').getOne(locals.user!.id);
	const avatarUrl = user.avatar ? locals.pb.files.getURL(user, user.avatar) : '';
	return {
		profile: { id: user.id, name: user.name as string, avatar: user.avatar as string },
		avatarUrl
	};
};

export const actions: Actions = {
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
