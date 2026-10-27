// #503 / ADR-0025 §2 — tells the AI what it may change, in plain terms, so it
// doesn't guess at fields (story 36). With a trip: the ids its ops need (members
// by name, phases, days), scrubbed like every other output.
import { z } from 'zod';
import { resolveTrip } from '../context';
import { offTrip, result, ymd, type Card } from '../present';
import { WRITABLE, allowedValues } from '../writes/registry';
import { loadMembers, memberName } from './get-trip';
import type { ToolDef } from './types';

const HOW =
	'Change things with propose_changes: ops are {action: "create", collection, data, ref?} or ' +
	'{action: "update", collection, id, data}. Dates are YYYY-MM-DD and times HH:MM (24h), trip-local. ' +
	'On items, `date` places it on that day; leave it out for an idea. Use "$ref:<name>" to point at a record ' +
	'created earlier in the same proposal. Author fields are filled in for you. Nothing is deleted except by undo.';

export const describe: ToolDef = {
	name: 'describe',
	title: 'What can I change?',
	description:
		'What Waypoint lets you change for the user, in plain terms, and how to write ops for propose_changes. ' +
		'Pass `trip` to also get its members (name → id), phases and days, which ops refer to by id.',
	inputSchema: { trip: z.string().optional().describe('Trip slug, id, or name (optional)') },
	write: true,
	async run(ctx, { trip }: { trip?: string }) {
		const collections = Object.entries(WRITABLE).map(([name, spec]) => {
			// #520 — the choices a select field takes, so the AI doesn't guess at them.
			const values = Object.fromEntries(
				Object.entries(spec.fields)
					.map(([f, hint]) => [f, allowedValues(hint)] as const)
					.filter((e): e is readonly [string, string[]] => !!e[1])
			);
			return {
				name,
				label: spec.label,
				fields: spec.fields,
				...(Object.keys(values).length ? { values } : {}),
				...(spec.updateOnly ? { only: 'update' } : spec.createOnly ? { only: 'create' } : {})
			};
		});
		const cards: Card[] = collections.map((c) => ({
			emoji: '✏️',
			title: c.label,
			tag: c.name,
			lines: [
				Object.keys(c.fields)
					.map((f) => (c.values?.[f] ? `${f} (${c.values[f].join(' | ')})` : f))
					.join(', ') + (c.only ? ` (${c.only} only)` : '')
			]
		}));
		const extra: Record<string, unknown> = { collections, how: HOW, note: HOW };
		if (!trip) return result('What I can change', cards, extra);

		const ref = await resolveTrip(ctx, trip);
		// ADR-0024 §2: an AI-off trip shows only its name and dates, here too.
		if (!ref.open) return offTrip(ref.trip);
		const t = ref.trip;
		const [members, phases, days] = await Promise.all([
			loadMembers(ctx, t.id),
			ctx.pb.collection('phases').getFullList({
				filter: ctx.pb.filter('trip = {:t}', { t: t.id }),
				fields: 'id,name,start_date,end_date',
				sort: 'start_date',
				requestKey: null
			}),
			ctx.pb.collection('days').getFullList({
				filter: ctx.pb.filter('trip = {:t}', { t: t.id }),
				fields: 'id,date',
				sort: 'date',
				requestKey: null
			})
		]);
		Object.assign(extra, {
			trip: {
				id: t.id,
				slug: t.slug,
				title: t.title,
				start: ymd(t.start_date),
				end: ymd(t.end_date),
				your_role: ref.role,
				ai_can_change: ref.canWrite
			},
			members: members.map((m) => ({ name: memberName(m), id: m.id, role: m.role })),
			phases: phases.map((p) => ({
				name: p.name,
				id: p.id,
				start: ymd(p.start_date),
				end: ymd(p.end_date)
			})),
			days: days.map((d) => ({ date: ymd(d.date), id: d.id }))
		});
		cards.unshift({
			emoji: '🧭',
			title: t.title,
			tag: ref.role,
			lines: [
				`Members: ${members.map((m) => `${memberName(m)} (${m.id})`).join(', ')}`,
				`Phases: ${phases.map((p) => `${p.name} ${ymd(p.start_date)} (${p.id})`).join(', ') || 'none'}`,
				ref.canWrite ? 'You can propose changes here.' : 'You can’t change this trip.'
			]
		});
		return result(`What I can change in ${t.title}`, cards, extra);
	}
};
