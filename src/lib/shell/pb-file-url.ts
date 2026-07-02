import { PUBLIC_PB_URL } from '$env/static/public';

// Build a browser-reachable PocketBase file URL.
//
// File URLs are loaded by the BROWSER, so they must use the PUBLIC base — NOT the
// SSR PocketBase client's base. In prod the SSR client points at PB_INTERNAL_URL
// (http://localhost:8090, on-box, unreachable from a browser); `pb.files.getURL()`
// inherits that base, so using it for avatar/image URLs shipped broken-image icons
// (regression from routing SSR calls off the Cloudflare tunnel). Server-side FETCHES
// of files (e.g. the documents proxy that streams the bytes itself) correctly keep
// using the internal client — only URLs handed to the browser go through here.
export function pbFileUrl(
	record: { id: string; collectionName?: string; collectionId?: string },
	filename: string
): string {
	const collection = record.collectionName || record.collectionId || '';
	return `${PUBLIC_PB_URL}/api/files/${collection}/${record.id}/${filename}`;
}
