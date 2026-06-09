import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Document } from '$lib/documents/types';

// Streams a Document's protected file through the app's origin.
//
// The `documents.file` field is `protected: true`, so PB only serves it with a
// short-lived file token. We mint that token server-side (the user is already
// authenticated + membership-gated by the collection view rule), fetch the
// bytes, and proxy them back. Serving from our own origin (rather than handing
// the browser a tokened PB URL) keeps tokens off the client and lets the future
// service worker precache same-origin bytes (offline = S5).
//
// `?download=1` forces a download (Content-Disposition: attachment); otherwise
// the browser renders inline (image in an <img>, PDF in its native viewer).
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) throw error(401, 'Not authenticated');

	let doc: Document;
	try {
		doc = await locals.pb.collection('documents').getOne<Document>(params.docId);
	} catch {
		throw error(404, 'Document not found');
	}
	if (!doc.file) throw error(404, 'Document has no file');

	const token = await locals.pb.files.getToken();
	const fileUrl = locals.pb.files.getURL(doc, doc.file, { token });

	const upstream = await fetch(fileUrl);
	if (!upstream.ok || !upstream.body) {
		throw error(502, 'Failed to fetch file');
	}

	const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
	const disposition = url.searchParams.has('download') ? 'attachment' : 'inline';
	// The stored filename carries a PB-generated suffix; keep it simple for the
	// download name by using the caption when present, else the stored name.
	const downloadName = (doc.caption?.trim() || doc.file).replace(/"/g, '');

	const headers = new Headers({
		'content-type': contentType,
		'content-disposition': `${disposition}; filename="${downloadName}"`,
		// These bytes are immutable per record; allow private caching.
		'cache-control': 'private, max-age=3600'
	});
	const len = upstream.headers.get('content-length');
	if (len) headers.set('content-length', len);

	return new Response(upstream.body, { status: 200, headers });
};
