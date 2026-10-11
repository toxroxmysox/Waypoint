import { z } from 'zod';
import type { TripMember } from '$lib/types';
import { formatDayDate } from '$lib/shell/format';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { resolveTrip, type McpContext } from '../context';
import { EMOJI, offTrip, result, stripHtml, type Card } from '../present';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

/** ISO datetime, YYYY-MM-DD, "yesterday" or "last week" → a UTC instant. */
export function resolveSince(since: string, now: Date): Date {
	const s = since.trim().toLowerCase();
	if (s === 'yesterday') return new Date(now.getTime() - 86_400_000);
	if (s === 'last week') return new Date(now.getTime() - 7 * 86_400_000);
	const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : since);
	if (Number.isNaN(t)) throw new Error(`Use an ISO date/time, YYYY-MM-DD, "yesterday" or "last week" (got "${since}").`);
	return new Date(t);
}

interface Source {
	collection: string;
	filterTrip: string;
	fields: string;
	by?: string;
	card(r: Record<string, unknown>): Omit<Card, 'tag'>;
}

const SOURCES: Source[] = [
	{
		collection: 'items',
		filterTrip: 'trip',
		fields: 'id,type,title,created,updated,created_by',
		by: 'created_by',
		card: (r) => ({ emoji: EMOJI[r.type as keyof typeof EMOJI] ?? '•', title: r.title as string, lines: [`id: ${r.id}`] })
	},
	{
		collection: 'expenses',
		filterTrip: 'trip',
		fields: 'id,description,amount_usd,created,updated,created_by',
		by: 'created_by',
		card: (r) => ({ emoji: '💵', title: (r.description as string) || 'Expense', lines: [`$${r.amount_usd}`] })
	},
	{
		collection: 'trip_goals',
		filterTrip: 'trip',
		fields: 'id,title,created,updated,created_by',
		by: 'created_by',
		card: (r) => ({ emoji: '🎯', title: r.title as string, lines: ['goal'] })
	},
	{
		collection: 'memories',
		filterTrip: 'trip',
		fields: 'id,thought,created,updated,author',
		by: 'author',
		card: (r) => ({ emoji: '📸', title: 'Memory', lines: [(r.thought as string) || '(photo only)'] })
	},
	{
		collection: 'suggestions',
		filterTrip: 'trip',
		fields: 'id,comment_text,target_type,status,created,updated,author',
		by: 'author',
		card: (r) => ({ emoji: '💬', title: 'Comment', lines: [r.comment_text as string] })
	},
	{
		collection: 'tasks',
		filterTrip: 'checklist.trip',
		fields: 'id,title,checked,created,updated',
		card: (r) => ({ emoji: r.checked ? '☑️' : '☐', title: r.title as string, lines: ['task'] })
	},
	{
		collection: 'days',
		filterTrip: 'trip',
		fields: 'id,date,notes,created,updated',
		card: (r) => ({ emoji: '📝', title: `Day notes · ${formatDayDate(toDateOnly(r.date as string))}`, lines: [stripHtml(r.notes as string)] })
	}
];

async function changes(ctx: McpContext, tripId: string, since: string, names: Map<string, string>) {
	const pb = ctx.pb;
	const lists = await Promise.all(
		SOURCES.map(async (src) => {
			let filter = pb.filter(`${src.filterTrip} = {:t} && (created >= {:s} || updated >= {:s})`, { t: tripId, s: since });
			if (src.collection === 'suggestions') filter += ' && target_type = "comment" && status = "approved"';
			if (src.collection === 'days') filter += ' && notes != ""';
			const rows = await pb
				.collection(src.collection)
				.getFullList({ filter, fields: src.fields, requestKey: null })
				.catch(() => []);
			return rows.map((r) => {
				const added = (r.created as string) >= since;
				const who = src.by && added ? names.get(r[src.by] as string) : undefined;
				// A day row always exists; its notes can only have been edited.
				const tag = src.collection === 'days' ? 'edited' : added ? (who ? `added by ${who}` : 'added') : 'edited';
				return { ...src.card(r), tag, at: (added ? r.created : r.updated) as string };
			});
		})
	);
	return lists.flat().sort((a, b) => b.at.localeCompare(a.at));
}

export const whatChanged: ToolDef = {
	name: 'what_changed',
	title: 'What changed',
	description:
		'What was added or edited on a trip since a time: items, expenses, goals, memories, comments, tasks and day notes, newest first, ' +
		'with who added them where Waypoint knows. Deletions are not tracked. `since` is an ISO date/time, YYYY-MM-DD, "yesterday" or "last week".',
	inputSchema: {
		trip: z.string().describe('Trip slug, or part of its title'),
		since: z.string().describe('ISO date/time, YYYY-MM-DD, "yesterday" or "last week"')
	},
	async run(ctx, { trip: ref, since }: { trip: string; since: string }) {
		const t = await resolveTrip(ctx, ref);
		if (!t.open) return offTrip(t.trip);
		const at = resolveSince(since, ctx.now).toISOString().replace('T', ' ');
		const members: TripMember[] = await loadMembers(ctx, t.trip.id);
		const names = new Map(members.map((m) => [m.id, memberName(m)]));
		const rows = await changes(ctx, t.trip.id, at, names);
		const cards: Card[] = rows.map(({ at: when, ...c }) => ({ ...c, lines: [...c.lines, when.slice(0, 16)] }));
		return result(`Changes since ${at.slice(0, 16)} UTC · ${t.trip.title} (deletions aren't tracked)`, cards, cards.length ? {} : { note: 'Nothing changed.' });
	}
};
