import { z } from 'zod';
import type PocketBase from 'pocketbase';
import type { Day, Expense, Item, TripGoal } from '$lib/types';
import { formatDayDate } from '$lib/shell/format';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { myTrips, resolveTrip, type McpContext, type TripRef } from '../context';
import { ITEM_FIELDS, itemCard } from '../day-data';
import { AI_OFF_NOTICE, result, stripHtml, type Card, type ToolResult } from '../present';
import type { ToolDef } from './types';

const SEARCH_CAP = 25;
const ITEM_TYPES = ['lodging', 'transportation', 'activity', 'meal', 'note', 'checklist', 'flight'] as const;
const ITEM_STATUSES = ['planned', 'done', 'considered', 'unplanned'] as const;

interface SearchArgs {
	query?: string;
	trip?: string;
	type?: (typeof ITEM_TYPES)[number];
	country?: string;
	from?: string;
	to?: string;
	status?: (typeof ITEM_STATUSES)[number];
	booked?: boolean;
	min_cost?: number;
	max_cost?: number;
}

/** `(f1) && (f2)` over the non-empty parts, each already pb.filter-escaped. */
const and = (...parts: (string | false | undefined)[]) =>
	parts
		.filter(Boolean)
		.map((p) => `(${p})`)
		.join(' && ');

function inTrips(pb: PocketBase, field: string, ids: string[]): string {
	return ids.map((id) => pb.filter(`${field} = {:id}`, { id })).join(' || ');
}

function textMatch(pb: PocketBase, fields: string[], q: string): string {
	return fields.map((f) => pb.filter(`${f} ~ {:q}`, { q })).join(' || ');
}

export const search: ToolDef = {
	name: 'search',
	title: 'Search trips',
	description:
		"Search the user's trips (all of them, or one) by text and filters. Covers items (title, notes, place), day notes, " +
		'confirmation codes, expenses and goals. Comments are not searched; open an item with get_item to read them. ' +
		'Filters: type, country (ISO-2, e.g. PT), from/to (YYYY-MM-DD), status, booked, min_cost/max_cost (USD). ' +
		'Item results carry an id for get_item.',
	inputSchema: {
		query: z.string().optional().describe('Text to look for'),
		trip: z.string().optional().describe('Limit to one trip (slug or part of its title)'),
		type: z.enum(ITEM_TYPES).optional(),
		country: z.string().length(2).optional().describe('ISO-2 country code'),
		from: z.string().optional().describe('YYYY-MM-DD, inclusive'),
		to: z.string().optional().describe('YYYY-MM-DD, inclusive'),
		status: z.enum(ITEM_STATUSES).optional(),
		booked: z.boolean().optional(),
		min_cost: z.number().optional(),
		max_cost: z.number().optional()
	},
	async run(ctx, a: SearchArgs) {
		const q = a.query?.trim() ?? '';
		const itemOnly = a.type !== undefined || a.status !== undefined || a.booked !== undefined;
		const anyFilter = itemOnly || a.country || a.from || a.to || a.min_cost !== undefined || a.max_cost !== undefined;
		if (!q && !anyFilter && !a.trip) throw new Error('Give a query, a filter, or a trip to search.');

		const scope: TripRef[] = a.trip ? [await resolveTrip(ctx, a.trip)] : await myTrips(ctx);
		const open = scope.filter((t) => t.open);
		const skipped = scope
			.filter((t) => !t.open)
			.map((t) => ({ title: t.trip.title, start_date: t.trip.start_date, end_date: t.trip.end_date, notice: AI_OFF_NOTICE }));
		if (!open.length) return done('Search', [], skipped);

		const ids = open.map((t) => t.trip.id);
		const titleOf = new Map(open.map((t) => [t.trip.id, t.trip.title]));
		const country = a.country?.toUpperCase();
		const cards: (Card & { sortKey: string })[] = [];

		cards.push(...(await searchItems(ctx, a, q, ids, country, titleOf)));
		if (!itemOnly) {
			const [notes, codes, expenses, goals] = await Promise.all([
				q ? searchDayNotes(ctx, a, q, ids, titleOf) : [],
				q && !country ? searchCodes(ctx, q, ids, titleOf) : [],
				!country ? searchExpenses(ctx, a, q, ids, titleOf) : [],
				q && !country && !a.from && !a.to && a.min_cost === undefined && a.max_cost === undefined ? searchGoals(ctx, q, ids, titleOf) : []
			]);
			cards.push(...notes, ...codes, ...expenses, ...goals);
		}
		cards.sort((x, y) => y.sortKey.localeCompare(x.sortKey));
		return done(`Search${q ? `: "${q}"` : ''}`, cards.map(({ sortKey: _s, ...c }) => c), skipped);
	}
};

function done(heading: string, cards: Card[], skipped: unknown[]): ToolResult {
	const more = cards.length - SEARCH_CAP;
	const h = more > 0 ? `${heading} +${more} more — narrow by trip, type, or date` : heading;
	return result(h, cards.slice(0, SEARCH_CAP), {
		total: cards.length,
		skipped,
		...(cards.length ? {} : { note: 'No matches.' })
	});
}

async function searchItems(
	ctx: McpContext,
	a: SearchArgs,
	q: string,
	ids: string[],
	country: string | undefined,
	titleOf: Map<string, string>
) {
	const pb = ctx.pb;
	const filter = and(
		inTrips(pb, 'trip', ids),
		// phase.name/location: "the hotel in Lucerne" names the phase, not the item.
		q && textMatch(pb, ['title', 'description', 'location_name', 'location_address', 'flight_number', 'phase.name', 'phase.location'], q),
		a.type && pb.filter('type = {:v}', { v: a.type }),
		a.status && pb.filter('status = {:v}', { v: a.status }),
		a.booked !== undefined && pb.filter('booked = {:v}', { v: a.booked }),
		a.min_cost !== undefined && pb.filter('cost_estimate_usd >= {:v}', { v: a.min_cost }),
		a.max_cost !== undefined && pb.filter('cost_estimate_usd <= {:v}', { v: a.max_cost }),
		a.from && pb.filter('day.date >= {:v}', { v: `${a.from} 00:00:00.000Z` }),
		a.to && pb.filter('day.date <= {:v}', { v: `${a.to} 23:59:59.999Z` }),
		country && pb.filter('phase.country_code = {:c} || trip.countries ~ {:c}', { c: country })
	);
	const items = await pb.collection('items').getFullList<Item & { expand?: { day?: Day } }>({
		filter,
		fields: `${ITEM_FIELDS},expand.day.date`,
		expand: 'day',
		requestKey: null
	});
	return items.map((i) => {
		const date = toDateOnly(i.expand?.day?.date ?? '');
		const c = itemCard(i, date || undefined);
		return {
			...c,
			tag: titleOf.get(i.trip),
			lines: [...c.lines, date ? '' : 'idea (not on a day)', `id: ${i.id}`].filter(Boolean),
			sortKey: date || '0000'
		};
	});
}

async function searchDayNotes(ctx: McpContext, a: SearchArgs, q: string, ids: string[], titleOf: Map<string, string>) {
	const pb = ctx.pb;
	const days = await pb.collection('days').getFullList<Day>({
		filter: and(
			inTrips(pb, 'trip', ids),
			pb.filter('notes ~ {:q}', { q }),
			a.from && pb.filter('date >= {:v}', { v: `${a.from} 00:00:00.000Z` }),
			a.to && pb.filter('date <= {:v}', { v: `${a.to} 23:59:59.999Z` })
		),
		fields: 'id,trip,date,notes',
		requestKey: null
	});
	return days.map((d) => ({
		emoji: '📝',
		title: `Day notes · ${formatDayDate(toDateOnly(d.date))}`,
		tag: titleOf.get(d.trip),
		lines: [stripHtml(d.notes)],
		sortKey: toDateOnly(d.date)
	}));
}

async function searchCodes(ctx: McpContext, q: string, ids: string[], titleOf: Map<string, string>) {
	const pb = ctx.pb;
	const docs = await pb.collection('documents').getFullList({
		filter: and(inTrips(pb, 'trip', ids), pb.filter('kind = "code"'), textMatch(pb, ['code_label', 'code_value'], q)),
		fields: 'id,trip,item,code_label,code_value,expand.item.title,expand.item.id',
		expand: 'item',
		requestKey: null
	});
	return docs.map((d) => ({
		emoji: '🔖',
		title: (d.expand?.item?.title as string) ?? 'Confirmation code',
		tag: titleOf.get(d.trip),
		lines: [`${d.code_label || 'Code'}: ${d.code_value}`, d.item ? `id: ${d.item}` : ''].filter(Boolean),
		sortKey: '0001'
	}));
}

async function searchExpenses(ctx: McpContext, a: SearchArgs, q: string, ids: string[], titleOf: Map<string, string>) {
	const pb = ctx.pb;
	if (!q && !a.from && !a.to && a.min_cost === undefined && a.max_cost === undefined) return [];
	const rows = await pb.collection('expenses').getFullList<Expense>({
		filter: and(
			inTrips(pb, 'trip', ids),
			q && pb.filter('description ~ {:q}', { q }),
			a.min_cost !== undefined && pb.filter('amount_usd >= {:v}', { v: a.min_cost }),
			a.max_cost !== undefined && pb.filter('amount_usd <= {:v}', { v: a.max_cost }),
			a.from && pb.filter('date >= {:v}', { v: `${a.from} 00:00:00.000Z` }),
			a.to && pb.filter('date <= {:v}', { v: `${a.to} 23:59:59.999Z` })
		),
		fields: 'id,trip,amount_usd,description,date,category,expand.paid_by.display_name,expand.paid_by.placeholder_name',
		expand: 'paid_by',
		requestKey: null
	});
	return rows.map((e) => {
		const payer = e.expand?.paid_by;
		return {
			emoji: '💵',
			title: e.description || 'Expense',
			tag: titleOf.get(e.trip),
			lines: [
				`$${e.amount_usd.toFixed(2).replace(/\.00$/, '')} · ${e.category}`,
				[formatDayDate(toDateOnly(e.date)), payer ? `paid by ${payer.display_name || payer.placeholder_name}` : ''].filter(Boolean).join(' · ')
			],
			sortKey: toDateOnly(e.date)
		};
	});
}

async function searchGoals(ctx: McpContext, q: string, ids: string[], titleOf: Map<string, string>) {
	const pb = ctx.pb;
	const goals = await pb.collection('trip_goals').getFullList<TripGoal>({
		filter: and(inTrips(pb, 'trip', ids), textMatch(pb, ['title', 'description'], q)),
		fields: 'id,trip,title,description',
		requestKey: null
	});
	return goals.map((g) => ({
		emoji: '🎯',
		title: g.title,
		tag: titleOf.get(g.trip),
		lines: [stripHtml(g.description ?? ''), 'goal'].filter(Boolean),
		sortKey: '0002'
	}));
}
