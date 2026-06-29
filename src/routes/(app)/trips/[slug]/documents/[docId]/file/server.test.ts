import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

// Exercises the file-proxy endpoint's response-header policy (#289):
//   - every response carries `X-Content-Type-Options: nosniff`
//   - PDFs and images render inline; any other content-type downloads
//   - an explicit `?download` always forces attachment
// The member-gated `locals.pb` read is mocked, not under test here.

type UpstreamInit = { contentType: string };

function makeLocals(file = 'boarding_pass_a1b2c3d4e5.pdf', caption = '') {
	return {
		user: { id: 'u1' },
		pb: {
			collection: () => ({
				getOne: async () => ({ id: 'd1', file, caption })
			}),
			files: {
				getToken: async () => 'tok',
				getURL: () => 'http://pb.test/file'
			}
		}
	} as unknown as App.Locals;
}

function stubUpstream({ contentType }: UpstreamInit) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => {
			const body = new ReadableStream();
			return {
				ok: true,
				body,
				headers: new Headers({ 'content-type': contentType })
			} as unknown as Response;
		})
	);
}

async function callGET(opts: {
	contentType: string;
	download?: boolean;
	file?: string;
	caption?: string;
}) {
	stubUpstream({ contentType: opts.contentType });
	const url = new URL(
		`http://app.test/trips/t/documents/d1/file${opts.download ? '?download=1' : ''}`
	);
	const res = await GET({
		params: { slug: 't', docId: 'd1' },
		locals: makeLocals(opts.file, opts.caption),
		url
	} as unknown as Parameters<typeof GET>[0]);
	return res as Response;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('document file endpoint headers (#289)', () => {
	it('sets nosniff on every response', async () => {
		const res = await callGET({ contentType: 'application/pdf' });
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('renders PDFs inline', async () => {
		const res = await callGET({ contentType: 'application/pdf' });
		expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
	});

	it('renders images inline', async () => {
		const res = await callGET({ contentType: 'image/png', file: 'pic_a1b2c3d4e5.png' });
		expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
	});

	it('downloads non-image/PDF content (defense-in-depth)', async () => {
		// e.g. an octet-stream fallback or an unexpected upstream content-type.
		const res = await callGET({ contentType: 'application/octet-stream' });
		expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
		// nosniff still present.
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	});

	it('forces attachment for inline-eligible types when ?download is set', async () => {
		const res = await callGET({ contentType: 'application/pdf', download: true });
		expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
	});
});
