// Pure derivations behind the item page (#438; CARD_SYSTEM D12). No DOM, no I/O:
// layout is proven by screenshots, these are the rules they render.
import { getFieldConfig } from '$lib/itinerary/item-fields';
import { rowSub, type RowItemFields } from '$lib/itinerary/row';
import { titleCase } from '$lib/shell/format';
import { canSelfAssign, goingStateOf, type GoingState } from '$lib/itinerary/assignment';
import { goingPeople, type GoingPerson } from '$lib/trip-mode/hero';
import type { TripMember } from '$lib/types';
import type { ItemType } from '$lib/itinerary/types';

/** `Meal · Dinner`: the type and subtype in words. A subtype of "other" adds nothing and drops. */
export function itemTypeLine(type: ItemType, subtype: string | undefined): string {
	const label = getFieldConfig(type).labels.typeLabel;
	const sub = (subtype ?? '').trim();
	return !sub || sub === 'other' ? label : `${label} · ${titleCase(sub)}`;
}

/**
 * The Hero's time line: the date leads, then the text grammar (`Thu Oct 1 · 6:30p`;
 * a multi-day stay reads `Thu Oct 1–Sat Oct 3 · 2 nights`). The place is the
 * Hero's own line, so none is passed to `rowSub`.
 */
export function itemTimeText(item: Omit<RowItemFields, 'location_name'>, dayDate: string | undefined): string {
	return rowSub({ type: item.type, start_time: item.start_time, end_time: item.end_time, end_date: item.end_date }, { dayDate });
}

export interface GoingView {
	/** Going people first, then the struck not-going; never a no-answer member. */
	people: GoingPerson[];
	/** The viewer's own answer. */
	mine: GoingState;
	/** May the viewer answer: a non-viewer on a trip with more than one member. */
	canAnswer: boolean;
	/** `Are you going?` / `You're going` / `You're not going`; '' when they cannot answer. */
	line: string;
}

/** The Hero's Going row (#440, CARD_SYSTEM D6): who answered, and the viewer's own prompt. */
export function goingView(p: {
	item: { assigned_to?: string[] | null; not_going?: string[] | null };
	members: Array<Pick<TripMember, 'id'> & Partial<TripMember>>;
	myMemberId: string;
	role: string | undefined;
}): GoingView {
	const mine = p.myMemberId ? goingStateOf(p.item, p.myMemberId) : 'no_answer';
	const active = p.members.filter((m) => !m.removed_at).length;
	const canAnswer = !!p.myMemberId && canSelfAssign(p.role) && active > 1;
	const line = !canAnswer
		? ''
		: mine === 'going'
			? "You're going"
			: mine === 'not_going'
				? "You're not going"
				: 'Are you going?';
	return { people: goingPeople(p.item, p.members), mine, canAnswer, line };
}

/** `opentable.com` from a booking URL; the raw string when it is not one. */
export function hostLabel(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export interface DetailRow {
	key: 'cost' | 'payment' | 'booking' | 'cancellation' | 'phase';
	label: string;
	value: string;
	href?: string;
	/** Opens in a new tab. */
	external?: boolean;
	/** Quiet trailing text (`2 expenses`). */
	hint?: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/**
 * The rows of the Details card, in order: estimate, payment, booking link,
 * cancellation, phase. A row with nothing to say is absent. The payment row is
 * its own row and never reads the estimate (ADR-0014): `Paid $X` once any
 * expense is linked, else `Log payment` for roles that may log one.
 */
export function detailsRows(p: {
	item: { cost_estimate_usd?: number; reservation_url?: string; free_cancellation?: boolean };
	phaseName?: string;
	paid: { isPaid: boolean; total: number; count: number };
	canLogPayment: boolean;
	payHref: string;
	expensesHref: string;
}): DetailRow[] {
	const rows: DetailRow[] = [];
	const est = p.item.cost_estimate_usd ?? 0;
	if (est > 0) rows.push({ key: 'cost', label: 'Estimate', value: usd(est) });
	if (p.paid.isPaid) {
		rows.push({
			key: 'payment',
			label: 'Payment',
			value: `Paid ${usd(p.paid.total)}`,
			href: p.expensesHref,
			hint: `${p.paid.count} ${p.paid.count === 1 ? 'expense' : 'expenses'}`
		});
	} else if (p.canLogPayment) {
		rows.push({ key: 'payment', label: 'Payment', value: 'Log payment', href: p.payHref });
	}
	if (p.item.reservation_url) {
		rows.push({
			key: 'booking',
			label: 'Booking',
			value: hostLabel(p.item.reservation_url),
			href: p.item.reservation_url,
			external: true
		});
	}
	if (p.item.free_cancellation) rows.push({ key: 'cancellation', label: 'Cancellation', value: 'Free cancellation' });
	if (p.phaseName) rows.push({ key: 'phase', label: 'Phase', value: p.phaseName });
	return rows;
}

export type AddKind = 'document' | 'checklist';

/**
 * Which entries the one-line add shows for empty sections: `+ Document` while
 * there are no documents (and the section has not been opened), `+ Checklist`
 * while there is no checklist. Each needs its own permission, so a viewer gets
 * no line at all.
 */
export function addLine(p: {
	docCount: number;
	hasChecklist: boolean;
	canUpload: boolean;
	canEditChecklist: boolean;
	docsOpen: boolean;
}): AddKind[] {
	const out: AddKind[] = [];
	if (p.docCount === 0 && !p.docsOpen && p.canUpload) out.push('document');
	if (!p.hasChecklist && p.canEditChecklist) out.push('checklist');
	return out;
}

const stamp = (c: string) => new Date(c.replace(' ', 'T')).getTime();

/** Newest first by `created` (PB `YYYY-MM-DD HH:MM:SS.sssZ` or ISO); stable, non-mutating. */
export function newestFirst<T extends { created: string }>(comments: T[]): T[] {
	return comments
		.map((c, i) => ({ c, i, t: stamp(c.created) }))
		.sort((a, b) => (b.t - a.t) || a.i - b.i)
		.map((x) => x.c);
}
