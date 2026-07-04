// Shared server handler for the memory composer's save (#269). One composer,
// three doors (Note Before Bed, Trip Mode Add, Closeout) — each route's
// `saveMemory` form action delegates here so the upsert/delete contract lives
// in exactly one place. `.server.ts` — never ships to the client.

import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type { TripMember } from '$lib/types';
import type { Memory } from './types';
import { decideMemorySave, MAX_THOUGHT_CHARS } from './memory';

/**
 * Upsert-or-delete the caller's (day, author) memory from the composer's form
 * post. Fields: `day_id` (required), `thought` (≤280), `photo` (optional file),
 * `remove_photo` ("1" = drop the stored photo without replacing it).
 *
 * PB enforces the real rules (membership, author-as-self, viewer block, the
 * unique cap, at-least-one-of via memories.pb.js); this handler resolves the
 * existing record and picks create/update/delete per the PRD contract.
 */
export async function handleSaveMemory(event: Pick<RequestEvent, 'request' | 'locals' | 'params'>) {
	const { request, locals, params } = event;
	const trip = await locals.pb
		.collection('trips')
		.getFirstListItem(locals.pb.filter('slug = {:slug}', { slug: params.slug! }));

	let membership: TripMember;
	try {
		membership = await locals.pb
			.collection('trip_members')
			.getFirstListItem<TripMember>(
				`trip = "${trip.id}" && user = "${locals.user!.id}" && removed_at = ""`
			);
	} catch {
		return fail(403, { memoryError: 'You are not a member of this trip.' });
	}
	if (membership.role === 'viewer') {
		return fail(403, { memoryError: 'Viewers cannot capture memories.' });
	}

	const formData = await request.formData();
	const dayId = formData.get('day_id')?.toString() ?? '';
	if (!dayId) return fail(400, { memoryError: 'Missing day.' });
	const thought = (formData.get('thought')?.toString() ?? '').trim().slice(0, MAX_THOUGHT_CHARS);
	const photo = formData.get('photo');
	const hasNewPhoto = photo instanceof File && photo.size > 0;
	const removePhoto = formData.get('remove_photo')?.toString() === '1';

	// The caller's existing memory for this day (the unique (day, author) slot).
	let existing: Memory | null = null;
	try {
		existing = await locals.pb
			.collection('memories')
			.getFirstListItem<Memory>(`day = "${dayId}" && author = "${membership.id}"`);
	} catch {
		existing = null;
	}

	const op = decideMemorySave({
		hasExisting: existing !== null,
		existingHasPhoto: !!existing?.photo,
		hasNewPhoto,
		removePhoto,
		thought
	});

	try {
		if (op === 'reject_empty') {
			return fail(400, { memoryError: 'Add a photo or a thought first.' });
		}
		if (op === 'delete') {
			await locals.pb.collection('memories').delete(existing!.id);
			return { memoryDeleted: true };
		}
		const fd = new FormData();
		fd.set('thought', thought);
		if (hasNewPhoto) {
			fd.set('photo', photo as File);
		} else if (removePhoto) {
			fd.set('photo', ''); // clear the stored file
		}
		if (op === 'update') {
			await locals.pb.collection('memories').update(existing!.id, fd);
		} else {
			fd.set('trip', trip.id);
			fd.set('day', dayId);
			fd.set('author', membership.id); // hook re-pins to the caller regardless
			await locals.pb.collection('memories').create(fd);
		}
		return { memorySaved: true };
	} catch (err: unknown) {
		const e = err as { status?: number; response?: { data?: Record<string, unknown> } };
		if (e?.status === 403) {
			return fail(403, { memoryError: 'You can only edit your own memory.' });
		}
		if (e?.response?.data?.photo) {
			return fail(400, { memoryError: 'Images only (jpg, png, webp, heic), up to 20 MB.' });
		}
		return fail(400, { memoryError: 'Failed to save memory.' });
	}
}
