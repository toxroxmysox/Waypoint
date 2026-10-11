import { z } from 'zod';
import type { Day, Expense, Item, TripMember, Vote } from '$lib/types';
import { toDateOnly } from '$lib/itinerary/multi-day';
import { tallyVotes } from '$lib/collaboration/voting';
import { myTrips } from '../context';
import { ITEM_FIELDS, itemCard } from '../day-data';
import { offTrip, result, stripHtml, type Card } from '../present';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

const NOT_FOUND = "No item with that id on a trip you're a member of.";

export const getItem: ToolDef = {
	name: 'get_item',
	title: 'Open an item',
	description:
		'Everything about one item: time, place, booking and cost, notes, confirmation codes, who is going, votes, ' +
		'linked expenses, and its comments (what members said about it). `item` is the id from a search or day card.',
	inputSchema: { item: z.string().describe('Item id') },
	async run(ctx, { item: id }: { item: string }) {
		const pb = ctx.pb;
		const item = await pb
			.collection('items')
			.getOne<Item & { expand?: { day?: Day } }>(id.trim(), { fields: `${ITEM_FIELDS},expand.day.date`, expand: 'day', requestKey: null })
			.catch(() => null);
		const ref = item && (await myTrips(ctx)).find((t) => t.trip.id === item.trip);
		if (!item || !ref) throw new Error(NOT_FOUND);
		if (!ref.open) return offTrip(ref.trip);

		const byItem = (f: string) => pb.filter(`${f} = {:i}`, { i: item.id });
		const [members, comments, codes, votes, expenses] = await Promise.all([
			loadMembers(ctx, item.trip),
			pb
				.collection('suggestions')
				.getFullList({
					filter: `${byItem('target_item')} && target_type = "comment" && status = "approved"`,
					fields: 'id,author,comment_text,created',
					sort: 'created',
					requestKey: null
				})
				.catch(() => []),
			pb.collection('documents').getFullList({
				filter: `${byItem('item')} && kind = "code"`,
				fields: 'id,code_label,code_value',
				sort: 'created',
				requestKey: null
			}),
			pb.collection('votes').getFullList<Vote>({ filter: byItem('item'), fields: 'id,member,value', requestKey: null }),
			pb.collection('expenses').getFullList<Expense>({
				filter: byItem('linked_item'),
				fields: 'id,amount_usd,description,paid_by,date',
				requestKey: null
			})
		]);
		const name = new Map(members.map((m: TripMember) => [m.id, memberName(m)]));
		const names = (ids: string[] | undefined) => (ids ?? []).map((i) => name.get(i) ?? 'former member').join(', ');

		const date = toDateOnly(item.expand?.day?.date ?? '');
		const main = itemCard(item, date || undefined);
		const facts = [
			item.location_address && item.location_address !== main.lines.at(-1) ? item.location_address : '',
			item.flight_number ? `Flight ${item.flight_number}` : '',
			item.cost_estimate_usd ? `Cost estimate $${item.cost_estimate_usd}` : '',
			`Status: ${item.status}${date ? '' : ' (idea, not on a day)'}`
		].filter(Boolean);
		const cards: Card[] = [{ ...main, tag: ref.trip.title, lines: [...main.lines, ...facts] }];

		const notes = stripHtml(item.description ?? '');
		if (notes) cards.push({ emoji: '🗒️', title: 'Notes', lines: [notes] });
		if (codes.length) cards.push({ emoji: '🔖', title: 'Confirmation codes', lines: codes.map((c) => `${c.code_label || 'Code'}: ${c.code_value}`) });
		if (item.assigned_to?.length || item.not_going?.length) {
			cards.push({
				emoji: '🙋',
				title: "Who's going",
				lines: [item.assigned_to?.length ? `Going: ${names(item.assigned_to)}` : '', item.not_going?.length ? `Not going: ${names(item.not_going)}` : ''].filter(Boolean)
			});
		}
		if (votes.length) {
			const { counts, total } = tallyVotes(votes);
			cards.push({
				emoji: '🗳️',
				title: `${total} vote${total === 1 ? '' : 's'}`,
				lines: votes.map((v) => `${name.get(v.member) ?? 'member'}: ${v.value}`).concat(
					Object.entries(counts)
						.filter(([, n]) => n)
						.map(([k, n]) => `${k} ×${n}`)
						.join(', ')
				)
			});
		}
		if (expenses.length) {
			cards.push({
				emoji: '💵',
				title: 'Paid',
				lines: expenses.map((e) => `$${e.amount_usd} · ${e.description || 'expense'} · paid by ${name.get(e.paid_by) ?? 'member'}`)
			});
		}
		for (const c of comments) {
			cards.push({ emoji: '💬', title: name.get(c.author) ?? 'member', tag: toDateOnly(c.created), lines: [c.comment_text] });
		}
		return result(item.title, cards, { id: item.id, trip: ref.trip.slug, date });
	}
};
