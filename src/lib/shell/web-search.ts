// #406 — "What is this?" for someone else's idea or goal: a web search for
// `what is <title> in <place>`, opened in the browser. No preload (that would be a
// server fetch or AI, and it would send trip data out). The engine is the user's
// #510 default (Google when unset).

import type { SearchEngine } from './types';

const ENGINES: Record<SearchEngine, string> = {
	google: 'https://www.google.com/search?q=',
	duckduckgo: 'https://duckduckgo.com/?q='
};

/** The search query: `what is Pastéis de Belém in Lisbon, Portugal`. Place is optional. */
export function whatIsQuery(title: string, place = ''): string {
	const t = title.trim();
	const p = place.trim();
	return p ? `what is ${t} in ${p}` : `what is ${t}`;
}

/** The search URL for `whatIsQuery`, or '' for an empty title. */
export function whatIsSearchUrl(title: string, place = '', engine?: SearchEngine | ''): string {
	if (!title.trim()) return '';
	return (ENGINES[engine || 'google'] ?? ENGINES.google) + encodeURIComponent(whatIsQuery(title, place));
}
