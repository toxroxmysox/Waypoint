// #503 / ADR-0025 §4 — the preview card: one card per planned change, changed
// fields old → new, the real outcome, and any cascade first as its own card.
// Shown in the app's words: times as 9:40 am, days as Mon 3 Nov, members and
// phases by name. Scrubbed like every other output (no emails, no file URLs).
import type { ItemType, Trip } from '$lib/types';
import { formatCalendarDate } from '$lib/shell/format';
import { EMOJI, scrub, type Card } from '../present';
import { WRITABLE, allowedValues } from './registry';
import type { Cascade, Outcome, PlannedChange } from './types';

export const OUTCOME_TEXT: Record<Outcome, string> = {
	saved: 'Saved',
	suggested: 'Sent to the owners as a suggestion',
	idea: 'Added as an idea'
};

const COLLECTION_EMOJI: Record<string, string> = {
	trips: '🧳',
	phases: '🗺️',
	days: '🗒️',
	expenses: '💵',
	settlements: '🤝',
	trip_budgets: '💰',
	money_units: '👥',
	checklists: '📋',
	tasks: '☑️',
	checklist_items: '☑️',
	votes: '🗳️',
	goal_votes: '🗳️',
	scenario_votes: '🗳️',
	suggestion_votes: '🗳️',
	trip_goals: '🎯',
	scenarios: '💡',
	scenario_points: '💬',
	availability: '📅',
	memories: '📸',
	documents: '🔖'
};

/** Names for the ids a change refers to (members, phases, days, parent records). */
export interface Labels {
	members?: Map<string, string>;
	phases?: Map<string, string>;
	days?: Map<string, string>;
	/** #520 — titles of the items, lists, goals, scenarios and suggestions a change points at. */
	records?: Map<string, string>;
}

/** #520 — relation fields that point at another record, and what to call one we can't name. */
export const RECORD_FIELDS: Record<string, { collection: string; unknown: string }> = {
	item: { collection: 'items', unknown: 'an item' },
	linked_item: { collection: 'items', unknown: 'an item' },
	parent_item: { collection: 'items', unknown: 'an item' },
	items: { collection: 'items', unknown: 'an item' },
	keystones: { collection: 'items', unknown: 'an item' },
	checklist: { collection: 'checklists', unknown: 'a list' },
	goal: { collection: 'trip_goals', unknown: 'a goal' },
	scenario: { collection: 'scenarios', unknown: 'a scenario' },
	fork_of: { collection: 'scenarios', unknown: 'a scenario' },
	suggestion: { collection: 'suggestions', unknown: 'a suggestion' }
};

const usd = (n: unknown) => {
	const v = Number(n);
	return `$${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

/** `9:40 am` from a stored time or a bare HH:MM. '' for ''. */
export function clockAm(t: string): string {
	const m = /(\d{1,2}):(\d{2})/.exec(
		(t ?? '').includes(' ') ? t.split(' ')[1] : t.includes('T') ? t.split('T')[1] : (t ?? '')
	);
	if (!m) return '';
	const h = parseInt(m[1], 10);
	return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'pm' : 'am'}`;
}

/** `Mon 3 Nov` from 'YYYY-MM-DD' or a stored day; `Sat 2 Jan 2027` when outside `year`. */
export function dayText(d: string, year?: string): string {
	if (!d) return '';
	const p = (o: Intl.DateTimeFormatOptions) => formatCalendarDate(d, o);
	const base = `${p({ weekday: 'short' })} ${p({ day: 'numeric' })} ${p({ month: 'short' })}`;
	return year && d.slice(0, 4) !== year ? `${base} ${d.slice(0, 4)}` : base;
}

export const rangeText = (r: [string, string] | null) =>
	r ? `${dayText(r[0])} → ${dayText(r[1])}` : 'none';

const sentence = (f: string) => {
	const s = f.replace(/_usd$/, '').replace(/_/g, ' ');
	return s.charAt(0).toUpperCase() + s.slice(1);
};

const MEMBER_FIELDS = new Set([
	'paid_by',
	'booked_by',
	'assigned_to',
	'not_going',
	'assignee',
	'checked_by',
	'from_member',
	'to_member',
	'members',
	'created_by',
	'member',
	'author',
	'champion',
	'uploaded_by'
]);

function show(
	collection: string,
	field: string,
	v: unknown,
	labels: Labels,
	year?: string
): string {
	if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '—';
	const spec = WRITABLE[collection];
	if (spec?.timeFields?.includes(field)) return clockAm(String(v));
	if (spec?.dateFields?.includes(field)) return dayText(String(v), year);
	if (field === spec?.dayField) return dayText(labels.days?.get(String(v)) ?? '', year) || 'a day';
	if (field === 'phase') return labels.phases?.get(String(v)) ?? 'a phase';
	if (MEMBER_FIELDS.has(field)) {
		const ids = Array.isArray(v) ? v : [v];
		return ids.map((id) => labels.members?.get(String(id)) ?? 'a member').join(', ');
	}
	if (RECORD_FIELDS[field]) {
		const ids = Array.isArray(v) ? v : [v];
		return ids
			.map((id) => labels.records?.get(String(id)) ?? RECORD_FIELDS[field].unknown)
			.join(', ');
	}
	const member = (id: string) => labels.members?.get(id) ?? 'a member';
	if (field === 'split_data' && typeof v === 'object') {
		const d = v as { members?: string[]; amounts?: Record<string, number> };
		if (Array.isArray(d.members)) return `Equally: ${d.members.map(member).join(', ')}`;
		if (d.amounts)
			return Object.entries(d.amounts)
				.map(([id, n]) => `${member(id)} ${usd(n)}`)
				.join(', ');
	}
	if (field === 'categories' && Array.isArray(v)) {
		return v
			.map(
				(c: { category?: string; mode?: string; total?: number }) =>
					`${sentence(c.category ?? 'other')} ${usd(c.total ?? 0)}${c.mode === 'per_day' ? '/day' : ' total'}`
			)
			.join(', ');
	}
	if (field === 'phase_sketch' && Array.isArray(v)) {
		return v
			.map(
				(p: { name?: string; nights?: number }) =>
					`${p.name ?? 'a phase'} ${p.nights ?? 0} night${p.nights === 1 ? '' : 's'}`
			)
			.join(', ');
	}
	if (typeof v === 'string' && allowedValues(spec?.fields[field] ?? '')?.includes(v))
		return sentence(v);
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	if (typeof v === 'number') return field.endsWith('_usd') ? `$${v}` : String(v);
	if (field === 'confirmation_codes' && Array.isArray(v)) {
		return v
			.map((c: { label?: string; value?: string }) => `${c.label || 'Code'}: ${c.value ?? ''}`)
			.join(', ');
	}
	if (typeof v === 'object') {
		const s = JSON.stringify(v);
		return s.length > 80 ? `${s.slice(0, 77)}…` : s;
	}
	return String(v).replace(/<[^>]+>/g, '');
}

/** One outcome line for the whole proposal, distinct outcomes joined. */
export function outcomeLine(changes: PlannedChange[]): string {
	return [...new Set(changes.map((c) => OUTCOME_TEXT[c.outcome]))].join(' · ');
}

function cascadeCard(c: Cascade): Card {
	const lines: string[] = [];
	if (c.tripAfter) lines.push(`Trip: ${rangeText(c.tripBefore)} becomes ${rangeText(c.tripAfter)}`);
	for (const d of c.daysRemoved) lines.push(`${dayText(d)} removed`);
	for (const d of c.daysAdded) lines.push(`${dayText(d)} added`);
	for (const p of c.phases) {
		const same = p.before && p.after && p.before[0] === p.after[0] && p.before[1] === p.after[1];
		if (same) continue;
		if (!p.after) lines.push(`${p.name} merges into the phase before it`);
		else if (!p.before) lines.push(`${p.name}: new, ${rangeText(p.after)}`);
		else lines.push(`${p.name}: ${rangeText(p.after)} (was ${rangeText(p.before)})`);
	}
	// A merged phase's items move; a dropped day's items lose the day and become ideas.
	const groups = new Map<string, { to: string; idea: boolean; titles: string[] }>();
	for (const m of c.moves) {
		const idea = /^\d{4}-\d{2}-\d{2}$/.test(m.from);
		const key = `${idea}|${m.to}`;
		const g = groups.get(key) ?? { to: m.to, idea, titles: [] };
		g.titles.push(m.title);
		groups.set(key, g);
	}
	for (const g of groups.values()) {
		const n = g.titles.length;
		const what = g.idea
			? `become${n === 1 ? 's an idea' : ' ideas'} in`
			: `move${n === 1 ? 's' : ''} to`;
		lines.push(`${n} item${n === 1 ? '' : 's'} ${what} ${g.to}: ${g.titles.join(', ')}`);
	}
	return { emoji: '🗓️', title: 'What else changes', lines };
}

export function previewCards(
	changes: PlannedChange[],
	cascade: Cascade | null,
	trip: Trip,
	labels: Labels = {}
): Card[] {
	const year = (trip.start_date ?? '').slice(0, 4) || undefined;
	const cards: Card[] = cascade ? [cascadeCard(cascade)] : [];
	for (const ch of changes) {
		const rows = Object.keys(ch.after)
			.filter(
				(f) => f !== 'trip' && !(ch.action === 'create' && WRITABLE[ch.collection]?.stamp?.[f])
			)
			.map((f) => ({
				field: f === WRITABLE[ch.collection]?.dayField ? 'Day' : sentence(f),
				from: ch.before ? show(ch.collection, f, ch.before[f], labels, year) : '',
				to: show(ch.collection, f, ch.after[f], labels, year)
			}));
		const type = (ch.after.type as ItemType | undefined) ?? undefined;
		cards.push({
			emoji:
				ch.collection === 'items' && type && EMOJI[type]
					? EMOJI[type]
					: (COLLECTION_EMOJI[ch.collection] ?? '✏️'),
			title: ch.collection === 'trips' ? trip.title : ch.title,
			tag: ch.action === 'create' ? (ch.via === 'suggestion' ? 'suggestion' : 'new') : 'edit',
			lines: [
				...rows.map((r) => (r.from ? `${r.field}: ${r.from} → ${r.to}` : `${r.field}: ${r.to}`)),
				OUTCOME_TEXT[ch.outcome]
			],
			changes: rows
		});
	}
	return scrub(cards);
}

/** #520 — Account → Recent AI changes: which records one AI Change touched, in a few words. */
export function changeSummary(changes: { title?: string; committed?: boolean }[]): string {
	const done = changes.filter((c) => c.committed !== false);
	if (!done.length) return 'No changes';
	const titles = [...new Set(done.map((c) => c.title).filter((t): t is string => !!t))];
	if (!titles.length) return `${done.length} change${done.length === 1 ? '' : 's'}`;
	const rest = titles.length - 2;
	return rest > 0 ? `${titles.slice(0, 2).join(', ')} and ${rest} more` : titles.join(', ');
}
