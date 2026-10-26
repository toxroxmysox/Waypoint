// Offline banner "as of" time (#534). The PRD wants the last successful cache
// write for what's on screen. The SW stores server responses as-is, so the
// cached copy's `Date` header is when that snapshot was fetched — and it lives
// in the Cache API, so it survives a cold launch (unlike any in-memory stamp).

type Match = (url: string, options?: CacheQueryOptions) => Promise<Response | undefined>;

const defaultMatch: Match = (url, options) => caches.match(url, options);

function dateOf(res: Response | undefined): number | null {
	const t = Date.parse(res?.headers.get('date') ?? '');
	return Number.isNaN(t) ? null : t;
}

/**
 * When the cached copy of `url` was fetched: the newer of its navigation entry
 * and its `__data.json` payload (a client-side navigation caches only the
 * latter). Null when nothing is cached or the Cache API is unavailable.
 */
export async function cachedAt(url: URL, match: Match = defaultMatch): Promise<number | null> {
	try {
		const path = url.pathname.replace(/\/$/, '');
		const [doc, data] = await Promise.all([
			match(url.href),
			match(`${url.origin}${path}/__data.json`, { ignoreSearch: true })
		]);
		const times = [dateOf(doc), dateOf(data)].filter((t): t is number => t !== null);
		return times.length ? Math.max(...times) : null;
	} catch {
		return null;
	}
}

/** "9:40 PM" for today, "Oct 14, 9:40 PM" otherwise; null when there's no time. */
export function formatAsOf(at: number | null, now: number, locale?: string): string | null {
	if (at === null) return null;
	const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
	return new Intl.DateTimeFormat(locale, {
		...(sameDay ? {} : { month: 'short', day: 'numeric' }),
		hour: 'numeric',
		minute: '2-digit'
	}).format(at);
}
