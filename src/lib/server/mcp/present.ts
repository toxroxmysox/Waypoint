// #502 — how tool results leave Waypoint: Waypoint-style cards, as markdown text
// (every client) plus structuredContent for the MCP Apps card view
// (card-html.ts). Everything outbound passes scrub(), the last of the two
// ADR-0024 §5 layers (the first is each read's `fields:` allowlist).
import type { ItemType, Trip } from '$lib/types';

export interface Card {
	emoji: string;
	title: string;
	tag?: string;
	lines: string[];
}

export interface ToolResult {
	[k: string]: unknown;
	content: { type: 'text'; text: string }[];
	structuredContent: { heading: string; cards: Card[]; [k: string]: unknown };
	_meta?: Record<string, unknown>;
	isError?: boolean;
}

export const UI_URI = 'ui://waypoint/cards.html';
export const UI_MIME = 'text/html;profile=mcp-app';
export const uiMeta = { ui: { resourceUri: UI_URI }, 'ui/resourceUri': UI_URI };

export const MAX_CARDS = 50;
export const AI_OFF_NOTICE = 'AI access is turned off for this trip by its owner.';

export const EMOJI: Record<ItemType, string> = {
	lodging: '🛏️',
	flight: '✈️',
	transportation: '🚆',
	activity: '🎟️',
	meal: '🍽️',
	note: '📝',
	checklist: '☑️'
};

const MAILTO_RE = /mailto:[^\s"'<>)]*/gi;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const FILE_URL_RE = /\S*\/api\/files\/\S*/g;

function scrubString(s: string): string {
	return s.replace(MAILTO_RE, '[email removed]').replace(EMAIL_RE, '[email removed]').replace(FILE_URL_RE, '[file removed]');
}

/** Deep copy with every string scrubbed of email addresses and PB file URLs. */
export function scrub<T>(v: T): T {
	if (typeof v === 'string') return scrubString(v) as T;
	if (Array.isArray(v)) return v.map(scrub) as T;
	if (v && typeof v === 'object') {
		return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) as T;
	}
	return v;
}

export function stripHtml(s: string): string {
	return (s ?? '')
		.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export const ymd = (s: string) => (s ?? '').slice(0, 10);

export function tripDates(trip: Pick<Trip, 'start_date' | 'end_date'>): string {
	return trip.start_date ? `${ymd(trip.start_date)} → ${ymd(trip.end_date)}` : 'dates not set';
}

function textCards(heading: string, cards: Card[], note?: string): string {
	const body = cards
		.map((c) => `${c.emoji} **${c.title}**${c.tag ? ` · ${c.tag}` : ''}${c.lines.map((l) => `\n   ${l}`).join('')}`)
		.join('\n\n');
	return `### ${heading}\n\n${body || `_${note ?? 'Nothing here.'}_`}${body && note ? `\n\n_${note}_` : ''}`;
}

export function result(heading: string, cards: Card[], extra: Record<string, unknown> = {}): ToolResult {
	const more = cards.length - MAX_CARDS;
	const h = more > 0 ? `${heading} +${more} more` : heading;
	const shown = cards.slice(0, MAX_CARDS);
	const note = typeof extra.note === 'string' ? extra.note : undefined;
	return scrub({
		content: [{ type: 'text' as const, text: textCards(h, shown, note) }],
		structuredContent: { heading: h, cards: shown, ...extra },
		_meta: uiMeta
	});
}

/** What an AI-off trip reveals (ADR-0024 §2): its name, its dates, the notice. */
export function offTrip(trip: Pick<Trip, 'title' | 'start_date' | 'end_date'>): ToolResult {
	return result(trip.title, [{ emoji: '🔒', title: trip.title, lines: [tripDates(trip), AI_OFF_NOTICE] }], { note: AI_OFF_NOTICE });
}
