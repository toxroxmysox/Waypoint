import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Memory } from '$lib/memory/types';

// Streams a Memory's protected photo through the app's origin (#269).
//
// `memories.photo` is `protected: true` (memory photos carry faces/kids/
// locations — a leaked URL must be useless). Same posture as the documents
// file proxy: mint the short-lived file token server-side (the caller is
// already authenticated + membership-gated by the memories view rule), fetch
// the bytes, proxy them back. Tokens never reach the client.
//
// `?download=1` forces attachment — the HEIC fallback path (browsers won't
// render HEIC and PB doesn't transcode in v4; the card offers a download link).
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	let memory: Memory;
	try {
		memory = await locals.pb.collection('memories').getOne<Memory>(params.memoryId);
	} catch {
		throw error(404, 'Memory not found');
	}
	if (!memory.photo) throw error(404, 'Memory has no photo');

	const token = await locals.pb.files.getToken();
	const fileUrl = locals.pb.files.getURL(memory, memory.photo, { token });

	const upstream = await fetch(fileUrl);
	if (!upstream.ok || !upstream.body) {
		throw error(502, 'Failed to fetch photo');
	}

	const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
	// Only raster images render inline (the upload allowlist is images-only — no
	// PDF/SVG/HTML). Anything else, or an explicit ?download, forces attachment.
	const inlineable = contentType.startsWith('image/');
	const disposition = url.searchParams.has('download') || !inlineable ? 'attachment' : 'inline';
	const downloadName = memory.photo.replace(/"/g, '');

	const headers = new Headers({
		'content-type': contentType,
		'content-disposition': `${disposition}; filename="${downloadName}"`,
		// The browser must honor the declared type — never sniff bytes active.
		'x-content-type-options': 'nosniff',
		// The filename changes when the photo is replaced, but the URL is by
		// record id — keep caching short + private so an edit shows promptly.
		'cache-control': 'private, max-age=300'
	});
	const len = upstream.headers.get('content-length');
	if (len) headers.set('content-length', len);

	return new Response(upstream.body, { status: 200, headers });
};
