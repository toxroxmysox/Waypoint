// #503 / ADR-0025 §4 — the preview card: one card per planned change, changed
// fields old → new, the real outcome, and any cascade first as its own card.
// Shown in the app's words: times as 9:40 am, days as Mon 3 Nov, members and
// phases by name. Scrubbed like every other output (no emails, no file URLs).
import type { ItemType, Trip } from '$lib/types';
import { formatCalendarDate } from '$lib/shell/format';
import { EMOJI, scrub, type Card } from '../present';
import { WRITABLE } from './registry';
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

/** Names for the ids a change refers to (members, phases, days). */
export interface Labels {
	members?: Map<string, string>;
	phases?: Map<string, string>;
	days?: Map<string, string>;
}

/** `9:40 am` from a stored time or a bare HH:MM. '' for ''. */
export function clockAm(t: string): string {
	const m = /(\d{1,2}):(\d{2})/.exec((t ?? '').includes(' ') ? t.split(' ')[1] : t.includes('T') ? t.split('T')[1] : t ?? '');
	if (!m) return '';
	const h = parseInt(m[1], 10);
	return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'pm' : 'am'}`;
}

/** `Mon 3 Nov` from 'YYYY-MM-DD' or a stored day. */
export function dayText(d: string): string {
	if (!d) return '';
	const p = (o: Intl.DateTimeFormatOptions) => formatCalendarDate(d, o);
	return `${p({ weekday: 'short' })} ${p({ day: 'numeric' })} ${p({ month: 'short' })}`;
}

export const rangeText = (r: [string, string] | null) => (r ? `${dayText(r[0])} → ${dayText(r[1])}` : 'none');

const sentence = (f: string) => {
	const s = f.replace(/_usd$/, '').replace(/_/g, ' ');
	return s.charAt(0).toUpperCase() + s.slice(1);
};

const MEMBER_FIELDS = new Set(['paid_by', 'booked_by', 'assigned_to', 'not_going', 'assignee', 'checked_by', 'from_member', 'to_member', 'members', 'created_by', 'member', 'author', 'champion', 'uploaded_by']);

function show(collection: string, field: string, v: unknown, labels: Labels): string {
	if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return '—';
	const spec = WRITABLE[collection];
	if (spec?.timeFields?.includes(field)) return clockAm(String(v));
	if (spec?.dateFields?.includes(field)) return dayText(String(v));
	if (field === spec?.dayField) return dayText(labels.days?.get(String(v)) ?? '') || 'a day';
	if (field === 'phase') return labels.phases?.get(String(v)) ?? 'a phase';
	if (MEMBER_FIELDS.has(field)) {
		const ids = Array.isArray(v) ? v : [v];
		return ids.map((id) => labels.members?.get(String(id)) ?? 'a member').join(', ');
	}
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	if (typeof v === 'number') return field.endsWith('_usd') ? `$${v}` : String(v);
	if (field === 'confirmation_codes' && Array.isArray(v)) {
		return v.map((c: { label?: string; value?: string }) => `${c.label || 'Code'}: ${c.value ?? ''}`).join(', ');
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
	const byTo = new Map<string, string[]>();
	for (const m of c.moves) byTo.set(m.to, [...(byTo.get(m.to) ?? []), m.title]);
	for (const [to, titles] of byTo) {
		lines.push(`${titles.length} item${titles.length === 1 ? '' : 's'} move${titles.length === 1 ? 's' : ''} to ${to}: ${titles.join(', ')}`);
	}
	return { emoji: '🗓️', title: 'What else changes', lines };
}

export function previewCards(changes: PlannedChange[], cascade: Cascade | null, trip: Trip, labels: Labels = {}): Card[] {
	const cards: Card[] = cascade ? [cascadeCard(cascade)] : [];
	for (const ch of changes) {
		const rows = Object.keys(ch.after)
			.filter((f) => f !== 'trip' && !(ch.action === 'create' && WRITABLE[ch.collection]?.stamp?.[f]))
			.map((f) => ({
				field: f === WRITABLE[ch.collection]?.dayField ? 'Day' : sentence(f),
				from: ch.before ? show(ch.collection, f, ch.before[f], labels) : '',
				to: show(ch.collection, f, ch.after[f], labels)
			}));
		const type = (ch.after.type as ItemType | undefined) ?? undefined;
		cards.push({
			emoji: ch.collection === 'items' && type && EMOJI[type] ? EMOJI[type] : COLLECTION_EMOJI[ch.collection] ?? '✏️',
			title: ch.collection === 'trips' ? trip.title : ch.title,
			tag: ch.action === 'create' ? (ch.via === 'suggestion' ? 'suggestion' : 'new') : 'edit',
			lines: [...rows.map((r) => (r.from ? `${r.field}: ${r.from} → ${r.to}` : `${r.field}: ${r.to}`)), OUTCOME_TEXT[ch.outcome]],
			changes: rows
		});
	}
	return scrub(cards);
}
