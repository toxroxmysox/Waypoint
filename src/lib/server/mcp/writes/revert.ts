// #503 / ADR-0025 §5 — undo an AI Change, from chat ("undo that") or Account →
// Recent AI changes. Best-effort and never clobbering (story 27): a field is put
// back only if it still holds what the AI wrote; a record the AI created is
// removed; a traveler's suggestion is withdrawn while still pending. Runs with
// the user's own PB client, so PB rules apply as in the app; only the private
// audit row (reverted_at) and a pending suggestion's withdrawal (suggestions
// have no member delete rule) go through the superuser.
import type PocketBase from 'pocketbase';
import { adminPb } from '../admin-pb';
import { pbErrorText } from './commit';
import type { CommittedChange } from './types';

export const ALREADY_UNDONE = 'Already undone.';
const CASCADE_NOTE =
	'phases re-tile from the restored dates; ideas moved earlier stay where they are';

const norm = (v: unknown) =>
	v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);

/** What undoing one change means, given the record as it is now. Pure. */
export function inverseOf(
	change: CommittedChange,
	current: Record<string, unknown> | null
): { data: Record<string, unknown> | null; delete: boolean; skipped: string[] } {
	if (!change.committed) return { data: null, delete: false, skipped: [] };
	if (!current) return { data: null, delete: false, skipped: [`${change.title} was deleted`] };
	if (change.via === 'suggestion') {
		return current.status === 'pending'
			? { data: null, delete: true, skipped: [] }
			: {
					data: null,
					delete: false,
					skipped: [
						`${change.title}: already ${current.status || 'handled'} — remove the item in the app`
					]
				};
	}
	if (change.action === 'create') {
		// Story 27: someone has built on it since → leave it, say so.
		const edited = Object.entries(change.after).some(
			([f, v]) => f in current && norm(current[f]) !== norm(v)
		);
		return edited
			? {
					data: null,
					delete: false,
					skipped: [
						`${change.title} was changed since — remove it in the app if you still want it gone`
					]
				}
			: { data: null, delete: true, skipped: [] };
	}
	const data: Record<string, unknown> = {};
	const skipped: string[] = [];
	for (const [f, v] of Object.entries(change.after)) {
		if (norm(current[f]) === norm(v)) data[f] = change.before?.[f] ?? '';
		else skipped.push(`${change.title}: ${f.replace(/_/g, ' ')} changed since`);
	}
	return { data: Object.keys(data).length ? data : null, delete: false, skipped };
}

async function hasOthersWork(pb: PocketBase, itemId: string): Promise<boolean> {
	const by = (f: string) => pb.filter(`${f} = {:i}`, { i: itemId });
	const counts = await Promise.all(
		[
			pb.collection('suggestions').getList(1, 1, {
				filter: `${by('target_item')} && target_type = "comment"`,
				fields: 'id',
				requestKey: null
			}),
			pb.collection('votes').getList(1, 1, { filter: by('item'), fields: 'id', requestKey: null }),
			pb
				.collection('documents')
				.getList(1, 1, { filter: by('item'), fields: 'id', requestKey: null }),
			pb
				.collection('expenses')
				.getList(1, 1, { filter: by('linked_item'), fields: 'id', requestKey: null })
		].map((p) => p.then((r) => r.totalItems).catch(() => 0))
	);
	return counts.some((n) => n > 0);
}

const touchesDates = (c: CommittedChange) =>
	(c.collection === 'trips' && ('start_date' in c.after || 'end_date' in c.after)) ||
	(c.collection === 'phases' && 'start_date' in c.after);

/** Undo one of the user's AI Changes (their latest un-undone one without an id). */
export async function revertChange(
	pb: PocketBase,
	userId: string,
	changeId?: string,
	/** Chat undo is an AI write: the tool passes the trip-switch check (review I2). The app's Revert button doesn't. */
	gate?: (tripId: string) => Promise<void>
): Promise<{ restored: string[]; skipped: string[]; quote: string; already?: true }> {
	// The user's own client: the ai_changes rules show only their own rows, so
	// "only the author can revert" is PB's rule, not a check here.
	const row = changeId
		? await pb
				.collection('ai_changes')
				.getOne(changeId.trim(), { requestKey: null })
				.catch(() => null)
		: await pb
				.collection('ai_changes')
				.getFirstListItem(pb.filter('user = {:u} && reverted_at = ""', { u: userId }), {
					sort: '-created',
					requestKey: null
				})
				.catch(() => null);
	if (!row || row.user !== userId)
		throw new Error(
			changeId ? 'No AI change of yours with that id.' : 'No AI change of yours to undo.'
		);
	const quote = String(row.quote ?? '');
	if (row.reverted_at) return { restored: [], skipped: [], quote, already: true };
	if (gate) await gate(String(row.trip));

	const restored: string[] = [];
	const skipped: string[] = [];
	const changes = ((row.changes as CommittedChange[]) ?? []).slice().reverse();
	for (const c of changes) {
		const target =
			c.via === 'suggestion'
				? { collection: 'suggestions', id: c.suggestionId ?? '' }
				: { collection: c.collection, id: c.id };
		const current = target.id
			? await pb
					.collection(target.collection)
					.getOne(target.id, { requestKey: null })
					.then((r) => r as Record<string, unknown>)
					.catch(() => null)
			: null;
		const inv = inverseOf(c, current);
		// Story 27: an added item others have since commented on, voted on or
		// attached something to is theirs too now; leave it.
		if (
			inv.delete &&
			c.via === 'record' &&
			c.collection === 'items' &&
			(await hasOthersWork(pb, c.id))
		) {
			skipped.push(
				`${c.title} has comments or votes now — remove it in the app if you still want it gone`
			);
			continue;
		}
		skipped.push(...inv.skipped);
		try {
			if (inv.delete && c.via === 'suggestion') {
				await (await adminPb()).collection('suggestions').delete(target.id, { requestKey: null });
				restored.push(`${c.title}: suggestion withdrawn`);
			} else if (inv.delete) {
				await pb.collection(c.collection).delete(c.id, { requestKey: null });
				restored.push(`${c.title} removed`);
			} else if (inv.data) {
				await pb.collection(c.collection).update(c.id, inv.data, { requestKey: null });
				restored.push(
					`${c.title}: ${Object.keys(inv.data)
						.map((f) => f.replace(/_/g, ' '))
						.join(', ')} restored`
				);
			}
		} catch (err) {
			skipped.push(`${c.title}: ${pbErrorText(err)}`);
		}
	}
	if ((row.changes as CommittedChange[] | undefined)?.some(touchesDates))
		skipped.push(CASCADE_NOTE);

	await (await adminPb())
		.collection('ai_changes')
		.update(
			row.id,
			{ reverted_at: new Date().toISOString().replace('T', ' ') },
			{ requestKey: null }
		);
	return { restored, skipped, quote };
}
